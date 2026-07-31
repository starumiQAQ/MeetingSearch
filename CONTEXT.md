# Meeting place

Find a brand's nearby branch that best fits a group of people who need to meet.

## Language

**Geocode candidate**:
One plausible match returned when resolving a Participant's free-text address. The user must choose exactly one before that Participant is ready for Ranking.
_Avoid_: Autocomplete suggestion, POI (when meaning an address match)

**Participant**:
A person whose location is an input to the meeting search. The organizer enters a name, looks up a free-text address, and chooses one Geocode candidate; only then is the Participant added and ready for Ranking.
_Avoid_: User, friend, member

**Brand**:
The chain or place name the group wants (e.g. 滨寿司), not a specific address.
_Avoid_: Store name, restaurant, POI (when meaning the chain)

**Branch**:
One concrete outlet of a Brand at a known location.
_Avoid_: Store, shop, location (when meaning a specific outlet)

**Proximity objective**:
How "closest to everyone" is scored. The Participant chooses one per search: **total distance** (minimize sum of distances) or **minimax** (minimize the farthest Participant's distance).
_Avoid_: Nearest, best, optimal (without naming which objective)

**Distance**:
Driving route length between two points, in meters — not crow-fly, walking, or travel time.
_Avoid_: ETA, duration, straight-line, walking distance

**Candidate set**:
The Branches considered for a search: the union of Brand POI results around every Participant and around the group's geometric center (mean of Participant coordinates), deduplicated. Search radius is configurable; default 15 km for both Participant-centered and center-centered queries.
_Avoid_: Search results, nearby stores (without saying how they were gathered)

**Ranking**:
The Candidate set ordered by the chosen Proximity objective, with per-Participant Distances shown. The top Branch is the meeting recommendation. Ranking runs only after every Participant has a chosen Geocode candidate.
_Avoid_: Winner-only result, best store (without the ordered list)

**Empty candidate set**:
When no Branches are found within the search radius, the search fails with a clear error and a suggestion to increase the radius or change the Brand — it does not silently widen the radius.
_Avoid_: Auto-expand, fallback to other brands
