import { createApp } from "./app.js";
import { createDemoMapProvider } from "./demo-map-provider.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp({
  mapProvider: createDemoMapProvider(),
  port: PORT,
});

await app.start();
console.log(`MeetingSearch local web UI: http://localhost:${app.port}`);
console.log(`API: POST http://localhost:${app.port}/api/search`);
