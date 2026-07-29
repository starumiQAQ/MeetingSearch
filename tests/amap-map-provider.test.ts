import { describe, expect, it, vi } from "vitest";
import { AmapMapProvider } from "../src/amap-map-provider.js";
import { isMapProviderError } from "../src/types.js";

type FetchFn = typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AmapMapProvider", () => {
  it("geocode resolves address via 高德 geo API (lng,lat)", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://restapi.amap.com/v3/geocode/geo",
      );
      expect(url.searchParams.get("key")).toBe("test-key");
      expect(url.searchParams.get("address")).toBe("北京市海淀区中关村");
      return jsonResponse({
        status: "1",
        info: "OK",
        geocodes: [
          {
            formatted_address: "北京市海淀区中关村",
            location: "116.316833,39.983424",
          },
        ],
      });
    });

    const map = new AmapMapProvider({ apiKey: "test-key", fetch: fetchMock });
    const candidates = await map.geocode("北京市海淀区中关村");

    expect(candidates).toEqual([
      {
        formattedAddress: "北京市海淀区中关村",
        coordinates: { lng: 116.316833, lat: 39.983424 },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("searchBranches finds Brand Branches near a point within radius", async () => {
    const near = { lng: 116.316, lat: 39.983 };
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://restapi.amap.com/v3/place/around",
      );
      expect(url.searchParams.get("key")).toBe("test-key");
      expect(url.searchParams.get("keywords")).toBe("滨寿司");
      expect(url.searchParams.get("location")).toBe("116.316,39.983");
      expect(url.searchParams.get("radius")).toBe("15000");
      return jsonResponse({
        status: "1",
        info: "OK",
        pois: [
          {
            id: "B000A816R6",
            name: "滨寿司(中关村店)",
            address: "海淀区中关村大街1号",
            location: "116.316833,39.983424",
          },
        ],
      });
    });

    const map = new AmapMapProvider({ apiKey: "test-key", fetch: fetchMock });
    const branches = await map.searchBranches({
      brand: "滨寿司",
      near,
      radiusMeters: 15_000,
    });

    expect(branches).toEqual([
      {
        id: "B000A816R6",
        name: "滨寿司(中关村店)",
        address: "海淀区中关村大街1号",
        coordinates: { lng: 116.316833, lat: 39.983424 },
      },
    ]);
  });

  it("drivingDistance returns route length in meters", async () => {
    const from = { lng: 116.32, lat: 39.98 };
    const to = { lng: 116.47, lat: 39.99 };
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://restapi.amap.com/v5/direction/driving",
      );
      expect(url.searchParams.get("origin")).toBe("116.32,39.98");
      expect(url.searchParams.get("destination")).toBe("116.47,39.99");
      expect(url.searchParams.get("key")).toBe("test-key");
      return jsonResponse({
        status: "1",
        info: "OK",
        route: {
          paths: [{ distance: 18540 }],
        },
      });
    });

    const map = new AmapMapProvider({ apiKey: "test-key", fetch: fetchMock });
    const meters = await map.drivingDistance(from, to);
    expect(meters).toBe(18540);
  });

  it("throws MapProviderError when 高德 status is not success", async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      jsonResponse({ status: "0", info: "INVALID_USER_KEY" }),
    );
    const map = new AmapMapProvider({ apiKey: "bad-key", fetch: fetchMock });

    await expect(map.geocode("北京市")).rejects.toSatisfy((err: unknown) => {
      expect(isMapProviderError(err)).toBe(true);
      expect(String(err)).toMatch(/INVALID_USER_KEY|高德/);
      return true;
    });
  });

  it("throws MapProviderError on HTTP failure", async () => {
    const fetchMock = vi.fn<FetchFn>(
      async () => new Response("gateway timeout", { status: 504 }),
    );
    const map = new AmapMapProvider({ apiKey: "test-key", fetch: fetchMock });

    await expect(
      map.searchBranches({
        brand: "滨寿司",
        near: { lng: 116.3, lat: 39.9 },
        radiusMeters: 1000,
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(isMapProviderError(err)).toBe(true);
      expect(String(err)).toMatch(/504|HTTP/);
      return true;
    });
  });

  it("rejects empty apiKey at construction", () => {
    expect(() => new AmapMapProvider({ apiKey: "  " })).toThrowError(
      /AMAP_KEY/,
    );
  });
});
