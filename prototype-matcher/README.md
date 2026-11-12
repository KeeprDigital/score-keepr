# PROTOTYPE: exact Swiss matcher

Throwaway code. It exists to answer two questions before the real engine is built. Do not ship it or build on it.

## Questions and verdicts

**1. Can pairings be provably best under the priority order at 10,000 and 20,000 entrants, fast enough?**

Yes. Every round of every run below was proven best over all possible pairings.

| Entrants | Slowest round |
|---|---|
| 2,001 | under 0.2 s |
| 10,000 | 0.2 to 0.3 s |
| 20,000 | 0.4 to 0.5 s |
| 50,000 | 2.2 s |
| 100,000 | 4.3 s |

Target was 2 s at 10,000 and 10 s at 20,000. Measured on an Apple M4 under Node 26, one thread. Not measured on a mid-range laptop or in a browser.

**2. How far from uniform is the seeded tiebreak?**

- Round 1, nothing constraining: indistinguishable from uniform.
- Later rounds, fields of 8 to 12: the most-picked best pairing comes up to about 2x as often as the least-picked.
- Per entrant (how often someone gets a pair-down or bye): no material difference from a uniform pick. The unevenness there comes from the constraints, not the tiebreak.

## What changed from the design as discussed

The tiebreak is defined per entrant, not per pair. Each entrant gets a seeded position on a line and a pairing costs the squared distance between positions. With nothing else in play this is "shuffle, then pair neighbours". The speed above depends on it. A per-pair random number was measured too: less skewed per pairing (about 1.5x), same per entrant, but not shown to be fast.

Accepted as the engine's definition of random: see `docs/adr/0005-random-choices-use-a-position-per-entrant.md`.

## How it works

- `matcher.mjs`: exact maximum-weight perfect matching on a general graph. Costs are vectors compared in priority order, so strict priority needs no big-number arithmetic.
- `swiss.mjs`: one Swiss round with the default order. The matcher sees a sparse set of likely pairings; every pairing left out is then checked against the matcher's proof. Any that could improve the result is added and the round re-solved (typically once).
- `bench.mjs`: simulates a whole event and times each round.
- `skew.mjs`: tiebreak skew by brute force on small fields.
- `test-small.mjs`: matcher against brute force.

## Run

```
node prototype-matcher/test-small.mjs 20000
node prototype-matcher/bench.mjs 20000 15 1
CHECK=1 node prototype-matcher/bench.mjs 400 9 1
node prototype-matcher/skew.mjs 300000
```

`CHECK=1` also solves each round over every possible pairing and requires the same cost (events up to 1,500 entrants).

## Evidence of correctness

- 40,000 random small graphs: same optimum as brute force.
- 1,500 medium graphs: same optimum as an existing library (`edmonds-blossom`).
- Simulated events from 6 to 1,200 entrants, including ones run far past a sensible round count so rematches are forced: sparse-plus-proof result equals the optimum over every pairing.
- Every benchmark round passed its own proof check.

## Not covered

- Only the default order (no rematch, bye cap, bye to lowest score, pair close in score, keep top clean, tiebreak). No club avoidance, avoid lists, rank-based constraints or pair-down settings.
- Tiebreak positions are 20-bit, so two entrants can share one. The real engine needs wider positions.
- Simulated results only (3% draws, 4% drops among entrants with two or more losses).
- Skew measured on fields up to 12 only.
- No input validation, no work limit, no worst-case time bound.
