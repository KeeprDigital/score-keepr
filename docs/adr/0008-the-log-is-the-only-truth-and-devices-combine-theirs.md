# The Log is the only truth, and any Devices can combine theirs

A tournament is stored as a Log: a set of Actions that are only ever added. Each Action carries the Device that made it and what that Device had seen. Two Logs combine by keeping everything from both, and the Tournament Engine works out the same tournament from the same Log on every Device, whatever order the Actions arrived in. We chose this because a large tournament is run from several Devices at once, online or offline, and being limited to one Device was ruled out.

## Considered Options

- **One Device in charge while offline.** Rejected: it is simple, with nothing to merge, but a large tournament cannot be run from a single Device.
- **One ordered list kept by the server.** Rejected: Devices at a venue with no internet would have nothing to agree through.
- **A general CRDT library or offline-first platform.** Rejected: those merge data by generic rules. Given two sets of Pairings for one round they would keep one silently or blend them. A set of Actions that only grows needs no such machinery, and what a Clash means is tournament logic that only this engine can state.
- **Order by clock.** Rejected: Device clocks cannot be trusted. Order comes from a counter and what each Action had seen.

## Consequences

- State is never stored as truth. It is worked out from the Log and may be cached.
- An Action is never edited or removed. A correction is a new Action.
- No Device is special, so nothing limits which Device may pair a round. Two Devices can pair the same round while apart; a fixed rule decides which set stands.
- How Actions travel between Devices is the Consumer's choice. Through a server first; Device to Device at a venue later, with no change to the engine.
- "Any order, any duplicates, any split and rejoin gives the same tournament" must be tested on many random cases.
