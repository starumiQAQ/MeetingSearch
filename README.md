# MeetingSearch

Local web app that ranks Brand Branches for a group of Participants under a chosen Proximity objective (total distance or minimax).

## Run

```bash
npm install
npm start
```

Open http://localhost:3000 — the form posts to `POST /api/search`. Map traffic uses an injectable fake MapProvider (no 高德 key needed for this ticket).

## API

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

`radiusMeters` is optional (default 15 km). Response is a Ranking or an Empty candidate set error.

## Test

```bash
npm test
npm run typecheck
```

MeetingSearch seam tests cover both objectives (including disagreement), Candidate set union/dedupe, Empty candidate set, and default radius.
