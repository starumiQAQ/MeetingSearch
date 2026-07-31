import { loadEnvFile } from "./load-env.js";
import { createApp } from "./app.js";
import { buildMapServicesFromEnv } from "./map-services.js";

loadEnvFile();

const PORT = Number(process.env.PORT ?? 3000);
const {
  mapProvider,
  mapUi,
  amapKey,
  amapJsKey,
  amapSecurityJsCode,
  amapQps,
} = buildMapServicesFromEnv(process.env);

const app = createApp({
  mapProvider,
  port: PORT,
  mapUi,
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
if (amapJsKey) {
  console.log(
    `Map UI: 高德 JS API key present${amapSecurityJsCode ? " (securityJsCode set)" : " (no AMAP_SECURITY_JS_CODE)"}`,
  );
} else {
  console.log(
    "Map UI: no AMAP_JS_KEY / AMAP_KEY — browser map disabled; search still works",
  );
}
