import { FakeMapProvider } from "./fake-map-provider.js";
import type { Branch, GeocodeCandidate } from "./types.js";

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

const haidian: GeocodeCandidate = {
  formattedAddress: "北京市海淀区中关村大街",
  coordinates: { lat: 39.98, lng: 116.32 },
};

const wangjingStreet: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区望京街",
  coordinates: { lat: 39.99, lng: 116.47 },
};

const wangjingXiyuan: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区望京西园",
  coordinates: { lat: 39.995, lng: 116.475 },
};

const chaoyang: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区三里屯路",
  coordinates: { lat: 39.92, lng: 116.45 },
};

/**
 * Form address presets for the local demo.
 * "望京" is intentionally ambiguous so organizers can exercise disambiguation.
 */
export const DEMO_ADDRESS_PRESETS = [
  { label: "Haidian", address: "海淀区中关村" },
  { label: "Wangjing", address: "望京" },
  { label: "Chaoyang", address: "朝阳区三里屯" },
] as const;

/** Resolved coordinates used to script driving Distances for unique hits. */
const demoResolvedPoints = [haidian, wangjingStreet, chaoyang] as const;

/**
 * Fake MapProvider seeded for the local demo (no live 高德).
 * Geocode + driving Distances are scripted for the form presets.
 */
export function createDemoMapProvider(): FakeMapProvider {
  const map = new FakeMapProvider({
    branchesByBrand: { 滨寿司: demoBranches },
    geocodeResults: {
      海淀区中关村: [haidian],
      中关村: [haidian],
      望京: [wangjingStreet, wangjingXiyuan],
      朝阳区三里屯: [chaoyang],
      三里屯: [chaoyang],
    },
  });

  // Ambiguous "望京西园" still has Distances so a picked candidate can search.
  const distanceTable: Record<string, Record<string, number>> = {
    "39.98,116.32": {
      "demo-zhongguancun": 1200,
      "demo-wangjing": 18000,
      "demo-sanlitun": 14000,
      "demo-guomao": 16000,
    },
    "39.99,116.47": {
      "demo-zhongguancun": 17000,
      "demo-wangjing": 1500,
      "demo-sanlitun": 9000,
      "demo-guomao": 11000,
    },
    "39.995,116.475": {
      "demo-zhongguancun": 17500,
      "demo-wangjing": 800,
      "demo-sanlitun": 9500,
      "demo-guomao": 11500,
    },
    "39.92,116.45": {
      "demo-zhongguancun": 15000,
      "demo-wangjing": 10000,
      "demo-sanlitun": 2000,
      "demo-guomao": 3500,
    },
  };

  for (const point of [
    ...demoResolvedPoints,
    wangjingXiyuan,
  ]) {
    const key = `${point.coordinates.lat},${point.coordinates.lng}`;
    const row = distanceTable[key];
    if (!row) continue;
    for (const branch of demoBranches) {
      const meters = row[branch.id];
      if (meters !== undefined) {
        map.setDrivingDistance(point.coordinates, branch.coordinates, meters);
      }
    }
  }

  return map;
}
