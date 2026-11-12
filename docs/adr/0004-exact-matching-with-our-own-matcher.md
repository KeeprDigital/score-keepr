# Pairings are provably best, using our own matching algorithm

Swiss returns the best possible Pairings under the Constraint priority order and checks its own proof on every call, so a Violation it reports is one no other pairing could have avoided. We chose this over the usual approach of pairing each Score Group in turn and carrying leftovers down, because that approach cannot tell an unavoidable Violation from one it simply failed to avoid. Existing matching libraries were 100x too slow at 20,000 Entrants, so the engine carries its own matcher.

## Considered Options

- **Pair group by group, carry leftovers down.** Rejected: not exact, since choosing who is paired down needs lookahead. Most open-source engines do this.
- **An existing matching library.** Rejected: measured at 8 to 14 s for 10,000 Entrants and 51 to 103 s for 20,000. Also conflicts with having no runtime dependencies.
- **Exact below a size limit, heuristic above.** Rejected: integrity flags would silently mean less at large events, where they matter most.

## Consequences

- A prototype measured about 0.3 s per round at 10,000 Entrants and 0.5 s at 20,000 (Apple M4, Node), every round proven best. See `prototype-matcher/README.md`.
- Costs are vectors compared in priority order rather than one large number, so strict priority needs no big-number arithmetic.
- The matcher only examines a sparse set of likely Pairings and then proves no left-out Pairing could improve the result. That proof step is part of every call.
- The matcher is intricate. It must stay covered by brute-force comparison on small fields and by the per-call proof check.
- There is no worst-case time bound, hence the optional work limit.
