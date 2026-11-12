# Pairing rules

How the Pairing Engine decides which set of Pairings is best. This is the exact definition; `docs/spec.md` says why. Words are defined in `GLOSSARY.md`.

## Best

Every set of Pairings gets one whole number per level. Lower is better. Sets are compared level by level, in order, and the first level that differs decides.

The levels are the Constraints of the Configuration in the order given, followed by Shuffle Positions.

Each level scores one Pairing, or the Bye, on its own. A set of Pairings scores the sum. No level looks at more than one Pairing at a time.

## Terms used below

- **present**: in this call.
- **gap** of a Pairing: the difference between its two Scores.
- **Pair-down**: a Pairing whose gap is not zero.
- **place** of an Entrant: how many present Entrants have a strictly better Rank. The best Rank has place 0. Entrants who share a Rank share a place.
- **N**: how many Entrants are present.

## Yes-or-no Constraints

Each scores 1 when broken and 0 otherwise. A broken one is reported as a Violation.

| Constraint | A Pairing scores 1 when | The Bye scores 1 when |
|---|---|---|
| `no-rematch` | either Entrant lists the other as an opponent | never |
| `bye-cap` (max) | never | the Entrant's Byes received are `max` or more |
| `avoid-same-group-label` (kind) | both have a Group Label of that kind and the values are equal | never |
| `avoid-listed-pairs` | the two are a listed pair, either way round | never |

## Measured Constraints

| Constraint | A Pairing scores | The Bye scores |
|---|---|---|
| `prefer-same-group-label` (kind) | 1 when both have a Group Label of that kind and the values differ | 0 |
| `bye-to-lowest-score` | 0 | the Entrant's Score minus the lowest present Score |
| `bye-to-lowest-rank` | 0 | how many present Entrants have a strictly worse Rank |
| `pair-close-in-score` | the gap squared | 0 |
| `keep-top-clean` | for a Pair-down: the higher Score minus the lowest present Score, plus 1 | 0 |
| `keep-bottom-clean` | for a Pair-down: the highest present Score minus the lower Score, plus 1 | 0 |
| `pair-adjacent-by-rank` | the difference between the two places, squared | 0 |
| `pair-top-vs-bottom-by-rank` | (the two places added together, minus N − 1), squared | 0 |

`pair-down-choice` (from, opponent) is two levels, in this order:

1. For a Pair-down, how far the Entrant with the higher Score is from being the one `from` asks for.
2. For a Pair-down, how far the Entrant with the lower Score is from being the one `opponent` asks for.

"How far" counts Entrants in the same Score Group: for `highest`, those with a strictly better Rank; for `lowest`, those with a strictly worse Rank; for `random`, always 0.

## Shuffle Positions

The last level, always.

- Each Entrant gets a whole number from 0 to 2³² − 1: the first 32 bits of the SHA-256 of `"shuffle"`, the Random Seed, the round number, the Entrant's id and an attempt number starting at 0. Each part is written as its length in bytes then its UTF-8 bytes.
- Positions are made distinct. Entrants are taken in order of id; one whose position is already held tries the next attempt number.
- A Pairing scores the difference between the two positions, squared. The Bye scores the Entrant's position, squared.

With no Constraint in play this is "shuffle, then pair neighbours".

## The result

- Within a Pairing: higher Score first, then better Rank when every Entrant has one, then lower Shuffle Position.
- Between Pairings: by the higher Score, then the lower Score, then the best Rank in the Pairing when every Entrant has one, then the lowest Shuffle Position in the Pairing.
- Violations are listed in Configuration order.

## Limits today

- A Score must be a whole number from −1,000,000 to 1,000,000.
- Fields of up to 14 Entrants are solved by trying every set of Pairings, and are proven best.
- Larger fields get a simple pairing in Score order, marked not proven, until the fast matcher is built.
- If two sets of Pairings tie on every level, the engine's choice is fixed for a given version but is not defined here. With distinct 32-bit positions this is not expected to happen.
