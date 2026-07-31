import { mapPool } from "./concurrency.js";
import {
  DEFAULT_AMAP_CONCURRENCY,
  DEFAULT_RADIUS_METERS,
  type Branch,
  type Coordinates,
  type MapProvider,
  type MeetingSearchInput,
  type MeetingSearchResult,
  type Participant,
  type RankingEntry,
} from "./types.js";

/**
 * MeetingSearch seam: build the Candidate set via MapProvider, score by
 * Proximity objective, return a Ranking or Empty candidate set error.
 * Map calls run with bounded concurrency (default 3).
 */
export async function meetingSearch(
  input: MeetingSearchInput,
  map: MapProvider,
): Promise<MeetingSearchResult> {
  if (input.participants.length < 2) {
    throw new Error("MeetingSearch requires at least two Participants");
  }

  const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const concurrency = input.concurrency ?? DEFAULT_AMAP_CONCURRENCY;
  const centers = dedupeCoordinates(
    searchCenters(input.participants.map((p) => p.coordinates)),
  );

  const batches = await mapPool(centers, concurrency, (near) =>
    map.searchBranches({
      brand: input.brand,
      near,
      radiusMeters,
    }),
  );
  const found: Branch[] = batches.flat();

  const candidates = dedupeBranches(found);
  if (candidates.length === 0) {
    return {
      kind: "empty_candidate_set",
      message:
        "Empty candidate set: no Branches found for this Brand within the search radius. Try increasing the radius or changing the Brand.",
    };
  }

  // One driving call per unique (Participant, Branch) coordinate pair.
  // Co-located Participants share a call; a Branch at a Participant's own
  // point is distance 0 without calling 高德 at all.
  const pairJobs: Array<{ branch: Branch; participant: Participant }> = [];
  const pairIndex = new Map<string, number>();
  for (const branch of candidates) {
    for (const participant of input.participants) {
      const fromKey = coordinateKey(participant.coordinates);
      const toKey = coordinateKey(branch.coordinates);
      if (fromKey === toKey) continue;
      const pairKey = `${fromKey}->${toKey}`;
      if (!pairIndex.has(pairKey)) {
        pairIndex.set(pairKey, pairJobs.length);
        pairJobs.push({ branch, participant });
      }
    }
  }
  const pairDistances = await mapPool(pairJobs, concurrency, ({ branch, participant }) =>
    map.drivingDistance(participant.coordinates, branch.coordinates),
  );

  const distanceByPair = new Map<string, number>();
  for (const [i, job] of pairJobs.entries()) {
    distanceByPair.set(
      `${coordinateKey(job.participant.coordinates)}->${coordinateKey(job.branch.coordinates)}`,
      pairDistances[i]!,
    );
  }

  const entries: RankingEntry[] = candidates.map((branch) => {
    const distances: Record<string, number> = {};
    for (const participant of input.participants) {
      const fromKey = coordinateKey(participant.coordinates);
      const toKey = coordinateKey(branch.coordinates);
      distances[participant.id] =
        fromKey === toKey
          ? 0
          : distanceByPair.get(`${fromKey}->${toKey}`)!;
    }
    const values = Object.values(distances);
    const score =
      input.objective === "total_distance"
        ? values.reduce((sum, d) => sum + d, 0)
        : Math.max(...values);
    return { branch, distances, score };
  });

  entries.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.branch.id.localeCompare(b.branch.id);
  });

  return {
    objective: input.objective,
    entries,
    recommendation: entries[0]!,
  };
}

function searchCenters(coords: Coordinates[]): Coordinates[] {
  const center = geometricCenter(coords);
  return [...coords, center];
}

function geometricCenter(coords: Coordinates[]): Coordinates {
  const lat =
    coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const lng =
    coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
  return { lat, lng };
}

function dedupeBranches(branches: Branch[]): Branch[] {
  const byId = new Map<string, Branch>();
  for (const branch of branches) {
    if (!byId.has(branch.id)) {
      byId.set(branch.id, branch);
    }
  }
  return [...byId.values()];
}

/** Drop search centers that are effectively the same point (~0.1 m). */
function dedupeCoordinates(coords: Coordinates[]): Coordinates[] {
  const seen = new Set<string>();
  const unique: Coordinates[] = [];
  for (const c of coords) {
    const key = coordinateKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique;
}

/** Round to 6 decimals (~0.1 m) so near-identical points share API results. */
function coordinateKey(c: Coordinates): string {
  return `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
}
