import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { upsertEnvKeys } from "./env-file.js";
import { meetingSearch } from "./meeting-search.js";
import {
  buildMapServicesFromEnv,
  type MapServicesEnv,
  type MapServicesFromEnv,
  type MapUiConfig,
} from "./map-services.js";
import type { MapProvider, MeetingSearchInput, ProximityObjective } from "./types.js";
import {
  DEFAULT_AMAP_QPS,
  isEmptyCandidateSet,
  isMapProviderError,
  type GeocodeCandidate,
} from "./types.js";
import type { ServiceEnvKey } from "./env-file.js";

export type { MapUiConfig } from "./map-services.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_GEOCODE_CACHE_TTL_MS = 5 * 60_000;
const MAX_REQUEST_BODY_BYTES = 1_048_576;

type GeocodeCacheEntry = {
  expiresAt: number;
  candidates: GeocodeCandidate[];
};

export type AppDeps = {
  mapProvider: MapProvider;
  port?: number;
  mapUi?: MapUiConfig;
  /** Working-directory `.env` path for Service settings persistence. */
  envFilePath?: string;
  /** In-memory snapshot of the four service env keys (mutated on save). */
  serviceEnv?: MapServicesEnv;
  /** Override MapProvider/MapUi builder (tests inject fakes). */
  buildMapServices?: (env: MapServicesEnv) => MapServicesFromEnv;
  /**
   * How long repeated geocode lookups are served from memory (ms).
   * Cleared automatically whenever the MapProvider is swapped. Default 5 min.
   */
  geocodeCacheTtlMs?: number;
  /** Clock override for cache expiry (tests inject a fake). */
  geocodeCacheNow?: () => number;
};

/** Partial hot-swap; omitted fields keep their current values. */
export type ReplaceMapServicesInput = {
  mapProvider?: MapProvider;
  mapUi?: MapUiConfig;
};

type SecretFieldStatus = {
  configured: boolean;
};

export function createApp(deps: AppDeps) {
  const port = deps.port ?? DEFAULT_PORT;
  let mapProvider = deps.mapProvider;
  let mapUi = deps.mapUi;
  const envFilePath = deps.envFilePath ?? resolve(process.cwd(), ".env");
  const serviceEnv: MapServicesEnv = { ...(deps.serviceEnv ?? {}) };
  const buildMapServices = deps.buildMapServices ?? buildMapServicesFromEnv;
  const geocodeCacheTtlMs =
    deps.geocodeCacheTtlMs ?? DEFAULT_GEOCODE_CACHE_TTL_MS;
  const now = deps.geocodeCacheNow ?? Date.now;
  const geocodeCache = new Map<string, GeocodeCacheEntry>();

  const server = createServer(async (req, res) => {
    // Capture at request start so a mid-flight swap does not tear down in-flight work.
    const providerForRequest = mapProvider;
    const mapUiForRequest = mapUi;
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );

      if (req.method === "GET" && url.pathname === "/") {
        await serveForm(res, mapUiForRequest);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/service-settings") {
        writeJson(res, 200, readServiceSettings());
        return;
      }

      if (req.method === "PUT" && url.pathname === "/api/service-settings") {
        await handlePutServiceSettings(req, res);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/search") {
        await handleSearch(req, res, providerForRequest);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/geocode") {
        await handleGeocode(req, res, providerForRequest);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (err) {
      if (isMapProviderError(err)) {
        writeMapProviderFailure(res, err.message);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof HttpError ? err.status : 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  function secretStatus(value: string | undefined): SecretFieldStatus {
    return { configured: Boolean(value?.trim()) };
  }

  function effectiveAmapQps(): number {
    const raw = serviceEnv.AMAP_QPS ?? serviceEnv.AMAP_CONCURRENCY;
    if (raw === undefined || String(raw).trim() === "") return DEFAULT_AMAP_QPS;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_AMAP_QPS;
    return n;
  }

  function readServiceSettings(): {
    amapKey: SecretFieldStatus;
    amapJsKey: SecretFieldStatus;
    amapSecurityJsCode: SecretFieldStatus;
    amapQps: number;
  } {
    return {
      amapKey: secretStatus(serviceEnv.AMAP_KEY),
      amapJsKey: secretStatus(serviceEnv.AMAP_JS_KEY),
      amapSecurityJsCode: secretStatus(serviceEnv.AMAP_SECURITY_JS_CODE),
      amapQps: effectiveAmapQps(),
    };
  }

  function applyBuiltServices(built: MapServicesFromEnv): void {
    mapProvider = built.mapProvider;
    mapUi = built.mapUi;
    geocodeCache.clear();
  }

  function jsCredentialsFingerprint(env: MapServicesEnv): string {
    return `${env.AMAP_JS_KEY?.trim() ?? ""}\0${env.AMAP_SECURITY_JS_CODE?.trim() ?? ""}`;
  }

  function applySecretPatch(
    o: Record<string, unknown>,
    opts: {
      valueKey: string;
      clearKey: string;
      envKey: ServiceEnvKey;
      diskUpdates: Partial<Record<ServiceEnvKey, string>>;
    },
  ): void {
    const clear = o[opts.clearKey] === true;
    const raw = o[opts.valueKey];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      throw new HttpError(400, `${opts.valueKey} must be a string`);
    }
    if (clear) {
      serviceEnv[opts.envKey] = "";
      opts.diskUpdates[opts.envKey] = "";
    } else if (typeof raw === "string" && raw.trim() !== "") {
      const trimmed = raw.trim();
      serviceEnv[opts.envKey] = trimmed;
      opts.diskUpdates[opts.envKey] = trimmed;
    }
    // Empty / omitted without clear → keep current value.
  }

  function parseAmapQpsInput(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === "string" && raw.trim() === "") return undefined;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpError(400, "amapQps must be a positive number");
    }
    return String(n);
  }

  async function handlePutServiceSettings(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Body must be a JSON object");
    }
    const o = body as Record<string, unknown>;

    // Validate QPS before mutating memory or disk.
    const qpsUpdate = parseAmapQpsInput(o.amapQps);

    const jsBefore = jsCredentialsFingerprint(serviceEnv);

    const diskUpdates: Partial<Record<ServiceEnvKey, string>> = {};

    applySecretPatch(o, {
      valueKey: "amapKey",
      clearKey: "clearAmapKey",
      envKey: "AMAP_KEY",
      diskUpdates,
    });
    applySecretPatch(o, {
      valueKey: "amapJsKey",
      clearKey: "clearAmapJsKey",
      envKey: "AMAP_JS_KEY",
      diskUpdates,
    });
    applySecretPatch(o, {
      valueKey: "amapSecurityJsCode",
      clearKey: "clearAmapSecurityJsCode",
      envKey: "AMAP_SECURITY_JS_CODE",
      diskUpdates,
    });

    if (qpsUpdate !== undefined) {
      serviceEnv.AMAP_QPS = qpsUpdate;
      diskUpdates.AMAP_QPS = qpsUpdate;
    }

    if (Object.keys(diskUpdates).length > 0) {
      upsertEnvKeys(envFilePath, diskUpdates);
    }

    const built = buildMapServices(serviceEnv);
    applyBuiltServices(built);
    const reloadRequired =
      jsCredentialsFingerprint(serviceEnv) !== jsBefore;
    writeJson(res, 200, { ...readServiceSettings(), reloadRequired });
  }

  async function handleGeocode(
    req: IncomingMessage,
    res: ServerResponse,
    map: MapProvider,
  ): Promise<void> {
    const body = await readJsonBody(req);
    const address = parseGeocodeAddress(body);
    const cached = geocodeCache.get(address);
    if (cached !== undefined && cached.expiresAt > now()) {
      writeJson(res, 200, { candidates: cached.candidates });
      return;
    }
    const candidates = await map.geocode(address);
    if (geocodeCacheTtlMs > 0) {
      geocodeCache.set(address, {
        expiresAt: now() + geocodeCacheTtlMs,
        candidates,
      });
    }
    writeJson(res, 200, { candidates });
  }

  return {
    server,
    start(): Promise<void> {
      return new Promise((resolveListen) => {
        server.listen(port, () => resolveListen());
      });
    },
    stop(): Promise<void> {
      return new Promise((resolveClose, reject) => {
        server.close((err) => (err ? reject(err) : resolveClose()));
      });
    },
    /**
     * Hot-swap MapProvider and/or MapUi for subsequent requests (ADR-0004 prep).
     * Omitting a field leaves the current value unchanged.
     */
    replaceMapServices(next: ReplaceMapServicesInput): void {
      if (next.mapProvider !== undefined) {
        mapProvider = next.mapProvider;
        geocodeCache.clear();
      }
      if (next.mapUi !== undefined) {
        mapUi = next.mapUi;
      }
    },
    port,
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function writeMapProviderFailure(res: ServerResponse, message: string): void {
  res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      kind: "map_provider_error",
      message,
    }),
  );
}

async function serveForm(
  res: ServerResponse,
  mapUi?: MapUiConfig,
): Promise<void> {
  const htmlPath = join(__dirname, "public", "index.html");
  let html = await readFile(htmlPath, "utf8");
  const configJson = JSON.stringify({
    jsKey: mapUi?.jsKey?.trim() ?? "",
    securityJsCode: mapUi?.securityJsCode?.trim() ?? "",
  });
  html = html.replace("/*__MAP_UI_CONFIG__*/null", configJson);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function handleSearch(
  req: IncomingMessage,
  res: ServerResponse,
  map: MapProvider,
): Promise<void> {
  const body = await readJsonBody(req);
  const input = parseSearchInput(body);

  let result;
  try {
    result = await meetingSearch(input, map);
  } catch (err) {
    if (isMapProviderError(err)) {
      writeMapProviderFailure(res, err.message);
      return;
    }
    throw err;
  }

  if (isEmptyCandidateSet(result)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(result));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_REQUEST_BODY_BYTES) {
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new HttpError(400, "Request body is required");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

function parseGeocodeAddress(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Body must be a JSON object");
  }
  const o = body as Record<string, unknown>;
  if (typeof o.address !== "string" || !o.address.trim()) {
    throw new HttpError(400, "address is required");
  }
  return o.address.trim();
}

function parseSearchInput(body: unknown): MeetingSearchInput {
  if (!body || typeof body !== "object") {
    throw new Error("Body must be a JSON object");
  }
  const o = body as Record<string, unknown>;

  if (!Array.isArray(o.participants) || o.participants.length < 2) {
    throw new Error(
      "At least two Participants with resolved coordinates are required",
    );
  }

  const participants = o.participants.map((p, i) => {
    if (!p || typeof p !== "object") {
      throw new Error(`Participant ${i} is invalid`);
    }
    const row = p as Record<string, unknown>;
    const coords = row.coordinates;
    if (!coords || typeof coords !== "object") {
      throw new Error(`Participant ${i} needs resolved coordinates`);
    }
    const c = coords as Record<string, unknown>;
    if (typeof c.lat !== "number" || typeof c.lng !== "number") {
      throw new Error(`Participant ${i} coordinates must be numbers`);
    }
    return {
      id: typeof row.id === "string" ? row.id : `p${i + 1}`,
      label:
        typeof row.label === "string" ? row.label : `Participant ${i + 1}`,
      coordinates: { lat: c.lat, lng: c.lng },
    };
  });

  if (typeof o.brand !== "string" || !o.brand.trim()) {
    throw new Error("Brand is required");
  }

  const objective = o.objective;
  if (objective !== "total_distance" && objective !== "minimax") {
    throw new Error(
      'Proximity objective must be "total_distance" or "minimax"',
    );
  }

  const input: MeetingSearchInput = {
    participants,
    brand: o.brand.trim(),
    objective: objective as ProximityObjective,
  };

  if (
    o.radiusMeters !== undefined &&
    o.radiusMeters !== null &&
    o.radiusMeters !== ""
  ) {
    const radius = Number(o.radiusMeters);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("radiusMeters must be a positive number");
    }
    input.radiusMeters = radius;
  }

  if (
    o.concurrency !== undefined &&
    o.concurrency !== null &&
    o.concurrency !== ""
  ) {
    const concurrency = Number(o.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("concurrency must be a positive integer");
    }
    input.concurrency = concurrency;
  }

  return input;
}
