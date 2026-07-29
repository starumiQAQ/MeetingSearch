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

/** Distinct from Empty candidate set — MapProvider/API/config failures. */
export type MapProviderFailure = {
  kind: "map_provider_error";
  message: string;
};

export type MeetingSearchResult = Ranking | EmptyCandidateSet;

export function isEmptyCandidateSet(
  result: MeetingSearchResult,
): result is EmptyCandidateSet {
  return "kind" in result && result.kind === "empty_candidate_set";
}

export function isMapProviderFailure(
  value: unknown,
): value is MapProviderFailure {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as { kind: unknown }).kind === "map_provider_error"
  );
}

/** Thrown by MapProvider adapters; API maps to MapProviderFailure. */
export class MapProviderError extends Error {
  readonly kind = "map_provider_error" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MapProviderError";
  }
}

export function isMapProviderError(err: unknown): err is MapProviderError {
  return err instanceof MapProviderError;
}

/**
 * One plausible match from geocoding a free-text address.
 * When multiple are returned, the organizer must pick one before search.
 */
export type GeocodeCandidate = {
  formattedAddress: string;
  coordinates: Coordinates;
  /** Optional provider POI / place id. */
  id?: string;
  /** Optional short name from the provider. */
  name?: string;
};

/**
 * Map traffic seam. Injectable so MeetingSearch can run with a fake
 * without live 高德 (ADR 0001 still applies for production adapters).
 */
export type MapProvider = {
  /**
   * Resolve a free-text address to zero, one, or many candidates.
   * Unique hit → auto-accept; multiple → organizer must disambiguate;
   * empty → clear error before MeetingSearch.
   */
  geocode(address: string): Promise<GeocodeCandidate[]>;

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
  /**
   * Max concurrent MapProvider calls during Candidate set + Distance scoring.
   * Default 3. Independent of 高德 QPS (次/秒) which is enforced on AmapMapProvider.
   */
  concurrency?: number;
};

export const DEFAULT_RADIUS_METERS = 15_000;

/** Default 高德 HTTP rate: 3 次/秒 (personal Web 服务 key). */
export const DEFAULT_AMAP_QPS = 3;

/** @deprecated Use DEFAULT_AMAP_QPS — kept as alias for older call sites. */
export const DEFAULT_AMAP_CONCURRENCY = DEFAULT_AMAP_QPS;
