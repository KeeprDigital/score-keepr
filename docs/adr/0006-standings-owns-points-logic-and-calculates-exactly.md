# The Standings Engine owns all points logic and calculates exactly

Points are always worked out by the Standings Engine, using a points method named in the Configuration. A Result never states its own points. Every fraction is held exactly, never as a rounded decimal. We chose both so that Standings can be reproduced from stored input alone, and so that a Rank never depends on the machine or on Consumer code.

## Considered Options

- **Results that state their own points.** Rejected: scoring logic would live in each Consumer where the engine cannot check it, and an event's scoring would no longer be visible in one Configuration. It can be added later without breaking anything, if a scheme appears that no points method can express.
- **Decimal arithmetic.** Rejected: equal values such as two thirds can differ in the last digit depending on the order of the sums, which can flip a Rank between a browser and a server.

## Consequences

- Every scoring scheme needs a points method in the catalogue. v1 has four: from the Outcome, from the game score, from the difference in an Extra Score, and an Extra Score itself.
- A scheme none of them expresses needs an engine release.
- Tiebreaker values are returned as an exact fraction plus a plain number for display.
