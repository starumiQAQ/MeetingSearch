import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SERVICE_KEYS = [
  "AMAP_KEY",
  "AMAP_JS_KEY",
  "AMAP_SECURITY_JS_CODE",
  "AMAP_QPS",
] as const;

export type ServiceEnvKey = (typeof SERVICE_KEYS)[number];

/**
 * Upsert KEY=VALUE lines in a .env file while preserving comments and unknown keys.
 * Setting a value to "" writes `KEY=` (empty). Missing file is created.
 */
export function upsertEnvKeys(
  filePath: string,
  updates: Partial<Record<ServiceEnvKey, string>>,
): void {
  const keys = Object.keys(updates) as ServiceEnvKey[];
  if (keys.length === 0) return;

  const original = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = original.length > 0 ? original.split(/\r?\n/) : [];
  // Drop a single trailing empty line from split so we can re-join cleanly.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const seen = new Set<ServiceEnvKey>();

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const key = trimmed.slice(0, eq).trim() as ServiceEnvKey;
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key] ?? ""}`;
  });

  for (const key of keys) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${updates[key] ?? ""}`);
    }
  }

  const body = nextLines.join("\n");
  writeFileSync(filePath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
}
