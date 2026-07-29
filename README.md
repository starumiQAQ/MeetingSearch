# MeetingSearch

Local web app that ranks Brand Branches for a group of Participants under a chosen Proximity objective (total distance or minimax).

## Run

```bash
npm install
cp .env.example .env   # then set AMAP_KEY
npm start
```

Open http://localhost:3000 — enter free-text Participant addresses. The page geocodes via `POST /api/geocode` (unique hits apply automatically; ambiguous matches need a choice) and then posts resolved coordinates to `POST /api/search`. Ranking, Distances, and Candidate set still run **server-side**. The browser embeds a 高德 JS map for display (Participants / top Branches / disambiguation picks) when a JS key is configured (ADR-0003).

### MapProvider

| Config | Behavior |
|--------|----------|
| `AMAP_KEY` set in env or `.env` | Live 高德 `AmapMapProvider` (geocode, Branch POI, driving Distance) |
| Key missing / empty | Demo fake MapProvider (no network; sample 滨寿司 Branches) |
| `AMAP_QPS` (optional) | 高德 HTTP **次/秒** 上限；默认 **3**（不是同时在途数） |
| `AMAP_JS_KEY` (optional) | Web 端 JS API key for the browser map; falls back to `AMAP_KEY` if unset |
| `AMAP_SECURITY_JS_CODE` (optional) | JS API `securityJsCode` (needed for keys created after 2021-12-02) |

`.env` is gitignored. Commit only `.env.example` (empty key placeholders). Restrict the JS key with a domain whitelist in the 高德 console — it is injected into the page.

`POST /api/search` 仍可传 `"concurrency"` 控制 MeetingSearch 侧并行调度；真正打高德的频率由 `AMAP_QPS` 闸住。

## API

`POST /api/geocode`

```json
{ "address": "望京" }
```

Response: `{ "candidates": [ { "formattedAddress": "...", "coordinates": { "lat": 39.99, "lng": 116.47 } } ] }` — zero, one, or many candidates.

`POST /api/search`

```json
{
  "participants": [
    { "id": "p1", "label": "Haidian", "coordinates": { "lat": 39.98, "lng": 116.32 } },
    { "id": "p2", "label": "Wangjing", "coordinates": { "lat": 39.99, "lng": 116.47 } }
  ],
  "brand": "滨寿司",
  "objective": "total_distance",
  "radiusMeters": 15000,
  "concurrency": 3
}
```

`radiusMeters` is optional (default 15 km). `concurrency` is optional (default 3). Responses:

- **200** Ranking
- **404** `{ "kind": "empty_candidate_set", "message": "..." }` — no Branches in radius
- **502** `{ "kind": "map_provider_error", "message": "..." }` — key/HTTP/高德 API failure (not an empty Candidate set)

## Test

```bash
npm test
npm run typecheck
```

Unit tests mock the HTTP seam for `AmapMapProvider` (no live network). Optional live smoke:

```bash
AMAP_LIVE=1 npx vitest run tests/amap-live.smoke.test.ts
```

MeetingSearch seam tests cover both objectives (including disagreement), Candidate set union/dedupe, Empty candidate set, and default radius. Geocode seam tests cover unique / ambiguous / empty hits and `POST /api/geocode`.
