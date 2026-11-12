# Constraints are data chosen from a fixed catalogue, never Consumer code

Every game system applies different Constraints in a different order, so the Consumer must be able to configure them. We decided the Configuration is plain data: the Consumer picks Constraints from a catalogue the Pairing Engine defines and puts them in priority order. The Consumer cannot supply functions. This keeps every call serialisable, reproducible from its recorded input alone, and provably optimal, none of which survive arbitrary Consumer code running inside the engine.

## Considered Options

- **Consumer-supplied callbacks** (a scoring function per pair, or custom Constraint functions). Rejected: input could no longer be stored and replayed, determinism would depend on code the engine does not control, and the engine could not prove a result is the best available.
- **A general rule language.** Rejected: unbounded scope for a problem a survey of nine rule sets showed is covered by a short list of Constraint types.

## Consequences

- Consumer-specific logic enters as data: group labels on Entrants (club, team, family) and explicit lists of pairs to avoid.
- A rule the catalogue cannot express requires a new catalogue entry and an engine release.
- Rules that vary by round are handled by the Consumer sending a different Configuration per call; the engine has no round-conditional rules.
