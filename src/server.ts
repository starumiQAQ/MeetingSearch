import { loadEnvFile } from "./load-env.js";
import { createApp } from "./app.js";
import { AmapMapProvider } from "./amap-map-provider.js";
import { createDemoMapProvider } from "./demo-map-provider.js";
import { DEFAULT_AMAP_QPS, type MapProvider } from "./types.js";

loadEnvFile();

const PORT = Number(process.env.PORT ?? 3000);
const amapKey = process.env.AMAP_KEY?.trim();
const amapQps = parseQps(
  process.env.AMAP_QPS ?? process.env.AMAP_CONCURRENCY,
  DEFAULT_AMAP_QPS,
);

const mapProvider: MapProvider = amapKey
  ? new AmapMapProvider({
      apiKey: amapKey,
      qps: amapQps,
    })
  : createDemoMapProvider();

const app = createApp({
  mapProvider,
  port: PORT,
});

await app.start();
console.log(`MeetingSearch local web UI: http://localhost:${app.port}`);
console.log(`API: POST http://localhost:${app.port}/api/geocode`);
console.log(`API: POST http://localhost:${app.port}/api/search`);
if (amapKey) {
  console.log(
    `MapProvider: 高德 AmapMapProvider (AMAP_KEY set, QPS=${amapQps}/s)`,
  );
} else {
  console.log(
    "MapProvider: demo fake (set AMAP_KEY in .env for live 高德)",
  );
}

function parseQps(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
