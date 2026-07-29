import { mapPool } from "./concurrency.js";
import {
  DEFAULT_AMAP_CONCURRENCY,
  DEFAULT_RADIUS_METERS,
  type Branch,
  type Coordinates,
  type MapProvider,
  type MeetingSearchInput,
  type MeetingSearchResult,
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
  const centers = searchCenters(input.participants.map((p) => p.coordinates));

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

  const pairJobs = candidates.flatMap((branch) =>
    input.participants.map((participant) => ({ branch, participant })),
  );
  const pairDistances = await mapPool(pairJobs, concurrency, ({ branch, participant }) =>
    map.drivingDistance(participant.coordinates, branch.coordinates),
  );

  const distanceByKey = new Map<string, number>();
  for (const [i, job] of pairJobs.entries()) {
    distanceByKey.set(`${job.branch.id}:${job.participant.id}`, pairDistances[i]!);
  }

  const entries: RankingEntry[] = candidates.map((branch) => {
    const distances: Record<string, number> = {};
    for (const participant of input.participants) {
      distances[participant.id] = distanceByKey.get(
        `${branch.id}:${participant.id}`,
      )!;
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
