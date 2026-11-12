# The Tournament Engine calls the other engines and records what they return

The Tournament Engine depends on the Pairing Engine and the Standings Engine and calls them itself. Pairing a round is one call that works out the Standings, maps them to pairing input, pairs, and returns an Action holding the Pairings together with the input used and the engine version. Working out a tournament from its Log never pairs again; it reads the recorded Pairings. We chose this so a browser can run a tournament with no server, and so the hand-over between engines is written once and tested, not rewritten by every Consumer.

## Considered Options

- **Prepare inputs and read outputs, with the Consumer making the calls.** Rejected: the hand-over is where a Consumer can go wrong, and `packages/integration` already had to write 223 lines of it just to play test tournaments.
- **Pair again whenever a Log is replayed.** Rejected: fifteen rounds of 20,000 Entrants would take many seconds on every load, and a later engine version could pair a past round differently from how it was played.

## Consequences

- The Pairing Engine and the Standings Engine still depend only on the shared package, and not on each other.
- The spec's duty to keep the input and output of every pairing call is met by the Log itself.
- Pairings are facts once recorded. A different engine version never changes a past round.
- The pairing call can take about a second on a very large field, so the Consumer runs it in a worker.
