import { describe, expect, it } from "vitest";
import { FakeMapProvider } from "../src/fake-map-provider.js";
import { meetingSearch } from "../src/meeting-search.js";
import {
  DEFAULT_RADIUS_METERS,
  isEmptyCandidateSet,
  type Branch,
  type Participant,
} from "../src/types.js";

const alice: Participant = {
  id: "alice",
  label: "Alice",
  coordinates: { lat: 39.9, lng: 116.4 },
};

const bob: Participant = {
  id: "bob",
  label: "Bob",
  coordinates: { lat: 39.92, lng: 116.42 },
};

const brand = "滨寿司";

const branchNearAlice: Branch = {
  id: "poi-near-alice",
  name: "滨寿司·中关村店",
  address: "中关村大街1号",
  coordinates: { lat: 39.901, lng: 116.401 },
};

const branchNearBob: Branch = {
  id: "poi-near-bob",
  name: "滨寿司·望京店",
  address: "望京街2号",
  coordinates: { lat: 39.921, lng: 116.421 },
};

function wireDistances(
  map: FakeMapProvider,
  branches: Branch[],
  table: Record<string, Record<string, number>>,
): void {
  for (const participant of [alice, bob]) {
    for (const branch of branches) {
      const meters = table[participant.id]?.[branch.id];
      if (meters !== undefined) {
        map.setDrivingDistance(
          participant.coordinates,
          branch.coordinates,
          meters,
        );
      }
    }
  }
}

describe("MeetingSearch", () => {
  it("returns Empty candidate set with guidance when no Branches are found", async () => {
    const map = new FakeMapProvider({ branchesByBrand: { [brand]: [] } });

    const result = await meetingSearch(
      {
        participants: [alice, bob],
        brand,
        objective: "total_distance",
      },
      map,
    );

    expect(isEmptyCandidateSet(result)).toBe(true);
    if (!isEmptyCandidateSet(result)) return;
    expect(result.message).toMatch(/radius/i);
    expect(result.message).toMatch(/brand/i);
  });

  it("uses default radius of 15 km when radius is omitted", async () => {
    const map = new FakeMapProvider({
      branchesByBrand: { [brand]: [branchNearAlice] },
    });
    wireDistances(map, [branchNearAlice], {
      alice: { "poi-near-alice": 1000 },
      bob: { "poi-near-alice": 2000 },
    });

    await meetingSearch(
      {
        participants: [alice, bob],
        brand,
        objective: "total_distance",
      },
      map,
    );

    expect(map.searchCalls.length).toBeGreaterThan(0);
    for (const call of map.searchCalls) {
      expect(call.radiusMeters).toBe(DEFAULT_RADIUS_METERS);
      expect(call.radiusMeters).toBe(15_000);
    }
  });

  it("ranks by total distance and marks the top Branch as recommendation", async () => {
    const map = new FakeMapProvider({
      branchesByBrand: {
        [brand]: [branchNearAlice, branchNearBob],
      },
    });
    // Alice+Bob sums: near-alice = 3000, near-bob = 5000 → alice branch wins
    wireDistances(map, [branchNearAlice, branchNearBob], {
      alice: { "poi-near-alice": 1000, "poi-near-bob": 4000 },
      bob: { "poi-near-alice": 2000, "poi-near-bob": 1000 },
    });

    const result = await meetingSearch(
      {
        participants: [alice, bob],
        brand,
        objective: "total_distance",
      },
      map,
    );

    expect(isEmptyCandidateSet(result)).toBe(false);
    if (isEmptyCandidateSet(result)) return;

    expect(result.objective).toBe("total_distance");
    expect(result.entries.map((e) => e.branch.id)).toEqual([
      "poi-near-alice",
      "poi-near-bob",
    ]);
    expect(result.entries[0].score).toBe(3000);
    expect(result.entries[0].distances).toEqual({
      alice: 1000,
      bob: 2000,
    });
    expect(result.entries[1].score).toBe(5000);
    expect(result.recommendation.branch.id).toBe("poi-near-alice");
  });

  it("ranks by minimax; objectives can disagree on the recommendation", async () => {
    const map = new FakeMapProvider({
      branchesByBrand: {
        [brand]: [branchNearAlice, branchNearBob],
      },
    });
    // total: near-alice 1000+4000=5000, near-bob 3500+500=4000 → bob wins total
    // minimax: near-alice max=4000, near-bob max=3500 → bob wins minimax too... need disagree
    // Redesign:
    // near-alice: alice 1000, bob 3000 → sum 4000, max 3000
    // near-bob:   alice 2500, bob 500  → sum 3000, max 2500
    // total prefers near-bob (3000 < 4000)
    // minimax prefers near-bob (2500 < 3000) — still agree
    //
    // Disagree case:
    // near-alice: alice 1000, bob 2200 → sum 3200, max 2200
    // near-bob:   alice 2800, bob 200  → sum 3000, max 2800
    // total prefers near-bob (3000 < 3200)
    // minimax prefers near-alice (2200 < 2800)
    wireDistances(map, [branchNearAlice, branchNearBob], {
      alice: { "poi-near-alice": 1000, "poi-near-bob": 2800 },
      bob: { "poi-near-alice": 2200, "poi-near-bob": 200 },
    });

    const total = await meetingSearch(
      {
        participants: [alice, bob],
        brand,
        objective: "total_distance",
      },
      map,
    );
    const minimax = await meetingSearch(
      {
        participants: [alice, bob],
        brand,
        objective: "minimax",
      },
      map,
    );

    expect(isEmptyCandidateSet(total)).toBe(false);
    expect(isEmptyCandidateSet(minimax)).toBe(false);
    if (isEmptyCandidateSet(total) || isEmptyCandidateSet(minimax)) return;

    expect(total.recommendation.branch.id).toBe("poi-near-bob");
    expect(total.recommendation.score).toBe(3000);

    expect(minimax.recommendation.branch.id).toBe("poi-near-alice");
    expect(minimax.recommendation.score).toBe(2200);
    expect(minimax.entries[0].distances).toEqual({
      alice: 1000,
      bob: 2200,
    });
  });

  it("unions Participant-centered and center-centered searches and deduplicates", async () => {
    // Far-apart Participants so a mid-point Branch is only in range of the
    // geometric center search (radius 5 km), not either Participant.
    const west: Participant = {
      id: "west",
      label: "West",
      coordinates: { lat: 39.9, lng: 116.3 },
    };
    const east: Participant = {
      id: "east",
      label: "East",
      coordinates: { lat: 39.9, lng: 116.5 },
    };
    const nearWest: Branch = {
      id: "branch-west",
      name: "滨寿司·西店",
      address: "西路1号",
      coordinates: { lat: 39.9, lng: 116.305 },
    };
    const nearEast: Branch = {
      id: "branch-east",
      name: "滨寿司·东店",
      address: "东路1号",
      coordinates: { lat: 39.9, lng: 116.495 },
    };
    const centerOnly: Branch = {
      id: "branch-center-only",
      name: "滨寿司·中心店",
      address: "中心路1号",
      coordinates: { lat: 39.9, lng: 116.4 },
    };

    const map = new FakeMapProvider({
      branchesByBrand: {
        [brand]: [nearWest, nearEast, centerOnly],
      },
    });

    for (const participant of [west, east]) {
      for (const branch of [nearWest, nearEast, centerOnly]) {
        map.setDrivingDistance(
          participant.coordinates,
          branch.coordinates,
          1000,
        );
      }
    }

    const radiusMeters = 5_000;
    const result = await meetingSearch(
      {
        participants: [west, east],
        brand,
        objective: "total_distance",
        radiusMeters,
      },
      map,
    );

    expect(isEmptyCandidateSet(result)).toBe(false);
    if (isEmptyCandidateSet(result)) return;

    const center = {
      lat: (west.coordinates.lat + east.coordinates.lat) / 2,
      lng: (west.coordinates.lng + east.coordinates.lng) / 2,
    };

    expect(map.searchCalls).toHaveLength(3);
    expect(map.searchCalls.map((c) => c.near)).toEqual(
      expect.arrayContaining([
        west.coordinates,
        east.coordinates,
        center,
      ]),
    );
    for (const call of map.searchCalls) {
      expect(call.radiusMeters).toBe(radiusMeters);
    }

    const ids = result.entries.map((e) => e.branch.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("branch-center-only");
    expect(ids).toEqual(
      expect.arrayContaining([
        "branch-west",
        "branch-east",
        "branch-center-only",
      ]),
    );
    expect(ids).toHaveLength(3);
  });

  it("deduplicates co-located Participant centers and Distance calls", async () => {
    const same: Participant = {
      id: "same",
      label: "Same place",
      coordinates: { lat: 39.9, lng: 116.4 },
    };
    const map = new FakeMapProvider({
      branchesByBrand: { [brand]: [branchNearAlice] },
    });
    map.setDrivingDistance(
      alice.coordinates,
      branchNearAlice.coordinates,
      1000,
    );

    const result = await meetingSearch(
      {
        participants: [alice, same],
        brand,
        objective: "total_distance",
      },
      map,
    );

    expect(isEmptyCandidateSet(result)).toBe(false);
    if (isEmptyCandidateSet(result)) return;

    // Both Participants and the geometric center are the same point:
    // one Branch search and one driving call serve all of them.
    expect(map.searchCalls).toHaveLength(1);
    expect(map.distanceCalls).toHaveLength(1);
    expect(result.entries[0].distances).toEqual({ alice: 1000, same: 1000 });
    expect(result.entries[0].score).toBe(2000);
  });

  it("skips the Distance call when a Branch sits at a Participant's own point", async () => {
    const atBranch: Participant = {
      id: "at-branch",
      label: "At the branch",
      coordinates: { ...branchNearAlice.coordinates },
    };
    const map = new FakeMapProvider({
      branchesByBrand: { [brand]: [branchNearAlice] },
    });
    map.setDrivingDistance(
      alice.coordinates,
      branchNearAlice.coordinates,
      1000,
    );

    const result = await meetingSearch(
      {
        participants: [alice, atBranch],
        brand,
        objective: "total_distance",
      },
      map,
    );

    expect(isEmptyCandidateSet(result)).toBe(false);
    if (isEmptyCandidateSet(result)) return;

    expect(map.distanceCalls).toHaveLength(1);
    expect(map.distanceCalls[0]).toEqual({
      from: alice.coordinates,
      to: branchNearAlice.coordinates,
    });
    expect(result.entries[0].distances).toEqual({ alice: 1000, "at-branch": 0 });
    expect(result.entries[0].score).toBe(1000);
  });
});
