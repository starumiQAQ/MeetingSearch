import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { FakeMapProvider } from "../src/fake-map-provider.js";
import type { Branch } from "../src/types.js";

const branch: Branch = {
  id: "api-branch",
  name: "滨寿司·测试店",
  address: "测试路1号",
  coordinates: { lat: 39.91, lng: 116.41 },
};

describe("POST /api/search", () => {
  const map = new FakeMapProvider({
    branchesByBrand: { 滨寿司: [branch] },
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

  it("serves the form at GET /", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("MeetingSearch");
    expect(html).toContain("/api/search");
  });
});
