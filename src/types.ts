/** Domain types for MeetingSearch. Vocabulary matches CONTEXT.md. */

export type Coordinates = {
  lat: number;
  lng: number;
};

export type Participant = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

export type Branch = {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinates;
};

export type ProximityObjective = "total_distance" | "minimax";

export type RankingEntry = {
  branch: Branch;
  /** Driving Distance in meters, keyed by Participant id. */
  distances: Record<string, number>;
  /** Objective score: sum (total_distance) or max (minimax). */
  score: number;
};

export type Ranking = {
  objective: ProximityObjective;
  entries: RankingEntry[];
  /** Top of the Ranking — the meeting recommendation. */
  recommendation: RankingEntry;
};

export type EmptyCandidateSet = {
  kind: "empty_candidate_set";
  message: string;
};

export type MeetingSearchResult = Ranking | EmptyCandidateSet;

export function isEmptyCandidateSet(
  result: MeetingSearchResult,
): result is EmptyCandidateSet {
  return "kind" in result && result.kind === "empty_candidate_set";
}

/**
 * Map traffic seam. Injectable so MeetingSearch can run with a fake
 * without live 高德 (ADR 0001 still applies for production adapters).
 */
export type MapProvider = {
  searchBranches(params: {
    brand: string;
    near: Coordinates;
    radiusMeters: number;
  }): Promise<Branch[]>;

  /** Driving route length in meters. */
  drivingDistance(from: Coordinates, to: Coordinates): Promise<number>;
};

export type MeetingSearchInput = {
  participants: Participant[];
  brand: string;
  objective: ProximityObjective;
  /** Search radius in meters. Default 15 km when omitted. */
  radiusMeters?: number;
};

export const DEFAULT_RADIUS_METERS = 15_000;
