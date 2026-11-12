# Pairing Engine v1 spec

What v1 does and what it promises. Words are defined in `GLOSSARY.md`; reasons for the big choices are in `docs/adr/`.

Every point here has been agreed. The Standings Engine is specified in `docs/standings-spec.md`.

## Scope

- **v1**: Swiss and Single Elimination in the Pairing Engine, plus the Standings Engine (`docs/standings-spec.md`).
- **Later, each after its own design session**: Double Elimination, Round Robin.
- **Out of scope**:
  - Pairings of more than two Entrants.
  - Presets named after a publisher. Several publishers do not publish their algorithm.
  - Statistically uniform random draws (ADR 0005).
  - Table numbers.
  - Results, point values and tiebreakers (ADR 0001). These belong to the Standings Engine.
  - Drops, Late Entries, Awarded Byes, pods, age divisions and locked Pairings. The Consumer handles these by choosing which Entrants to pass, one call per subset.

## Package

- TypeScript, ESM, no third-party runtime dependencies. Runs in a browser or on a server, offline. Private for now.
- One repository, three packages: pairing, standings, and a small shared package. Pairing and standings do not depend on each other.
- Three synchronous pure functions: one per kind of Pairing System, and one that checks Pairings made by hand. Input and output are plain JSON.
- No clock, no I/O, no unseeded randomness, no Consumer-supplied functions (ADR 0002).
- Never throws. Invalid input returns an error value and no Pairings.
- The same input gives the same output, whatever order the Entrants or any list inside the input arrive in.

## Swiss

One call returns one round.

### Input

Per Entrant:

| Fact | Details |
|---|---|
| id | String. Unique within the call. Must stay stable across rounds: Shuffle Positions come from it. |
| Score | Whole number from −1,000,000 to 1,000,000. The cap keeps every sum inside the engine exact. |
| Opponents faced | Ids. May name Entrants not in this call; those are ignored. If A lists B and B is present, B must list A. |
| Byes received | Whole number, zero or more. Whatever the Consumer chooses to count. Only compared with the bye cap. |
| Rank | Optional whole number, 1 is best. Required only when a chosen Constraint uses Rank. Shared Ranks are allowed. |
| Group Labels | Optional. Named by kind, for example club: "Leeds", family: "Smith". |

Per call:

| Input | Details |
|---|---|
| Entrants | Only those to be paired this round. |
| Configuration | Constraints in priority order. Required, and every setting inside a Constraint must be stated. Nothing is assumed. |
| Random Seed | String. Required. |
| Round number | Feeds Shuffle Positions and is echoed back. Nothing else depends on it. |
| Pairs to avoid | Pairs of ids. Used by "avoid listed pairs". |
| Work limit | Optional, counted in steps, never in time. Left out, a built-in ceiling applies. |

Constraints that apply only in some rounds (club avoidance in rounds one and two only, pair by Rank in the last round) are the Consumer sending a different Configuration for that call.

### Constraints

The v1 catalogue. A Constraint left out of the Configuration is not applied at all.

| Constraint | Kind | Needs Rank | Prefers |
|---|---|---|---|
| No rematch | yes/no | | No Pairing between Entrants who have already faced each other. |
| Bye cap (max N) | yes/no | | The Bye does not go to an Entrant with N or more Byes received. |
| Avoid same Group Label (kind) | yes/no | | No Pairing between Entrants with the same value for that kind. One entry per kind, each with its own priority. |
| Avoid listed pairs | yes/no | | No Pairing on the list. |
| Bye to lowest Score | measured | | The Bye goes to the lowest Score available. |
| Bye to lowest Rank | measured | yes | The Bye goes to the worst Rank available. |
| Pair close in Score | measured | | Small Score gaps. One wide gap is worse than several narrow ones. Measure: the difference in Score, squared, summed over Pairings. |
| Keep top clean | measured | | When Pair-downs are unavoidable, they land among low Scores. |
| Keep bottom clean | measured | | The reverse: Pair-downs land among high Scores. |
| Prefer same Group Label (kind) | measured | | Pairings stay inside one value of that kind, such as a pod. They cross only when staying inside would break a higher Constraint. |
| Pair adjacent by Rank | measured | yes | 1v2, 3v4. When blocked, the Pairings closest in Rank overall. One big jump is worse than several small ones. |
| Pair top vs bottom by Rank | measured | yes | 1v8, 2v7. When blocked, the Pairings closest to that mirror overall. |
| Pair-down choice | measured | for highest/lowest | Which Entrant leaves the higher Score Group, and which Entrant in the lower Score Group they meet. Each is highest-ranked, lowest-ranked or random. Has its own place in the order like any other. Left out, both are random. |

- A broken yes/no Constraint is reported as a Violation.
- A measured Constraint is never a Violation. A Pair-down is reported as a note on its Pairing, with the Score gap.
- Shuffle Positions always decide last and are not part of the Configuration (ADR 0005).
- "No rematch" is yes or no per Pairing. Two earlier meetings count the same as one.
- With an odd count, the pair-by-Rank Constraints leave out the Bye recipient and pair the rest.
- The exact formula for every measure is in `packages/pairing/RULES.md`.

### Priority

Strict (ADR 0003). A higher Constraint is never traded against any number of lower ones. The order in the Configuration is the whole story.

### Starting Configuration

Shipped as named data. The Consumer passes it in explicitly or adapts it; the engine never applies it on its own.

1. No rematch
2. Bye cap of one
3. Bye to lowest Score
4. Pair close in Score
5. Keep top clean

It needs no Rank, so it works without Standings. At a small event run past a sensible number of rounds it gives a second Bye before a rematch, and a first-against-last Pairing before either.

### Output

Every call ends one of three ways:

1. **Error.** Invalid input. No Pairings.
2. **Pairings.** Every Constraint met.
3. **Pairings plus Violations.** The engine never refuses. The one thing it cannot break is that every Entrant appears exactly once.

A result holds:

- Pairings, highest Score first, then by the best Rank in each Pairing when Ranks are supplied, then by Shuffle Position. Always exactly two Entrants each.
- The Bye. Exactly one when the Entrant count is odd, none when even.
- A note on each Pair-down with its Score gap.
- Violations: the Constraint and the Entrants affected.
- Whether the result is proven best.
- The round number and the engine version.

"Proven best" means no other set of Pairings does better under the priority order (ADR 0004). A proven Violation count is the lowest possible given every higher Constraint. It does not mean those particular Entrants had to be the ones.

**The built-in ceiling.** With no work limit given, a field is allowed 50,000 steps plus 2,000 for each Entrant times the number of binary digits in the count. It exists so a fault inside the matcher can never hang a call; the worst outcome is a result marked not proven. Every loop in the matcher that could run away counts a step. It is far above anything measured: whole events of up to 20,001 Entrants stay under a twentieth of it, and the heaviest single round found stays under a hundredth. A Consumer who wants more, or less, passes a work limit.

If the work limit is hit, the engine still returns a complete, valid set of Pairings, made by a quick simple method and marked not proven. Its Violations are listed but not claimed to be unavoidable. The Consumer handles real timeouts by running the engine in a worker and killing it.

### Small fields

- No Entrants: an empty result, not an error.
- One Entrant: that Entrant gets the Bye.

### Errors

- Rank missing when a chosen Constraint needs it.
- One-sided history between two Entrants who are both present.
- Duplicate id.
- An Entrant listing itself as an opponent.
- An unknown Constraint, or the same Constraint twice in one Configuration. A Group Label Constraint may appear once per kind.
- Configuration missing, or a Constraint with a setting missing.
- A field the engine does not know, at any level. Nothing is silently ignored.
- Any other malformed input.

A pair to avoid that names an absent Entrant is ignored, like an absent opponent.

All errors found are returned, not only the first. Each carries a code, a readable message and the ids involved.

## Checking hand-made Pairings

Organisers swap Pairings by hand. The Consumer allows it, then asks the engine what the result looks like. The check never refuses and never changes anything.

**Input**: the same input as a Swiss round, plus the Pairings and Byes to check, and whether to compare with the best.

**Output**:

- **Coverage problems**: an Entrant missing, appearing more than once, or unknown; a wrong number of Byes.
- **Violations**, in the same form as a pairing result.
- **A note on each Pair-down** with its Score gap.
- **Comparison with the best**, when asked for: per Constraint, what the given Pairings score against the best possible, for example "2 rematches, best possible 0".

Details:

- A half-finished set is accepted and reported as coverage problems, so the Consumer can show live flags during editing. Only an invalid round input is an error.
- The comparison ignores Shuffle Positions. A hand-made set would otherwise never count as good as the best.
- The comparison costs a full pairing run, so it is off unless asked for. Without it the check is instant. It is given only when coverage is clean.
- The engine keeps no memory of a swap. The Consumer stores the final Pairings, and next round's "opponents faced" follow from what was played.
- "Keep these Pairings, redo the rest" is not a check: the Consumer passes only the unlocked Entrants to a normal pairing call.

## Single Elimination

One call returns the whole structure.

- **Input**: Entrants, each with an id and a unique Rank. Gaps in Ranks are fine; only the order matters. No Configuration, no Random Seed, no history. Entrants who met in Swiss can meet again.
- **Output**: every round. Each Slot is an Entrant or the winner of an earlier Pairing. The Consumer fills in winners.
- **Who meets whom**: set by Rank, so 1 and 2 can only meet in the final. For eight: 1v8 and 4v5 feed one semi-final, 2v7 and 3v6 the other.
- **Size**: any number from two up. When it is not a power of two, the best Ranks get a Bye in round one. They are listed as Byes in round one and placed directly in round-two Slots. This is fixed. For a random draw the Consumer supplies shuffled Ranks.
- No third-place Pairing.
- The structure never changes once made. A drop or no-show is a result the Consumer records.
- **Outcomes**: error or structure. Never Violations.
- **Errors**: a shared Rank; a missing Rank; fewer than two Entrants.

## API shape

Agreed as a starting point. Names can change before the first release.

```ts
pairRound(input: RoundInput): RoundResult          // Round-by-Round Systems
buildStructure(input: StructureInput): StructureResult  // Fixed-Structure Systems

type RoundInput = {
  system: 'swiss'
  entrants: { id: string; score: number; opponents: string[]; byes: number; rank?: number; groups?: Record<string, string> }[]
  configuration: Constraint[]
  randomSeed: string
  round: number
  avoidPairs?: [string, string][]
  workLimit?: number
}

type RoundResult =
  | { ok: false; errors: InputError[] }
  | {
      ok: true
      pairings: { entrants: [string, string]; scoreGap: number }[]  // scoreGap above 0 marks a Pair-down
      bye: string | null
      violations: { constraint: Constraint; entrants: string[] }[]
      provenBest: boolean
      round: number
      engineVersion: string
    }

type StructureInput = { system: 'single-elimination'; entrants: { id: string; rank: number }[] }

type Slot = { entrant: string } | { winnerOf: number }

type StructureResult =
  | { ok: false; errors: InputError[] }
  | { ok: true; rounds: { pairings: { number: number; slots: [Slot, Slot] }[]; byes: string[] }[]; engineVersion: string }
```

A Constraint is `{ type: '<name>', ...parameters }`, for example `{ type: 'bye-cap', max: 1 }` or `{ type: 'avoid-same-group-label', kind: 'club' }`. The starting Configuration is exported as data.

```ts
checkPairings(input: RoundInput & { pairings: [string, string][]; byes: string[]; compare?: boolean }): CheckResult

type CheckResult =
  | { ok: false; errors: InputError[] }   // the round input itself is invalid
  | {
      ok: true
      coverage: { missing: string[]; repeated: string[]; unknown: string[]; byesExpected: number }
      pairings: { entrants: [string, string]; scoreGap: number }[]
      violations: { constraint: string; entrants: string[] }[]
      comparison?: {
        asGoodAsBest: boolean   // exact, whatever the size of the numbers below
        provenBest: boolean
        levels: { constraint: Constraint; part?: 'from' | 'opponent'; given: number; best: number }[]
      }
      engineVersion: string
    }
```

## Guarantees and tests

"Bulletproof" means all of these, each enforced by tests:

- Every Entrant appears exactly once.
- Same input, same output, whatever the input order.
- Results equal brute force on small fields.
- Every result checks its own proof.
- Malformed input never throws.
- Stored reference outputs catch accidental changes to Pairings.
- Checking the engine's own output reports the same Violations and "as good as the best".

Development tooling may have dependencies. The shipped packages have no third-party ones.

## Versioning

- Plain semver. The Pairing Engine and the Standings Engine are separate packages with separate versions.
- Any change that alters the output for an existing input is a major release.
- Every result carries the engine version. Reproducing an old round means installing that version.

## Scale

- Target: 10,000 Entrants in 2 s and 20,000 in 10 s per round, one thread, mid-range laptop, checked by a benchmark in CI.
- If exactness and speed ever conflict, exactness wins and the time target loosens.
- Measured on the engine itself, whole call including input checks (Apple M4, Node 26, one thread, simulated event with drops, starting Configuration):

| Entrants | Rounds | Slowest round |
|---|---|---|
| 2,001 | 9 | under 0.1 s |
| 10,001 | 15 | 0.3 to 0.7 s |
| 20,001 | 15 | 1.1 to 2.1 s |
| 50,000 | 6 | 4.0 s |

Every round was proven best. `pnpm bench <entrants> <rounds> --check` repeats it and fails if a round is unproven or over target.

Other Configurations, one round each, same machine. All were proven best:

| Configuration | 2,001 Entrants | 6,001 | 20,001 |
|---|---|---|---|
| Starting | 0.1 s | 0.1 s | 0.3 s |
| Avoid same club, then starting | 0.1 s | 0.1 s | 0.3 s |
| A last round: no rematch, Bye cap, Bye to lowest Rank, pair adjacent by Rank | under 0.1 s | 0.1 s | 0.2 s |
| Starting with a Pair-down choice by Rank | 0.1 s | 0.8 s | 0.9 s |
| Prefer same pod (pods of 8), then starting, first round | under 0.1 s | 0.1 s | 0.2 s |
| The same mid-event, with Scores spread out | under 0.1 s | 0.1 s | 0.2 s |
| Prefer same region (4 regions), then starting, mid-event | 0.1 s | 0.4 s | 0.9 s |
| Pair top vs bottom by Rank | under 0.1 s | under 0.1 s | 0.1 s |
| Bye to lowest Rank, then top vs bottom | 0.1 s | 0.2 s | 0.3 s |
| Pair adjacent by Rank, odd count, nothing said about the Bye | 0.1 s | 0.2 s | 1.0 s |

The matcher is first offered opponents by what the levels reward: near in Score and Shuffle Position, near along any level that measures a distance such as Rank, and sharing any Group Label that is rewarded. When many share such a label, it is offered those close in Score among them as well; without that, four regions mid-event took 2.3 s at 4,001 and did not finish in six minutes at 20,001, because the proof step had to add the missing Pairings by the hundred thousand and the field was solved again after each batch. The proof step rules Pairings out the same ways: it sorts Entrants into buckets it can rule out whole, and compares each Entrant with every bucket. Group Labels that few Entrants share, such as pods, and small blossoms get no bucket of their own. With one each, pods took 1.5 s in a first round at 20,001 and 5 s mid-event.

The last row took 10 s at 20,001 until the matcher was changed. With an odd count and no Bye rule, every second Entrant is an equally good choice for the Bye as far as Rank goes, and each choice shifts every Pairing below it. Shuffle Positions decide between about ten thousand candidates that each differ in thousands of Pairings, and the proof of the winner nests thousands of blossoms inside one another. The matcher used to touch every Entrant inside at every layer; it now leaves the largest part of each layer alone. A Configuration that gives the Bye by Score alone has the same shape among its lowest Score Group: a first round paired by Rank, with every Score level, took 9.5 s at 20,001 and now takes under 1 s.

Not yet shown:

- Speed on a mid-range laptop or in a browser. The M4 is faster than the target machine.

## Shared package

Both engines use it. It uses nothing.

- **Underlying types**: an id, an error, the building blocks of Entrant facts.
- **Each engine's input and output types**, defined separately on top of those. A Standings row and a pairing Entrant are different types, so each side can change its own shape.
- **The seeded-random routine** behind Shuffle Positions and the random Tiebreaker. Changing it changes both engines' output.
- **Mapping functions**:
  - `pairingEntrantsFrom`: Standings rows to Entrants for a Swiss round. The Consumer says who is present and supplies Group Labels.
  - `topCutFrom`: Standings rows to Entrants for a Single Elimination cut of the top N. If the cut line falls between Entrants sharing a Rank, or two inside the cut share one, it returns an error rather than choosing.

The Pairing Engine knows nothing about Standings and accepts facts from anywhere. More mappers can be added without breaking anything.

## What the Consumer must do

A Consumer that uses the Tournament Engine (`docs/tournament-spec.md`) has most of these done for it: the Log keeps the Random Seed and every call's input and output.

- Supply consistent facts. The engine checks shape, not truth.
- Store the Random Seed with the tournament. Keep it secret until pairing if Pairings must be unpredictable. Change it to re-roll.
- Keep Entrant ids stable.
- Run the engine in a worker when a UI must stay responsive.
- Decide whether a result with Violations is acceptable.
- Keep the input and output of every call, so any round can be replayed. The input holds the Random Seed and Configuration; the output holds the engine version.
- Stop two Organisers pairing the same round at once.

Storage is designed with the larger product, not in this repository.

## Growth and limits

The Pairing Engine grows four ways, none of which breaks existing input:

- an optional fact per Entrant
- a catalogue entry
- a new Pairing System
- a new function

It never grows by seeing results (ADR 0001). Examples: sides or colours are a "times played first" fact plus a "balance sides" Constraint; Pair-down history is a "Pair-downs received" fact plus a Constraint.

Known limits of what exists:

- Rank is a position, not a value. "Pair within 200 rating points" needs a new fact.
- There is one Score. A second grouping value must be folded into Rank by the Consumer.
- Facts are checked for shape, not truth.

These would need a redesign, not an addition:

- More than two Entrants per Pairing.
- Constraints that judge the round as a whole. Every Constraint must be scoreable one Pairing at a time, so "make the single worst gap as small as possible" cannot be expressed.
- Looking ahead to later rounds. The engine decides one round at a time.
- Weighted trade-offs between Constraints (ADR 0003).

Chess to official federation rules fits as a new Pairing System, but is a large piece of work, not a catalogue entry.

Basis: a survey of nine rule sets, three of which do not publish their algorithm.
