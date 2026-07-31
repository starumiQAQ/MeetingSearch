/**
 * Limits how many async tasks run at once. Extra callers wait their turn.
 */
export function createConcurrencyGate(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  let active = 0;
  const waiters: Array<() => void> = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const tryAcquire = () => {
        if (active < limit) {
          active += 1;
          resolve();
        } else {
          waiters.push(tryAcquire);
        }
      };
      tryAcquire();
    });

    try {
      return await fn();
    } finally {
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

/**
 * Caps how often work may *start*: at most `qps` starts in any rolling 1s window.
 * Matches 高德 personal-key limits such as 3 次/秒 (not merely in-flight count).
 *
 * Fixed spacing of `1000/qps` is not enough: for qps=3 it still allows 4 starts
 * inside some 1s windows (e.g. t=1000,1333,1667,2000), which triggers
 * CUQPS_HAS_EXCEEDED_THE_LIMIT.
 */
export function createQpsGate(
  qps: number,
  options?: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
) {
  if (!Number.isFinite(qps) || qps <= 0) {
    throw new Error("qps must be a positive number");
  }

  const now = options?.now ?? Date.now;
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const recentStarts: number[] = [];
  let tail: Promise<void> = Promise.resolve();

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const slot = tail.then(async () => {
      for (;;) {
        const t = now();
        while (recentStarts.length > 0 && t - recentStarts[0]! >= 1000) {
          recentStarts.shift();
        }
        if (recentStarts.length < qps) {
          recentStarts.push(t);
          return;
        }
        const waitMs = Math.max(1, recentStarts[0]! + 1000 - t);
        await sleep(waitMs);
      }
    });
    // Keep the chain moving even if a waiter fails.
    tail = slot.catch(() => {});
    return slot.then(() => fn());
  };
}

/** Run async work over items with at most `limit` tasks in flight. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const gate = createConcurrencyGate(limit);
  return Promise.all(
    items.map((item, index) => gate(() => worker(item, index))),
  );
}
