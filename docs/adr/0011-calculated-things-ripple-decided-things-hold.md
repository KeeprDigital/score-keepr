# Calculated things ripple, decided things hold

When a Correction replaces an earlier Result, everything calculated follows it: Standings, Tiebreakers, and who fills a Single Elimination Slot. Everything that was decided stays as it was: Pairings already made, who entered a Phase, and how Sections were formed. Each decision made from Standings that have since changed is flagged, and the Organiser may redo it or leave it. We chose this because a Correction can mean either thing, and the split follows what actually happened: the Standings were wrong, but the round was still played as paired.

## Considered Options

- **Ripple through everything.** Rejected: a Correction to round 2 would rewrite round 3's Pairings after round 3 was played.
- **A Correction changes nothing after its own round.** Rejected: Standings would knowingly disagree with the Results.
- **Ask the Organiser each time which is meant.** Rejected: the answer is the same every time for each kind of thing, so the engine can apply it and flag the rest.

## Consequences

- Standings can be worked out as any Action saw them, so the input of any past decision can be reproduced.
- A flagged decision can only be redone by a new Action. The engine never redoes one by itself.
- In Single Elimination a Correction can move a different Entrant into a later Pairing that already has a Result. That is flagged, not resolved.
