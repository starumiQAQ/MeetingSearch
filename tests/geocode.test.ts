import { describe, expect, it } from "vitest";
import { FakeMapProvider } from "../src/fake-map-provider.js";
import type { GeocodeCandidate } from "../src/types.js";

const zhongguancun: GeocodeCandidate = {
  formattedAddress: "北京市海淀区中关村大街",
  coordinates: { lat: 39.98, lng: 116.32 },
};

const wangjingA: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区望京街",
  coordinates: { lat: 39.99, lng: 116.47 },
};

const wangjingB: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区望京西园",
  coordinates: { lat: 39.995, lng: 116.475 },
};

describe("MapProvider.geocode", () => {
  it("returns a single candidate for a unique address match", async () => {
    const map = new FakeMapProvider({
      geocodeResults: {
        中关村: [zhongguancun],
      },
    });

    const candidates = await map.geocode("中关村");

    expect(candidates).toEqual([zhongguancun]);
  });

  it("returns multiple candidates when the address is ambiguous", async () => {
    const map = new FakeMapProvider({
      geocodeResults: {
        望京: [wangjingA, wangjingB],
      },
    });

    const candidates = await map.geocode("望京");

    expect(candidates).toHaveLength(2);
    expect(candidates).toEqual([wangjingA, wangjingB]);
  });

  it("returns an empty list when nothing matches", async () => {
    const map = new FakeMapProvider({
      geocodeResults: {
        中关村: [zhongguancun],
      },
    });

    const candidates = await map.geocode("不存在的地址");

    expect(candidates).toEqual([]);
  });
});
