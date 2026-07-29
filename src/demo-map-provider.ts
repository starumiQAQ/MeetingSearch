import { FakeMapProvider } from "./fake-map-provider.js";
import type { Branch } from "./types.js";

/** Demo Branches around a Beijing sample area for the local web UI. */
const demoBranches: Branch[] = [
  {
    id: "demo-zhongguancun",
    name: "滨寿司·中关村店",
    address: "海淀区中关村大街1号",
    coordinates: { lat: 39.983, lng: 116.316 },
  },
  {
    id: "demo-wangjing",
    name: "滨寿司·望京店",
    address: "朝阳区望京街2号",
    coordinates: { lat: 39.996, lng: 116.481 },
  },
  {
    id: "demo-sanlitun",
    name: "滨寿司·三里屯店",
    address: "朝阳区三里屯路3号",
    coordinates: { lat: 39.937, lng: 116.447 },
  },
  {
    id: "demo-guomao",
    name: "滨寿司·国贸店",
    address: "朝阳区建国门外大街4号",
    coordinates: { lat: 39.909, lng: 116.46 },
  },
];

/** Form preset coordinates — Distances are scripted for these points only. */
export const DEMO_PRESETS = [
  { label: "Haidian", coordinates: { lat: 39.98, lng: 116.32 } },
  { label: "Wangjing", coordinates: { lat: 39.99, lng: 116.47 } },
  { label: "Chaoyang", coordinates: { lat: 39.92, lng: 116.45 } },
] as const;

/**
 * Fake MapProvider seeded for the local demo (no live 高德).
 * Driving Distances are scripted for the form presets — not crow-fly.
 */
export function createDemoMapProvider(): FakeMapProvider {
  const map = new FakeMapProvider({
    branchesByBrand: { 滨寿司: demoBranches },
  });

  const distanceTable: Record<number, Record<string, number>> = {
    0: {
      "demo-zhongguancun": 1200,
      "demo-wangjing": 18000,
      "demo-sanlitun": 14000,
      "demo-guomao": 16000,
    },
    1: {
      "demo-zhongguancun": 17000,
      "demo-wangjing": 1500,
      "demo-sanlitun": 9000,
      "demo-guomao": 11000,
    },
    2: {
      "demo-zhongguancun": 15000,
      "demo-wangjing": 10000,
      "demo-sanlitun": 2000,
      "demo-guomao": 3500,
    },
  };

  for (const [i, preset] of DEMO_PRESETS.entries()) {
    for (const branch of demoBranches) {
      const meters = distanceTable[i]?.[branch.id];
      if (meters !== undefined) {
        map.setDrivingDistance(
          preset.coordinates,
          branch.coordinates,
          meters,
        );
      }
    }
  }

  return map;
}
