import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { FakeMapProvider } from "../src/fake-map-provider.js";
import { buildMapServicesFromEnv } from "../src/map-services.js";
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
    expect(html).toContain("composer-address");
    expect(html).toContain("/api/geocode");
    expect(html).toContain("/api/search");
    expect(html).toContain("map_provider_error");
    expect(html).toContain("empty_candidate_set");
    expect(html).not.toContain('name="lat"');
    expect(html).not.toContain('name="lng"');
  });

  it("serves per-participant address lookup, Ranking gate, layout gap, and zh UI copy", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Midpoint-style composer: name → choose address → search → pick → list
    expect(html).toContain("pickAddress");
    expect(html).toContain("lookupAddress");
    expect(html).toContain("address-picker");
    expect(html).toContain("geocode-panel");
    expect(html).toContain("participant-list");
    expect(html).toContain("updateSearchGate");
    expect(html).toContain("needAllResolved");
    expect(html).toContain("addParticipantFromCandidate");

    // Organizer prefs + Empty candidate set recovery
    expect(html).toContain("Add participants");
    expect(html).toContain('name="objective"');
    expect(html).toContain('name="radiusMeters"');
    expect(html).toContain("Recommendation");
    expect(html).toContain("labelById");
    expect(html).toMatch(/increasing the radius|increase the radius/i);
    expect(html).toMatch(/changing the Brand|change the Brand/i);

    // Card layout gap between side and map
    expect(html).toMatch(/\.layout\s*\{[^}]*gap:\s*1rem/s);

    // Chinese UI fully localized
    expect(html).toContain("添加参与者");
    expect(html).toContain("选择地址");
    expect(html).toContain("就近目标");
    expect(html).toContain("无候选分店");
    expect(html).toContain("为大家找到合适的品牌分店。");
    expect(html).toContain("参与者列表");
    expect(html).not.toContain("添加 Participant");
    expect(html).not.toContain("为大家找到合适的 Brand Branch");
    expect(html).toContain('drawerEmptyTitle: "无候选分店"');
    expect(html).toContain('objective: "就近目标"');
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

describe("GET / map UI config injection", () => {
  const map = new FakeMapProvider({
    branchesByBrand: { 滨寿司: [branch] },
  });
  const app = createApp({
    mapProvider: map,
    port: 0,
    mapUi: {
      jsKey: "test-js-key",
      securityJsCode: "test-security",
    },
  });
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

  it("injects MapUiConfig into the page without leaving the placeholder", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("/*__MAP_UI_CONFIG__*/null");
    expect(html).toContain('"jsKey":"test-js-key"');
    expect(html).toContain('"securityJsCode":"test-security"');
  });
});

describe("createApp replaceable MapProvider and MapUi", () => {
  const firstHit: GeocodeCandidate = {
    formattedAddress: "第一家地址",
    coordinates: { lat: 39.9, lng: 116.4 },
  };
  const secondHit: GeocodeCandidate = {
    formattedAddress: "第二家地址",
    coordinates: { lat: 40.0, lng: 116.5 },
  };

  const firstMap = new FakeMapProvider({
    branchesByBrand: { 滨寿司: [branch] },
    geocodeResults: { 望京: [firstHit] },
  });
  firstMap.setDrivingDistance(
    { lat: 39.9, lng: 116.4 },
    branch.coordinates,
    1000,
  );
  firstMap.setDrivingDistance(
    { lat: 39.92, lng: 116.42 },
    branch.coordinates,
    2000,
  );

  const replacementBranch: Branch = {
    id: "replacement-branch",
    name: "滨寿司·替换店",
    address: "替换路1号",
    coordinates: { lat: 39.93, lng: 116.43 },
  };
  const secondMap = new FakeMapProvider({
    branchesByBrand: { 滨寿司: [replacementBranch] },
    geocodeResults: { 望京: [secondHit] },
  });
  secondMap.setDrivingDistance(
    { lat: 39.9, lng: 116.4 },
    replacementBranch.coordinates,
    500,
  );
  secondMap.setDrivingDistance(
    { lat: 39.92, lng: 116.42 },
    replacementBranch.coordinates,
    700,
  );

  const app = createApp({
    mapProvider: firstMap,
    port: 0,
    mapUi: {
      jsKey: "initial-js-key",
      securityJsCode: "initial-security",
    },
  });
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

  it("uses the replacement MapProvider for geocode and search after swap", async () => {
    const beforeGeocode = await fetch(`${baseUrl}/api/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "望京" }),
    });
    expect(beforeGeocode.status).toBe(200);
    expect((await beforeGeocode.json()).candidates[0].formattedAddress).toBe(
      "第一家地址",
    );

    app.replaceMapServices({ mapProvider: secondMap });

    const afterGeocode = await fetch(`${baseUrl}/api/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "望京" }),
    });
    expect(afterGeocode.status).toBe(200);
    expect((await afterGeocode.json()).candidates[0].formattedAddress).toBe(
      "第二家地址",
    );

    const afterSearch = await fetch(`${baseUrl}/api/search`, {
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
    expect(afterSearch.status).toBe(200);
    const ranking = await afterSearch.json();
    expect(ranking.recommendation.branch.id).toBe("replacement-branch");
    expect(ranking.recommendation.score).toBe(1200);
  });

  it("injects updated MapUi on subsequent GET / after swap", async () => {
    const before = await fetch(`${baseUrl}/`);
    expect(await before.text()).toContain('"jsKey":"initial-js-key"');

    app.replaceMapServices({
      mapUi: {
        jsKey: "swapped-js-key",
        securityJsCode: "swapped-security",
      },
    });

    const after = await fetch(`${baseUrl}/`);
    expect(after.status).toBe(200);
    const html = await after.text();
    expect(html).toContain('"jsKey":"swapped-js-key"');
    expect(html).toContain('"securityJsCode":"swapped-security"');
    expect(html).not.toContain('"jsKey":"initial-js-key"');
  });
});

describe("buildMapServicesFromEnv via createApp", () => {
  it("uses the demo MapProvider when AMAP_KEY is empty", async () => {
    const { mapProvider, mapUi } = buildMapServicesFromEnv({
      AMAP_KEY: "  ",
      AMAP_JS_KEY: "",
      AMAP_SECURITY_JS_CODE: "",
    });
    const app = createApp({ mapProvider, mapUi, port: 0 });
    await app.start();
    try {
      const address = app.server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected TCP address");
      }
      const res = await fetch(`http://127.0.0.1:${address.port}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "望京" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.candidates).toEqual([
        {
          formattedAddress: "北京市朝阳区望京街",
          coordinates: { lat: 39.99, lng: 116.47 },
        },
        {
          formattedAddress: "北京市朝阳区望京西园",
          coordinates: { lat: 39.995, lng: 116.475 },
        },
      ]);
    } finally {
      await app.stop();
    }
  });

  it("falls AMAP_JS_KEY back to AMAP_KEY for MapUi injection", async () => {
    const { mapUi } = buildMapServicesFromEnv({
      AMAP_KEY: "web-service-key",
      AMAP_JS_KEY: "  ",
      AMAP_SECURITY_JS_CODE: " sec-from-env ",
      AMAP_QPS: "2",
    });
    // Fake provider so this only exercises MapUi fallback via GET /.
    const app = createApp({
      mapProvider: new FakeMapProvider({
        branchesByBrand: { 滨寿司: [branch] },
      }),
      mapUi,
      port: 0,
    });
    await app.start();
    try {
      const address = app.server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected TCP address");
      }
      const res = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('"jsKey":"web-service-key"');
      expect(html).toContain('"securityJsCode":"sec-from-env"');
    } finally {
      await app.stop();
    }
  });

  it("hot-swaps MapUi rebuilt from env onto a running createApp", async () => {
    const initial = buildMapServicesFromEnv({ AMAP_KEY: "" });
    const app = createApp({
      mapProvider: initial.mapProvider,
      mapUi: initial.mapUi,
      port: 0,
    });
    await app.start();
    try {
      const address = app.server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected TCP address");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const before = await fetch(`${baseUrl}/`);
      expect(await before.text()).toContain('"jsKey":""');

      const next = buildMapServicesFromEnv({
        AMAP_KEY: "web-service-key",
        AMAP_JS_KEY: " js-only-key ",
        AMAP_SECURITY_JS_CODE: "next-sec",
      });
      // Keep demo geocode offline; only swap MapUi from the shared builder.
      app.replaceMapServices({ mapUi: next.mapUi });

      const after = await fetch(`${baseUrl}/`);
      expect(after.status).toBe(200);
      const html = await after.text();
      expect(html).toContain('"jsKey":"js-only-key"');
      expect(html).toContain('"securityJsCode":"next-sec"');

      const geocode = await fetch(`${baseUrl}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "中关村" }),
      });
      expect(geocode.status).toBe(200);
      expect((await geocode.json()).candidates[0].formattedAddress).toBe(
        "北京市海淀区中关村大街",
      );
    } finally {
      await app.stop();
    }
  });
});
