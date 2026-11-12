# Presets are tied to a dated rules document and never change

Each Preset reproduces one dated rules document. When a publisher changes its rules we add a new Preset and leave the old one exactly as it was. We chose this over a single Preset per game that follows the latest rules, so that a stored tournament always recalculates the same way and a rules update is never a breaking release.

## Considered Options

- **One Preset per game, updated in place.** Rejected: old tournaments would silently re-rank, and every rules update would force a major release.
- **No Presets, as in pairing.** Rejected: standings formulas are published, unlike pairing algorithms, so a Preset is a claim we can back with a document.

## Consequences

- A Preset exists only where its document specifies every setting. Any assumption is listed with the Preset.
- The Pairing Engine still ships no publisher Presets.
- The list of Presets only grows.
- The Consumer chooses which dated Preset an event uses and stores that choice.
