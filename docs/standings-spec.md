# Standings Engine v1 spec

Turns Results into Standings. Words are defined in `GLOSSARY.md`. The pairing side is in `docs/spec.md`.

Every point here has been agreed.

## Scope

- **v1**: Standings for the round-by-round stage, and Final Placings after a Top Cut.
- **Later**:
  - Chess Tiebreakers and chess rules for unplayed rounds.
  - Flesh and Blood's round-weighted Tiebreaker. Its two official sources give different formulas.
  - Soft scores per Entrant, such as painting or sportsmanship.
  - Point band tables beyond the four points methods below.
  - Final Placings for a Single Elimination Pairing with no winner, which the Tournament Engine needs (`docs/tournament-spec.md`).
- **Out of scope**:
  - Extra play-off matches. The Consumer runs them.
  - Team line-ups. A Team is one Entrant; the Consumer combines its Players' results.
  - Storage. Designed with the larger product.

## Package

- Same rules as the Pairing Engine: synchronous pure functions, plain JSON in and out, no clock, no I/O, no Consumer-supplied functions, never throws.
- Same repository, its own package and its own version. Neither engine depends on the other. Both use the shared package (`docs/spec.md`, Shared package).
- The same input gives the same output, whatever order Entrants or Results arrive in.
- Every call recalculates the whole tournament from the Results given. No running totals.
  - Standings as of round 4 is the Consumer passing rounds 1 to 4.
  - A corrected Result means calling again.
  - Mid-round, the engine works from whatever Results exist. A Pairing not yet reported is simply absent.
- All fractions are exact. Two Entrants on two thirds compare equal on every machine. Rounding happens only in a value meant for display.

## Input

**Entrants**: every Entrant, so that one with no Results still appears.

| Fact | Details |
|---|---|
| id | String, unique. |
| Status | Optional: dropped, with the last round they took part in; or removed. |

**Results**: one flat list.

| Kind | Holds |
|---|---|
| Two Entrants | The round. An Outcome for each side: win, loss or draw. Both may lose. Optionally the games won by each and games drawn. Optionally Extra Scores per side, such as victory points. |
| One Entrant | The round, and what it is: a Bye assigned by pairing, a Bye awarded by the Organiser, or an Unplayed Loss (Late Entry, penalty). |

**Per call**:

| Input | Details |
|---|---|
| Configuration | Required. The points method, the allowed Outcomes and the Tiebreakers in order, with every setting stated. Nothing is assumed. A Preset or the starting Configuration can be passed as it is. |
| Planned rounds | Optional. Used by a win rate that counts planned rounds. For Standings during an event, pass the rounds completed so far. |
| Random Seed | String. Needed only when the random Tiebreaker is chosen. |

Optional inputs are required only when the chosen Configuration uses them. Game scores, an Extra Score, Status and planned rounds all follow this rule; a missing one is an input error.

## Configuration

Plain data from a catalogue the engine defines. No Consumer code.

### Points

Points always come from the Configuration. A Result never states its own points. One of four methods:

| Points come from | Example |
|---|---|
| The Outcome | win 3, draw 1, loss 0 |
| The game score | 2-0 earns 7; 1-1 earns 3 each |
| The difference in an Extra Score | victory points 0 to 5 apart: 10 each; 6 to 10 apart: 11 and 9 |
| An Extra Score itself | Score is total victory points |

How a Bye scores is a separate setting: its points, its game score, and whether it counts as a round played. An Unplayed Loss has the same three settings.

### Allowed Outcomes

The Configuration states whether draws are allowed and whether double losses are allowed. A Result using a disallowed Outcome is an input error.

Whatever the Configuration, the two sides of a Result can only be win and loss, draw and draw, or loss and loss.

### Tiebreakers

The v1 catalogue:

- Own match win percentage.
- Opponents' match win percentage. This is strength of schedule.
- Opponents' opponents' match win percentage. This is extended strength of schedule.
- Own game win percentage.
- Opponents' game win percentage.
- Loss rate, own and opponents'.
- Counts: wins, game wins.
- For an Extra Score: total for, total against, and the difference. The difference is margin of victory.
- Later losses rank higher.
- Head-to-head, when exactly two Entrants are level and they met.
- Random.

Each rate carries settings: whether it counts wins or points, whether it runs over rounds played or planned rounds, the minimum floor, a cap for dropped Entrants, and what an Entrant with no opponents gets. Exact definitions are in `packages/standings/RULES.md`.

### Still level

Entrants level on every Tiebreaker share a Rank. The random Tiebreaker, placed last, makes every Rank unique. Single Elimination refuses shared Ranks, so a Consumer running a cut must choose.

An Entrant's random value comes from the Random Seed and their id only, never the round. A tie broken one way stays broken that way on every recalculation.

### Presets

Standings formulas are published for most rule sets, so the engine ships Presets.

- Each Preset is tied to one dated rules document.
- A Preset exists only where that document specifies every setting. Any assumption is listed with it.
- A rules update adds a new Preset. An existing Preset never changes.
- Built: Magic (February 27 2026) and Pokémon (September 1 2026). Each lists five or six points its document leaves open, and the choice made.
- Not built: One Piece and Star Wars Unlimited, which each leave a setting unstated.

### Starting Configuration

Shipped as named data. The Consumer passes it in explicitly or adapts it; the engine never applies it on its own.

- Points from the Outcome: win 3, draw 1, loss 0. A Bye scores as a win.
- Draws and double losses allowed.
- Tiebreakers: opponents' match win percentage, then opponents' opponents' match win percentage, each opponent floored at one third.
- No random Tiebreaker, so level Entrants share a Rank.

It needs match Outcomes only, no game scores.

## Output

One row per Entrant, in order:

- Score.
- The record: wins, losses and draws.
- The value of each Tiebreaker, as an exact fraction plus a plain number for display.
- Rank.
- What pairing needs: opponents faced and Byes received. A mapping function in the shared package turns rows into pairing Entrants.
- Counts of assigned and Awarded Byes.

Plus the engine version.

**Opponents faced**: every Result with two Entrants counts, however it ended, including a double loss or a no-show.

**Byes received**: counts Byes assigned by pairing. A setting includes Awarded Byes too.

**Removed Entrants**: no Rank and no row in the order. Results against them still count for their opponents' Score and Tiebreakers.

**Divisions**: where divisions share Pairings but have separate Standings, the engine ranks the whole field and the Consumer filters by division. Tiebreakers must count opponents from other divisions, so the calculation cannot be split. Single Elimination accepts gaps in Ranks, so filtered Ranks can be passed on as they are.

## Final Placings

A second function. It takes the Single Elimination Results and the Ranks from the round-by-round stage and returns Final Placings.

- Entrants in the cut are placed by round reached, then by Rank.
- Everyone outside the cut follows in Rank order.
- If the cut is unfinished, Entrants still in it are marked "still in" and not placed.

## Errors

Invalid input returns error values and no Standings. Invalid includes:

- A Result naming an unknown Entrant.
- An Entrant with two Results in the same round.
- Data missing that the chosen Configuration needs.
- Configuration missing, or an entry with a setting missing.
- An Outcome the Configuration does not allow, or an impossible pair of Outcomes such as win and win.

## API shape

- `computeStandings` and `finalPlacings`, both in the Standings package. `checkPairings` is in the pairing package.
- Each returns `ok: false` with errors or `ok: true` with rows, like the Pairing Engine.

## Guarantees and tests

Same promises as the Pairing Engine, each enforced by tests:

- Same input, same output, whatever the input order.
- Malformed input never throws.
- Stored reference outputs catch accidental changes.
- Each Preset is checked against the worked examples in its source document, where the document has them.

## Speed

- Target: a full recalculation for 20,000 Entrants over 15 rounds in 1 second, one thread, mid-range laptop.
- Measured: 20,001 Entrants, 15 rounds, 150,015 Results: about 0.4 s under the starting Configuration and both Presets (Apple M4, Node 26). Not measured on a mid-range laptop or in a browser.

## Decision records

- ADR 0006: the Standings Engine owns all points logic and calculates exactly.
- ADR 0007: Presets are dated and never change.
