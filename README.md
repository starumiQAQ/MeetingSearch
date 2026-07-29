# MeetingSearch

Local web app that ranks Brand Branches for a group of Participants under a chosen Proximity objective (total distance or minimax).

## Run

```bash
npm install
cp .env.example .env   # then set AMAP_KEY
npm start
```

Open http://localhost:3000 — enter free-text Participant addresses. The page geocodes via `POST /api/geocode` (unique hits apply automatically; ambiguous matches need a choice) and then posts resolved coordinates to `POST /api/search`. Map calls run **server-side** only; the browser never sees `AMAP_KEY`.

### MapProvider

| Config | Behavior |
|--------|----------|
| `AMAP_KEY` set in env or `.env` | Live 高德 `AmapMapProvider` (geocode, Branch POI, driving Distance) |
| Key missing / empty | Demo fake MapProvider (no network; sample 滨寿司 Branches) |

`.env` is gitignored. Commit only `.env.example` (empty key placeholder).

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
  "radiusMeters": 15000
}
```

`radiusMeters` is optional (default 15 km). Responses:

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
