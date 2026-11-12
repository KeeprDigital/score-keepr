# Constraints apply in strict priority order

When Constraints conflict, a higher-priority Constraint is never traded against any number of lower ones. We chose this over weighted scoring so that the order in a Configuration fully explains every result: an Organiser can be told exactly why a Pairing was made, and reordering Constraints has a predictable effect.

## Considered Options

- **Weighted blend** (each Constraint carries a weight and the engine minimises total penalty). Rejected: the weights become unexplainable magic numbers, and small tuning changes produce surprising Pairings.

## Consequences

- The engine accepts an extreme result low in the order to protect something higher. With no-rematch above pair-close-in-score it pairs first place against last place rather than allow one rematch. A Consumer who prefers the rematch puts pair-close-in-score first.
- Order matters in non-obvious ways. Bye-to-lowest-score must sit above pair-close-in-score, otherwise the Bye goes to an odd-sized top Score Group because that saves Pair-downs.
- The starting Configuration puts no-rematch above the Bye cap, so an Entrant can receive a second Bye before anyone is given a rematch.
