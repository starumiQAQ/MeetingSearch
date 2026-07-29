import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "../src/load-env.js";

describe("loadEnvFile", () => {
  it("loads unset keys from a .env file without overriding existing env", () => {
    const dir = mkdtempSync(join(tmpdir(), "meetingsearch-env-"));
    const path = join(dir, ".env");
    writeFileSync(path, "AMAP_KEY=from-file\nOTHER=1\n", "utf8");

    const prevAmap = process.env.AMAP_KEY;
    const prevOther = process.env.OTHER;
    delete process.env.AMAP_KEY;
    delete process.env.OTHER;
    process.env.OTHER = "already-set";

    try {
      loadEnvFile(path);
      expect(process.env.AMAP_KEY).toBe("from-file");
      expect(process.env.OTHER).toBe("already-set");
    } finally {
      if (prevAmap === undefined) delete process.env.AMAP_KEY;
      else process.env.AMAP_KEY = prevAmap;
      if (prevOther === undefined) delete process.env.OTHER;
      else process.env.OTHER = prevOther;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
