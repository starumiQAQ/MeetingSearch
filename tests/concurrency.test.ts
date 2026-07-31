import { describe, expect, it, vi } from "vitest";
import { createQpsGate } from "../src/concurrency.js";
import { AmapMapProvider } from "../src/amap-map-provider.js";
import { DEFAULT_AMAP_QPS } from "../src/types.js";

type FetchFn = typeof fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AmapMapProvider QPS (次/秒)", () => {
  it("defaults to 3 requests per second", () => {
    expect(DEFAULT_AMAP_QPS).toBe(3);
  });

  it("createQpsGate never allows more than qps starts in any 1s window", async () => {
    let t = 0;
    const starts: number[] = [];
    const gate = createQpsGate(3, {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });

    await Promise.all(
      Array.from({ length: 7 }, () =>
        gate(async () => {
          starts.push(t);
        }),
      ),
    );

    for (let i = 0; i < starts.length; i++) {
      const windowStart = starts[i]!;
      const inWindow = starts.filter((s) => s >= windowStart && s < windowStart + 1000);
      expect(
        inWindow.length,
        `at t=${windowStart}: starts ${inWindow.join(",")} exceed qps=3`,
      ).toBeLessThanOrEqual(3);
    }
  });

  it("createQpsGate spaces starts to at most qps per second", async () => {
    let t = 0;
    const starts: number[] = [];
    const gate = createQpsGate(2, {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        gate(async () => {
          starts.push(t);
        }),
      ),
    );

    // Sliding 1s window, qps=2 → starts at 0,0+ε, then wait for window.
    // With integer ms: 0, 0 (same ms if sleep 0?), actually second must wait
    // until first+1000 if 2 already in window... first two can start at 0 and
    // after min spacing. For sliding window of 2/s: start[0]=0, start[1]=0
    // would be 2 in window — allowed. start[2] must wait until start[0]+1000.
    expect(starts[0]).toBe(0);
    expect(starts.length).toBe(5);
    for (let i = 0; i < starts.length; i++) {
      const windowStart = starts[i]!;
      const inWindow = starts.filter((s) => s >= windowStart && s < windowStart + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(2);
    }
  });

  it("AmapMapProvider does not start more than qps HTTP calls per second", async () => {
    let t = 0;
    const startTimes: number[] = [];

    const fetchMock = vi.fn<FetchFn>(async () => {
      startTimes.push(t);
      return jsonResponse({
        status: "1",
        info: "OK",
        route: { paths: [{ distance: 1000 }] },
      });
    });

    // Inject fake clock into gate via constructing provider... we test through
    // createQpsGate above; here verify provider option wiring with real timers.
    const map = new AmapMapProvider({
      apiKey: "test-key",
      fetch: fetchMock,
      qps: 3,
    });

    const from = { lng: 116.32, lat: 39.98 };
    const destinations = [
      { lng: 116.33, lat: 39.98 },
      { lng: 116.34, lat: 39.98 },
      { lng: 116.35, lat: 39.98 },
      { lng: 116.36, lat: 39.98 },
    ];

    const started = Date.now();
    await Promise.all(
      destinations.map((to) => map.drivingDistance(from, to)),
    );
    const elapsed = Date.now() - started;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    // 4 starts at 3/s → at least ~1s between first and fourth (3 intervals of ~333ms)
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});
