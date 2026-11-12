# Random choices use a seeded position per Entrant

When the Constraints rate several sets of Pairings as equally good, Swiss chooses between them with Shuffle Positions: the Random Seed gives each Entrant a position, and the engine prefers pairing Entrants whose positions are close. With no Constraint in play this is "shuffle, then pair neighbours". We chose it over a random number per possible Pairing because exact matching at 20,000 Entrants depends on it, and accepted that equally good Pairings are not picked equally often.

## Considered Options

- **A random number per possible Pairing.** Rejected: less uneven (most-picked about 1.5x the least-picked, against about 2x), but no better per Entrant, and not shown to be fast. The proof step can skip most left-out Pairings only because their cost follows from two positions.
- **A uniform pick among all best Pairings.** Rejected earlier: impractical at scale.

## Consequences

- Round one is indistinguishable from a uniform pick. In later rounds the most-picked best set of Pairings comes up to about 2x as often as the least-picked (measured on fields of 8 to 12).
- How often a given Entrant gets a Pair-down or Bye is not materially different from a uniform pick.
- "Random" in this engine means seeded and unpredictable, not statistically uniform. Consumers should not promise uniform.
- A Shuffle Position depends only on the Random Seed, the round number and the Entrant's id, so input order never matters.
- Positions must be distinct. The prototype's can collide; the engine's must not.
- This definition decides Pairings, so changing it is a major release.
