import { createQpsGate } from "./concurrency.js";
import {
  DEFAULT_AMAP_QPS,
  MapProviderError,
  type Branch,
  type Coordinates,
  type GeocodeCandidate,
  type MapProvider,
} from "./types.js";

export type AmapFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type AmapMapProviderOptions = {
  /** 高德 Web 服务 API key (server-side only). */
  apiKey: string;
  fetch?: AmapFetch;
  /** Override REST base for tests. Default https://restapi.amap.com */
  baseUrl?: string;
  /**
   * Max 高德 HTTP starts per second (次/秒). Default 3.
   * Personal keys reject bursts with CUQPS_HAS_EXCEEDED_THE_LIMIT.
   */
  qps?: number;
  /** @deprecated Use `qps` (次/秒). */
  concurrency?: number;
};

/**
 * Live 高德 MapProvider (ADR 0001). Calls REST server-side; key stays off the client.
 */
export class AmapMapProvider implements MapProvider {
  private readonly apiKey: string;
  private readonly fetch: AmapFetch;
  private readonly baseUrl: string;
  private readonly runExclusive: <T>(fn: () => Promise<T>) => Promise<T>;

  constructor(options: AmapMapProviderOptions) {
    if (!options.apiKey?.trim()) {
      throw new MapProviderError("AMAP_KEY is missing or empty");
    }
    this.apiKey = options.apiKey.trim();
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = (options.baseUrl ?? "https://restapi.amap.com").replace(
      /\/$/,
      "",
    );
    const qps = options.qps ?? options.concurrency ?? DEFAULT_AMAP_QPS;
    this.runExclusive = createQpsGate(qps);
  }

  async geocode(address: string): Promise<GeocodeCandidate[]> {
    const url = new URL(`${this.baseUrl}/v3/geocode/geo`);
    url.searchParams.set("address", address);
    url.searchParams.set("key", this.apiKey);

    const data = await this.getJson(url);
    const geocodes = Array.isArray(data.geocodes) ? data.geocodes : [];
    const candidates: GeocodeCandidate[] = [];
    for (const row of geocodes) {
      const g = row as Record<string, unknown>;
      const formattedAddress = String(g.formatted_address ?? "").trim();
      const location = String(g.location ?? "").trim();
      if (!formattedAddress || !location) continue;
      const candidate: GeocodeCandidate = {
        formattedAddress,
        coordinates: parseLngLat(location),
      };
      if (typeof g.name === "string" && g.name) candidate.name = g.name;
      if (typeof g.id === "string" && g.id) candidate.id = g.id;
      candidates.push(candidate);
    }
    return candidates;
  }

  async searchBranches(params: {
    brand: string;
    near: Coordinates;
    radiusMeters: number;
  }): Promise<Branch[]> {
    const url = new URL(`${this.baseUrl}/v3/place/around`);
    url.searchParams.set(
      "location",
      `${params.near.lng},${params.near.lat}`,
    );
    url.searchParams.set("keywords", params.brand);
    url.searchParams.set("radius", String(params.radiusMeters));
    url.searchParams.set("key", this.apiKey);

    const data = await this.getJson(url);
    const pois = Array.isArray(data.pois) ? data.pois : [];
    const branches: Branch[] = [];
    for (const row of pois) {
      const p = row as Record<string, unknown>;
      const id = String(p.id ?? "").trim();
      const name = String(p.name ?? "").trim();
      const location = String(p.location ?? "").trim();
      if (!id || !name || !location) continue;
      branches.push({
        id,
        name,
        address: String(p.address ?? "").trim() || name,
        coordinates: parseLngLat(location),
      });
    }
    return branches;
  }

  async drivingDistance(
    from: Coordinates,
    to: Coordinates,
  ): Promise<number> {
    const url = new URL(`${this.baseUrl}/v5/direction/driving`);
    url.searchParams.set("origin", `${from.lng},${from.lat}`);
    url.searchParams.set("destination", `${to.lng},${to.lat}`);
    url.searchParams.set("key", this.apiKey);

    const data = await this.getJson(url);
    const route = data.route as Record<string, unknown> | undefined;
    const paths = Array.isArray(route?.paths) ? route.paths : [];
    const first = paths[0] as Record<string, unknown> | undefined;
    if (!first) {
      throw new MapProviderError("高德 driving Distance returned no path");
    }
    const meters = Number(first.distance);
    if (!Number.isFinite(meters)) {
      throw new MapProviderError(
        "高德 driving Distance missing numeric distance",
      );
    }
    return meters;
  }

  private async getJson(url: URL): Promise<Record<string, unknown>> {
    return this.runExclusive(async () => {
      let response: Response;
      try {
        response = await this.fetch(url.toString());
      } catch (err) {
        throw new MapProviderError(
          `高德 request failed: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }

      if (!response.ok) {
        throw new MapProviderError(
          `高德 HTTP ${response.status} for ${url.pathname}`,
        );
      }

      let data: Record<string, unknown>;
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch (err) {
        throw new MapProviderError("高德 response is not JSON", { cause: err });
      }

      if (String(data.status) !== "1") {
        const info = String(data.info ?? data.infocode ?? "unknown");
        throw new MapProviderError(`高德 API error: ${info}`);
      }

      return data;
    });
  }
}

/** 高德 location strings are "lng,lat". */
function parseLngLat(location: string): Coordinates {
  const [lngRaw, latRaw] = location.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new MapProviderError(`Invalid 高德 location: ${location}`);
  }
  return { lng, lat };
}
