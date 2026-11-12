# The Pairing Engine is blind to match results and tiebreakers

The Pairing Engine never sees wins, losses, draws, point values or tiebreakers. The Consumer gives it finished facts per Entrant: Score, opponents already faced, Byes received, and Rank when a Constraint needs it. We chose this so pairing stays a small, separately testable black box that works for any game's scoring, and so there is one source of truth for Scores rather than the engine re-deriving them from results.

## Considered Options

- **Engine takes raw match results plus scoring rules and derives everything.** Rejected: it drags every game's scoring and tiebreaker rules into the engine, and pairing needs none of that detail. Tiebreakers only ever reach pairing as a position in the Standings.
- **Engine takes both results and Scores.** Rejected: two sources of truth that can disagree.

## Consequences

- Standings (Scores, tiebreakers, Rank) must be computed elsewhere. A sibling Standings module in the same repository will do this; the Pairing Engine never imports it.
- The Consumer is responsible for the facts being consistent. The engine can only check what is visible in them, such as two present Entrants disagreeing about having faced each other.
- Fixed-structure systems stay blind too: they return the whole structure with later slots described as "winner of pairing N", and the Consumer fills in winners.
