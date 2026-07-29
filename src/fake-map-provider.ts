import type {
  Branch,
  Coordinates,
  GeocodeCandidate,
  MapProvider,
} from "./types.js";

/**
 * In-memory MapProvider for demos and MeetingSearch seam tests.
 * Distances and Branch search results are scripted by the caller.
 */
export class FakeMapProvider implements MapProvider {
  private readonly branchesByBrand: Map<string, Branch[]>;
  private readonly distances: Map<string, number>;
  private readonly geocodeByAddress: Map<string, GeocodeCandidate[]>;
  readonly searchCalls: Array<{
    brand: string;
    near: Coordinates;
    radiusMeters: number;
  }> = [];

  constructor(options?: {
    branchesByBrand?: Record<string, Branch[]>;
    /** Key: `${fromLat},${fromLng}->${toLat},${toLng}` → meters */
    distances?: Record<string, number>;
    geocodeByAddress?: Record<string, GeocodeCandidate[]>;
  }) {
    this.branchesByBrand = new Map(
      Object.entries(options?.branchesByBrand ?? {}),
    );
    this.distances = new Map(Object.entries(options?.distances ?? {}));
    this.geocodeByAddress = new Map(
      Object.entries(options?.geocodeByAddress ?? {}),
    );
  }

  async geocode(address: string): Promise<GeocodeCandidate[]> {
    return this.geocodeByAddress.get(address) ?? [];
  }

  async searchBranches(params: {
    brand: string;
    near: Coordinates;
    radiusMeters: number;
  }): Promise<Branch[]> {
    this.searchCalls.push({ ...params, near: { ...params.near } });
    const all = this.branchesByBrand.get(params.brand) ?? [];
    return all.filter((branch) => {
      const d = haversineMeters(params.near, branch.coordinates);
      return d <= params.radiusMeters;
    });
  }

  async drivingDistance(
    from: Coordinates,
    to: Coordinates,
  ): Promise<number> {
    const key = distanceKey(from, to);
    const value = this.distances.get(key);
    if (value === undefined) {
      throw new Error(`FakeMapProvider: no driving Distance for ${key}`);
    }
    return value;
  }

  setDrivingDistance(
    from: Coordinates,
    to: Coordinates,
    meters: number,
  ): void {
    this.distances.set(distanceKey(from, to), meters);
  }
}

export function distanceKey(from: Coordinates, to: Coordinates): string {
  return `${from.lat},${from.lng}->${to.lat},${to.lng}`;
}

/** Crow-fly helper only for FakeMapProvider radius filtering — not used for scoring. */
function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
