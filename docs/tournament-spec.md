# Tournament Engine v1 spec

Turns the record of what happened in a tournament into the tournament as it stands, and makes the next entry in that record. Words are defined in `GLOSSARY.md`. Pairing is in `docs/spec.md`, Standings in `docs/standings-spec.md`.

Designed, not built. Every point here has been agreed.

## Scope

- **v1**:
  - Any number of Phases in any order, one at a time. Each is Swiss or Single Elimination.
  - Sections: Entrants in a Phase paired in separate sets, which covers pods and divisions.
  - Drops, returns, removals, late entries, awarded Byes, no-shows.
  - Hand-made Pairings, assessed by the Pairing Engine.
  - Corrections to earlier Results.
  - Table numbers.
  - Any number of Devices, online or offline.
  - Advice on round count from attendance.
- **Later, each after its own design**:
  - Two Phases running side by side, such as a consolation event.
  - Team events.
  - Round-count and cut tables from publishers' documents, as dated Presets.
  - Point deductions. They need a change to the Standings Engine first.
- **Out of scope**:
  - Storage, sync, accounts and screens. The Consumer owns them.
  - Permissions. Every Action records who made it; the Consumer decides who may do what.
  - Penalties, deck checks and time extensions.
  - Pairings of more than two Entrants.

## Package

- `@score-keepr/tournament`. Synchronous pure functions, plain JSON in and out, no clock, no I/O, no Consumer-supplied functions, never throws.
- It depends on the Pairing Engine, the Standings Engine and the shared package, and calls them (ADR 0010). None of them depends on it.
- No runtime dependencies outside this repository.
- The same Log gives the same tournament on every Device, whatever order its Actions arrived in.

## The Log

The Log is the only truth (ADR 0008). Everything else is worked out from it and may be cached.

- The Log is a set of Actions. Actions are added, never edited or removed.
- Every Action carries:

| Part | Details |
|---|---|
| Id | The Device's id and a counter. It cannot collide across Devices. |
| Device | The Device that made it. The Consumer gives each Device a unique id. |
| Who | The person who did it, as the Consumer names them. Kept for audit; the engine applies no permission rules. |
| Seen | The latest Action this Device had seen from every Device when it made this one. |
| Engine version | The version that made it. |
| What | One entry from the catalogue of Actions below. |

- **Counter**: one more than the highest counter among everything the Device had seen.
- **Combining**: two Logs combine by keeping every Action from both. An Action met twice counts once.
- **Order**: by counter, then by Device id. An Action therefore always comes after everything its Device had seen. No clock is used.
- An Action that had seen an earlier one about the same thing replaces it. That is how a correction or a re-pairing works.
- Two Actions about the same thing where neither had seen the other are a Clash. See Clashes.

## Actions

A fixed catalogue.

| Action | What it records |
|---|---|
| Tournament created | The Random Seed. |
| Entrant added | Id and labels, such as club or division. For a late entry, the running Phase and Section they join. |
| Entrant changed | New labels. |
| Entrant dropped | The last round they take part in. |
| Entrant returned | A dropped Entrant comes back. |
| Entrant removed | Disqualified. No Rank; their Results still count for their opponents. |
| Phase started | Its settings, who entered, its Sections, and for Single Elimination the whole structure. |
| Phase changed | New planned rounds or Configurations. |
| Phase ended | The Phase is over. |
| Round paired | Pairings, Byes and tables for one Section's round, engine-made or hand-made, with the input used and the Pairing Engine's assessment. |
| Result recorded | Outcome, games and extra scores for one Pairing. |
| Round missed | An awarded Bye, or a loss with no opponent, for an Entrant not paired that round. |
| Flag settled | The organiser accepts a flagged situation as it is. |
| Tournament finished | The final order as published. |

## Phases

A tournament is a list of Phases. The engine imposes no order on them.

The Action that starts a Phase states everything about it. Nothing is assumed.

| Setting | Details |
|---|---|
| Pairing System | Swiss or Single Elimination. |
| Who takes part | One entry from the catalogue below. |
| What counts | Which earlier Phases count towards this Phase's Standings. Counting a Phase brings its Scores, Tiebreakers and opponents already faced. Counting none starts fresh. |
| Sections | None, or how they are made. See Sections. |
| Standings Configuration | Used for every Result that counts in this Phase. |
| Pairing Configuration | Used for each round, unless a pairing call passes another. The Action records what was used. |
| Planned rounds | For Swiss. Can be changed by a later Action. |
| Tables | See Tables. |

**Who takes part**, a fixed catalogue:

- everyone still in
- the best N by Rank
- everyone with at least a given Score
- a hand-picked list

Rank and Score come from the Standings of the Phases named as counting, as they stand when the Phase is started. Dropped and removed Entrants are left out. Who entered is recorded in the Action and does not change by itself afterwards.

**Examples**

- A Top Cut: a Single Elimination Phase entered by the best 8 by Rank.
- A day two: a Swiss Phase entered by everyone on at least 19, counting day one.
- Two drafts: two Swiss Phases, each with Sections of 8, the second made in Rank order.

**Single Elimination**: the structure is built when the Phase starts and recorded in the Action. Winners fill later Slots as Results arrive. Entrants need different Ranks; if the line falls between Entrants who share one, starting the Phase is refused, and the organiser adds a Tiebreaker or hand-picks.

A Single Elimination Result has one winner, or both lose. When both lose:

- The Entrant who would have met the winner gets a Bye.
- If both Pairings feeding a later Pairing end that way, that Pairing has nobody, and the Entrant after it gets a Bye too.
- In the final, first place is left empty and both are placed second.

**Rounds handed to the Standings Engine** are numbered on from one counted Phase to the next.

## Sections

A Phase can split its Entrants into Sections. Each Section is paired on its own, with its own Bye when its count is odd. Sections are fixed for the whole Phase.

A Section is made one of three ways:

- by size, in Rank order
- by size, at random, using the Random Seed
- from a label the organiser supplies, which covers divisions

**By size**, the sizes come one of two ways:

- **A range**: the smallest and largest allowed. Sections are as even as possible inside it. When no split fits, the largest is exceeded by as little as possible.
- **An explicit list**: the organiser states the sizes, such as 8, 6 and 6. This reproduces any publisher's table exactly.

No one formula fits the publishers: Magic asks for pods "of roughly equal size", Lorcana publishes a table that is not even, and One Piece drafts in pods of four. Their tables can be added later as dated data.

The organiser can move Entrants between Sections before the first round is paired.

Standings cover the whole Phase and can be filtered by Section.

## Rounds

- **Pairing a round** is one call. It works out the Standings, maps them to pairing input, calls the Pairing Engine, assigns tables, and returns a "Round paired" Action. Working out a tournament from its Log never pairs again; it reads the Action.
- **Who is paired**: the Entrants of the Section who have not dropped or been removed.
- **Random Seed**: the tournament holds one. Each pairing call's seed is built from it plus the Phase, Section, round and an attempt number. Re-pairing uses the next attempt. Anyone holding the Log can predict Pairings.
- **Same Log, same Pairings**: two Devices that had seen the same Log make identical Pairings.
- **Hand-made Pairings** are recorded the same way, with the Pairing Engine's assessment: Violations, and whether they are as good as the best.
- **A round is complete** when every Pairing in it has a Result. Pairing the next round before that is allowed and flagged.
- **A missed round** counts as nothing until a "Round missed" Action says otherwise. This covers late entries and Entrants who sat a round out.
- **No device is special.** Nothing limits which Device may pair a round (ADR 0008). The Consumer warns when someone pairs while out of contact with the others.

## Tables

Settings per Section:

| Setting | Details |
|---|---|
| Order | Best-ranked Pairing first, or random by the Random Seed. |
| Starting table | A number the organiser chooses. |
| Unavailable tables | Skipped. |
| Fixed tables | Named Entrants always sit at a given table. If both Entrants in a Pairing have one, the lower number is used. |
| Avoid repeats | Optional. As few Entrants as possible are put on a table they have already played on. |

A table is changed by hand by recording the round again with the same Pairings.

## Results and corrections

- A Result names its Pairing. A later Result for the same Pairing, from a Device that had seen the earlier one, is a correction and replaces it.
- **Calculated things ripple** (ADR 0011). Standings, Tiebreakers and who fills a Single Elimination Slot always reflect the Results as they now stand.
- **Decided things hold.** Pairings already made, who entered a Phase and how Sections were formed are recorded and never rewritten. Each one made from Standings that have since changed is flagged. The organiser can redo it with a new Action, or leave it.
- **Standings as they stood**: Standings can be worked out as any Action saw them, which reproduces the input of any earlier pairing call.

## Clashes

A Clash is two Actions about the same thing where neither had seen the other. Nothing is refused and nothing is discarded (ADR 0009). Every Device applies the same rule.

| Clash | Rule |
|---|---|
| Two Results for one Pairing | Identical: counted once. Different: the first in order is used, and the Pairing is flagged as disputed until a later Result settles it. |
| One round paired twice | Identical: counted once. Different: the first in order stands and the other is set aside. |
| An Entrant dropped or removed, and also paired | Both stand, flagged. |
| A setting changed twice | The last in order applies, flagged. |

**Results against Pairings that no longer stand**, whether set aside by a Clash or replaced by a re-pairing: the Result carries over if the same two Entrants are paired in the set that stands, and is shown as carried over. Otherwise it is kept and flagged.

## Flags

A Flag asks an organiser to look at something. It never blocks anything. v1 raises:

- A Result is disputed.
- Pairings were set aside, or a Result is left without a Pairing.
- An Entrant was dropped or removed but is paired.
- A decision was made from Standings that have since changed: Pairings, who entered a Phase, or how Sections were formed.
- A round was paired while Results were missing.
- Hand-made Pairings break a Constraint, or are not as good as the best.
- A set of Pairings is not proven best.
- A setting was changed twice by Devices that had not seen each other.
- In Single Elimination, a Result names an Entrant who is no longer in that Pairing after a correction.

A Flag is cleared by fixing its cause or by a "Flag settled" Action. A settled Flag comes back if its cause changes again.

## Advice

From attendance, the engine reports:

- the Swiss round count that leaves one unbeaten Entrant;
- for any round count, about how many Entrants to expect on each record, which shows where a cut would fall.

It only advises. The Action that starts a Phase states the numbers.

## Final order

- The last Phase decides the order among those who took part in it: Final Placings for Single Elimination, Rank for Swiss.
- Everyone else is placed below, ordered by the last Phase they did take part in.
- Entrants who share a Rank share a placing. A removed Entrant has none.

## What is refused

Only what cannot be recorded at all (ADR 0009). Each comes back as an error value, like the other engines:

- An Action naming an unknown Entrant, Phase, Section or Pairing.
- A Result naming an Entrant who was never in that Pairing.
- A Result the Standings Configuration does not allow.
- In Single Elimination, a draw.
- Starting a Phase whose Entrants cannot be decided, such as a shared Rank at the line.
- A malformed Action, or one from a newer engine version than this one.

## API shape

| Function | What it does |
|---|---|
| Combine | Merges any number of Logs into one. |
| Tournament | Works out everything from a Log: Entrants, Phases, Sections, rounds, Pairings, Results, tables, Flags, and what can be done next. |
| Standings | For a Phase, as they are now or as any Action saw them. |
| Make an Action | Builds any Action from the Log, the Device, who, and what is wanted, so its id and Seen are always right. Pairing a round and starting a Phase do their calculation here. |
| Check Pairings | Assesses hand-made Pairings before they are recorded. |
| Advise | Round count and expected records from attendance. |
| Final order | The finishing order across all Phases. |

Each returns `ok: false` with errors or `ok: true` with its answer.

## Growth

Every list in this spec is a catalogue: Actions, who takes part, how Sections are made, table settings, Clash rules and Flags. Each grows by adding an entry. Adding one never changes what an existing Log means.

A Device that meets an Action from a newer version than its own reports that it needs updating and changes nothing. The Action stays in the Log.

## Versioning

- Any change that gives a different tournament from the same Log is a major release.
- Every Action records the engine version that made it.
- The Consumer refuses to sync a Device on a different major version. Two Devices on different rules could never agree.

## Guarantees and tests

To be enforced by tests when built:

- Any order of arrival, any duplicates, any split and rejoin of Devices gives the same tournament.
- Malformed input never throws.
- Working out a tournament from its Log never calls the Pairing Engine.
- Whole tournaments are played through all three engines, as `packages/integration` does for two today.
- Stored reference outputs catch accidental changes.

## Speed

- Target: a tournament of 20,000 Entrants and 15 rounds worked out from its Log in 1 second, one thread, mid-range laptop. Standings are worked out only when asked for.
- That tournament is about 175,000 Actions. Nothing is measured yet.
- Ceiling: 262,144 Entrants, as for the other engines.
- If measurement shows a need, a function that adds new Actions to a tournament already worked out can be added. It must give the same answer as working it out from the whole Log.

## What it needs from the other engines

- Final Placings must accept a Single Elimination Pairing with no winner. That is an addition to the Standings Engine.

## What the Consumer must do

- Store the Log, and never edit or remove an Action.
- Give every Device a unique id.
- Move Actions between Devices and the server. Any path will do.
- On the server, run the engine over incoming Actions before storing them.
- Decide who may do what.
- Run heavy calls in a worker when a UI must stay responsive.
- Show Flags, and warn when someone pairs while out of contact.

## Not yet known

- Speed. Nothing is built, so nothing is measured.
- Publishers' tables for Section sizes and round counts. They are not yet sourced.

## Decision records

- ADR 0008: the Log is the only truth, and any Devices can combine theirs.
- ADR 0009: the Tournament Engine refuses only what cannot be recorded, and flags the rest.
- ADR 0010: the Tournament Engine calls the other engines and records what they return.
- ADR 0011: calculated things ripple, decided things hold.
