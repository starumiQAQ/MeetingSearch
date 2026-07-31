import { AmapMapProvider } from "./amap-map-provider.js";
import { createDemoMapProvider } from "./demo-map-provider.js";
import { DEFAULT_AMAP_QPS, type MapProvider } from "./types.js";

export type MapUiConfig = {
  /** 高德 Web 端 (JS API) key — injected into the page for map display. */
  jsKey?: string;
  /** JS API securityJsCode (required for keys created after 2021-12-02). */
  securityJsCode?: string;
};

/** Env keys that select MapProvider + MapUi (see README startup table / ADR-0004). */
export type MapServicesEnv = {
  AMAP_KEY?: string;
  AMAP_JS_KEY?: string;
  AMAP_SECURITY_JS_CODE?: string;
  AMAP_QPS?: string;
  /** @deprecated Prefer AMAP_QPS. */
  AMAP_CONCURRENCY?: string;
};

export type MapServicesFromEnv = {
  mapProvider: MapProvider;
  mapUi: MapUiConfig;
  /** Trimmed Web 服务 key; empty when using the demo MapProvider. */
  amapKey: string;
  /** Effective JS API key after AMAP_JS_KEY → AMAP_KEY fallback. */
  amapJsKey: string;
  amapSecurityJsCode: string;
  amapQps: number;
};

/**
 * Build MapProvider + MapUi from the four 高德 env keys, matching server startup:
 * empty AMAP_KEY → demo MapProvider; empty AMAP_JS_KEY → fall back to AMAP_KEY.
 */
export function buildMapServicesFromEnv(
  env: MapServicesEnv,
): MapServicesFromEnv {
  const amapKey = env.AMAP_KEY?.trim() ?? "";
  const amapJsKey = env.AMAP_JS_KEY?.trim() || amapKey || "";
  const amapSecurityJsCode = env.AMAP_SECURITY_JS_CODE?.trim() || "";
  const amapQps = parseAmapQps(
    env.AMAP_QPS ?? env.AMAP_CONCURRENCY,
    DEFAULT_AMAP_QPS,
  );

  const mapProvider: MapProvider = amapKey
    ? new AmapMapProvider({
        apiKey: amapKey,
        qps: amapQps,
      })
    : createDemoMapProvider();

  return {
    mapProvider,
    mapUi: {
      jsKey: amapJsKey,
      securityJsCode: amapSecurityJsCode,
    },
    amapKey,
    amapJsKey,
    amapSecurityJsCode,
    amapQps,
  };
}

function parseAmapQps(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
