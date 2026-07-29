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

    // interval 500ms → starts at 0,500,1000,1500,2000
    expect(starts).toEqual([0, 500, 1000, 1500, 2000]);
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
