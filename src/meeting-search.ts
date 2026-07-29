import {
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
 */
export async function meetingSearch(
  input: MeetingSearchInput,
  map: MapProvider,
): Promise<MeetingSearchResult> {
  if (input.participants.length < 2) {
    throw new Error("MeetingSearch requires at least two Participants");
  }

  const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const centers = searchCenters(input.participants.map((p) => p.coordinates));

  const found: Branch[] = [];
  for (const near of centers) {
    const batch = await map.searchBranches({
      brand: input.brand,
      near,
      radiusMeters,
    });
    found.push(...batch);
  }

  const candidates = dedupeBranches(found);
  if (candidates.length === 0) {
    return {
      kind: "empty_candidate_set",
      message:
        "Empty candidate set: no Branches found for this Brand within the search radius. Try increasing the radius or changing the Brand.",
    };
  }

  const entries: RankingEntry[] = [];
  for (const branch of candidates) {
    const distances: Record<string, number> = {};
    for (const participant of input.participants) {
      distances[participant.id] = await map.drivingDistance(
        participant.coordinates,
        branch.coordinates,
      );
    }
    const values = Object.values(distances);
    const score =
      input.objective === "total_distance"
        ? values.reduce((sum, d) => sum + d, 0)
        : Math.max(...values);
    entries.push({ branch, distances, score });
  }

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
