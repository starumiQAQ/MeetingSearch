import { loadEnvFile } from "../src/load-env.js";
import { AmapMapProvider } from "../src/amap-map-provider.js";
import { meetingSearch } from "../src/meeting-search.js";
import {
  DEFAULT_AMAP_QPS,
  isEmptyCandidateSet,
  isMapProviderError,
} from "../src/types.js";

async function main() {
  loadEnvFile();
  const apiKey = process.env.AMAP_KEY?.trim();
  if (!apiKey) {
    console.error("AMAP_KEY missing");
    process.exit(1);
  }
  const qps = Number(
    process.env.AMAP_QPS ?? process.env.AMAP_CONCURRENCY ?? DEFAULT_AMAP_QPS,
  );
  console.log("AMAP_QPS=", qps, "(次/秒)");

  const map = new AmapMapProvider({ apiKey, qps });

  const addresses = ["北京市海淀区中关村", "北京市朝阳区望京"];
  const participants = [];
  for (const [i, address] of addresses.entries()) {
    console.log("geocode:", address);
    const candidates = await map.geocode(address);
    if (candidates.length === 0) throw new Error("no geocode for " + address);
    const pick = candidates[0]!;
    console.log("  ->", pick.formattedAddress, pick.coordinates);
    participants.push({
      id: "p" + (i + 1),
      label: address,
      coordinates: pick.coordinates,
    });
  }

  console.log("meetingSearch brand=滨寿司 qps=", qps);
  const started = Date.now();
  try {
    const result = await meetingSearch(
      {
        participants,
        brand: "滨寿司",
        objective: "total_distance",
        radiusMeters: 15_000,
        concurrency: Math.max(3, Math.ceil(qps)),
      },
      map,
    );
    if (isEmptyCandidateSet(result)) {
      console.log("EMPTY:", result.message);
      process.exit(2);
    }
    console.log("elapsed_ms=", Date.now() - started);
    console.log("OK Ranking entries=", result.entries.length);
    console.log("recommendation:", result.recommendation.branch.name);
    console.log("address:", result.recommendation.branch.address);
    console.log("score(m):", result.recommendation.score);
    console.log("distances:", result.recommendation.distances);
    console.log("top3:");
    for (const e of result.entries.slice(0, 3)) {
      console.log(" -", e.branch.name, "score", e.score);
    }
  } catch (err) {
    if (isMapProviderError(err)) {
      console.error("MAP_PROVIDER_ERROR:", err.message);
      process.exit(3);
    }
    throw err;
  }
}

main();
