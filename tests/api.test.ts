import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { FakeMapProvider } from "../src/fake-map-provider.js";
import {
  MapProviderError,
  type Branch,
  type GeocodeCandidate,
  type MapProvider,
} from "../src/types.js";

const branch: Branch = {
  id: "api-branch",
  name: "滨寿司·测试店",
  address: "测试路1号",
  coordinates: { lat: 39.91, lng: 116.41 },
};

const uniqueHit: GeocodeCandidate = {
  formattedAddress: "北京市海淀区中关村大街",
  coordinates: { lat: 39.98, lng: 116.32 },
};

const ambiguousA: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区望京街",
  coordinates: { lat: 39.99, lng: 116.47 },
};

const ambiguousB: GeocodeCandidate = {
  formattedAddress: "北京市朝阳区望京西园",
  coordinates: { lat: 39.995, lng: 116.475 },
};

describe("local web API", () => {
  const map = new FakeMapProvider({
    branchesByBrand: { 滨寿司: [branch] },
    geocodeResults: {
      中关村: [uniqueHit],
      望京: [ambiguousA, ambiguousB],
    },
  });
  map.setDrivingDistance(
    { lat: 39.9, lng: 116.4 },
    branch.coordinates,
    1000,
  );
  map.setDrivingDistance(
    { lat: 39.92, lng: 116.42 },
    branch.coordinates,
    2000,
  );

  const app = createApp({ mapProvider: map, port: 0 });
  let baseUrl = "";

  beforeAll(async () => {
    await app.start();
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  describe("POST /api/search", () => {
    it("returns a Ranking for resolved Participants", async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participants: [
            {
              id: "alice",
              label: "Alice",
              coordinates: { lat: 39.9, lng: 116.4 },
            },
            {
              id: "bob",
              label: "Bob",
              coordinates: { lat: 39.92, lng: 116.42 },
            },
          ],
          brand: "滨寿司",
          objective: "total_distance",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.recommendation.branch.id).toBe("api-branch");
      expect(body.recommendation.score).toBe(3000);
    });

    it("returns Empty candidate set guidance when nothing matches", async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participants: [
            {
              id: "alice",
              label: "Alice",
              coordinates: { lat: 39.9, lng: 116.4 },
            },
            {
              id: "bob",
              label: "Bob",
              coordinates: { lat: 39.92, lng: 116.42 },
            },
          ],
          brand: "不存在的牌子",
          objective: "minimax",
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.kind).toBe("empty_candidate_set");
      expect(body.message).toMatch(/radius/i);
      expect(body.message).toMatch(/brand/i);
    });
  });

  describe("POST /api/geocode", () => {
    it("returns a unique candidate list for a clear address", async () => {
      const res = await fetch(`${baseUrl}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "中关村" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.candidates).toEqual([uniqueHit]);
    });

    it("returns multiple candidates when the address is ambiguous", async () => {
      const res = await fetch(`${baseUrl}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "望京" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.candidates).toEqual([ambiguousA, ambiguousB]);
    });

    it("returns an empty candidates list when nothing matches", async () => {
      const res = await fetch(`${baseUrl}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "不存在的地址" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.candidates).toEqual([]);
    });

    it("rejects a missing address", async () => {
      const res = await fetch(`${baseUrl}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/address/i);
    });
  });

  it("serves the form with address fields and geocode before search", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("MeetingSearch");
    expect(html).toContain('name="address"');
    expect(html).toContain("/api/geocode");
    expect(html).toContain("/api/search");
    expect(html).toContain("map_provider_error");
    expect(html).toContain("empty_candidate_set");
    expect(html).not.toContain('name="lat"');
    expect(html).not.toContain('name="lng"');
  });
});

describe("POST /api/geocode MapProvider failures", () => {
  const failingMap: MapProvider = {
    async geocode() {
      throw new MapProviderError("高德 API error: INVALID_USER_KEY");
    },
    async searchBranches() {
      throw new MapProviderError("高德 API error: INVALID_USER_KEY");
    },
    async drivingDistance() {
      throw new MapProviderError("高德 API error: INVALID_USER_KEY");
    },
  };

  const app = createApp({ mapProvider: failingMap, port: 0 });
  let baseUrl = "";

  beforeAll(async () => {
    await app.start();
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  it("returns map_provider_error for geocode failures", async () => {
    const res = await fetch(`${baseUrl}/api/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "望京" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.kind).toBe("map_provider_error");
    expect(body.message).toMatch(/高德|INVALID_USER_KEY/);
  });
});

describe("POST /api/search MapProvider failures", () => {
  const failingMap: MapProvider = {
    async geocode() {
      throw new MapProviderError("高德 API error: INVALID_USER_KEY");
    },
    async searchBranches() {
      throw new MapProviderError("高德 API error: INVALID_USER_KEY");
    },
    async drivingDistance() {
      throw new MapProviderError("高德 API error: INVALID_USER_KEY");
    },
  };

  const app = createApp({ mapProvider: failingMap, port: 0 });
  let baseUrl = "";

  beforeAll(async () => {
    await app.start();
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.stop();
  });

  it("returns map_provider_error distinct from Empty candidate set", async () => {
    const res = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participants: [
          {
            id: "alice",
            label: "Alice",
            coordinates: { lat: 39.9, lng: 116.4 },
          },
          {
            id: "bob",
            label: "Bob",
            coordinates: { lat: 39.92, lng: 116.42 },
          },
        ],
        brand: "滨寿司",
        objective: "total_distance",
      }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.kind).toBe("map_provider_error");
    expect(body.kind).not.toBe("empty_candidate_set");
    expect(body.message).toMatch(/高德|INVALID_USER_KEY/);
  });
});
