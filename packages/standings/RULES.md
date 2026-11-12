# Standings rules

Exactly how the Standings Engine turns Results into Score, Tiebreakers and Rank. `docs/standings-spec.md` says why. Words are defined in `GLOSSARY.md`.

Every number here is exact. Fractions are kept as fractions and never rounded.

## What a Result adds

**A Result with two Entrants.** For each side:

- Score goes up by the points the Configuration's points method gives that side.
- The round counts as played.
- The record gains a win, a loss or a draw, by the side's Outcome.
- The other Entrant is added to "opponents faced", however the Result ended.
- Game scores and Extra Scores are added up when given.

**A Bye**, assigned or awarded:

- Score goes up by the Configuration's Bye points.
- The record gains a win.
- If the Configuration says a Bye counts as played, the round counts as played and won, and its stated game score is added. If not, the round is left out of every rate.

**An Unplayed Loss**:

- Score goes up by the Configuration's points for it.
- The record gains a loss.
- It counts as played and lost, or is left out of every rate, as the Configuration says.

## Points methods

| Method | A side earns |
|---|---|
| `by-outcome` | the stated value for its win, draw or loss |
| `by-game-score` | the value listed for its own games won, lost and drawn. A game score that is not listed is an input error |
| `by-score-difference` | found from how far apart the two sides are on a named score. The first band whose `upTo` is not below the difference applies. The side that is ahead, or level, gets `higher`; the other gets `lower` |
| `by-score` | its own named score |

## Tiebreakers

Higher is better unless stated.

**Match win rate** of an Entrant, under a rate's settings:

1. Rounds counted: with `played`, the rounds that count as played. With `planned`, the planned rounds less any of the Entrant's rounds that do not count as played; but for a dropped Entrant, the rounds that count as played.
2. With `wins`: wins in rounds that count as played, over the rounds counted. A draw earns nothing.
   With `points`: points earned in rounds that count as played, over `perRound` times the rounds counted.
3. With no rounds counted, the rate is zero.
4. If there is a floor and the rate is below it, the floor is used.
5. If the Entrant has dropped and there is a cap, and the rate is above it, the cap is used.

| Tiebreaker | Value |
|---|---|
| `match-win-rate` | the Entrant's own match win rate |
| `opponents-match-win-rate` | the average of the match win rate of each opponent faced |
| `opponents-opponents-match-win-rate` | the average of the line above for each opponent faced |
| `game-win-rate` | (`win` × games won + `draw` × games drawn) over (`win` × games played), in rounds that count as played. Zero with no games. Then the floor |
| `opponents-game-win-rate` | the average of the game win rate of each opponent faced |
| `loss-rate` | losses over rounds, both in rounds that count as played. Zero with no rounds. **Lower is better** |
| `opponents-loss-rate` | the average of the loss rate of each opponent faced. **Lower is better** |
| `wins` | wins in Results with two Entrants, plus Byes when `includeByes` is set |
| `game-wins` | games won in Results with two Entrants, plus the Bye's games won for each Bye when `includeByes` is set |
| `score-total` | a named score added up: scored `for`, scored `against` (**lower is better**), or the `difference` |
| `later-losses` | the round number of each loss, squared, added up |

Averages over opponents:

- An opponent counts once per meeting, so one faced twice counts twice.
- A removed opponent still counts.
- An Entrant who has faced nobody gets the stated `withNoOpponents` value.

Two Tiebreakers are not a number per Entrant:

- **`head-to-head`** applies only where exactly two Entrants are level at that point. The one who has beaten the other more often than they have lost ranks higher. Otherwise it says nothing.
- **`random`** gives each Entrant a distinct whole number: the first 32 bits of the SHA-256 of `"tiebreaker"`, the Random Seed, the Entrant's id and an attempt number, moving on to the next attempt on a clash. Lower ranks higher. It does not depend on the round, so it never changes between recalculations.

## Rank

1. Entrants are ordered by Score, highest first.
2. Each Tiebreaker in turn separates Entrants who are still level.
3. Entrants level on everything share a Rank. The next Rank skips ahead: 1, 2, 2, 4.
4. Removed Entrants are left out. Their Results still count for everyone they played.
5. Rows that share a Rank are listed in order of id.

## Byes received

The count the Pairing Engine uses for its Bye cap. It is the assigned Byes, plus the awarded ones when the Configuration says `assigned-and-awarded`.

## Final Placings

- The winner of the last Pairing is placed first.
- The losers of a round are placed directly below everyone who got past it, in Rank order among themselves. They are placed only once every Pairing in that round has a winner.
- An Entrant in the cut who has not lost, while the cut is unfinished, is marked "still in" and not placed.
- Everyone outside the cut follows: the size of the cut, plus one, plus how many outside the cut have a strictly better Rank. Those who share a Rank share a placing.

## Presets

Each reproduces one dated rules document, and lists what that document leaves open. They are in `src/presets.ts`:

- `magic-2026-02-27`: Magic: The Gathering Tournament Rules, section 3.1 and Appendix C.
- `pokemon-2026-09-01`: Play! Pokémon Tournament Rules Handbook, sections 5.3.3.1, 5.5.2.1 and 5.6.1.

The worked examples in both documents are reproduced in `test/presets.test.ts`.
