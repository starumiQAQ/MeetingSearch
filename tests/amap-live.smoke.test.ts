import { describe, expect, it } from "vitest";
import { loadEnvFile } from "../src/load-env.js";
import { AmapMapProvider } from "../src/amap-map-provider.js";

/**
 * Optional live smoke against 高德. Skipped unless AMAP_LIVE=1 and AMAP_KEY is set.
 * Does not run in default `npm test`.
 */
const live = process.env.AMAP_LIVE === "1";

describe.skipIf(!live)("AmapMapProvider live smoke", () => {
  loadEnvFile();
  const apiKey = process.env.AMAP_KEY?.trim();

  it("geocodes 北京市海淀区中关村", async () => {
    expect(apiKey, "AMAP_KEY required for live smoke").toBeTruthy();
    const map = new AmapMapProvider({ apiKey: apiKey! });
    const candidates = await map.geocode("北京市海淀区中关村");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.coordinates.lng).toBeGreaterThan(100);
    expect(candidates[0]!.coordinates.lat).toBeGreaterThan(30);
  });

  it("searches 滨寿司 Branches near Zhongguancun", async () => {
    expect(apiKey, "AMAP_KEY required for live smoke").toBeTruthy();
    const map = new AmapMapProvider({ apiKey: apiKey! });
    const branches = await map.searchBranches({
      brand: "滨寿司",
      near: { lng: 116.316, lat: 39.983 },
      radiusMeters: 15_000,
    });
    expect(branches.length).toBeGreaterThan(0);
    expect(branches[0]!.name).toMatch(/寿司|滨/);
  });

  it("returns driving Distance in meters", async () => {
    expect(apiKey, "AMAP_KEY required for live smoke").toBeTruthy();
    const map = new AmapMapProvider({ apiKey: apiKey! });
    const meters = await map.drivingDistance(
      { lng: 116.32, lat: 39.98 },
      { lng: 116.47, lat: 39.99 },
    );
    expect(meters).toBeGreaterThan(0);
  });
});
