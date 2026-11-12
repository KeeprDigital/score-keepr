# The Tournament Engine refuses only what cannot be recorded, and flags the rest

The Tournament Engine refuses an Action only when it cannot be recorded at all, such as a Result naming an Entrant who was never in that Pairing. Everything unusual is allowed and raises a Flag: pairing a round while Results are missing, hand-made Pairings that break a Constraint, and every Clash between Devices. For a Clash the engine applies a fixed rule, discards nothing, and keeps the Flag up until someone settles it. We chose this because an Organiser at a venue must never be blocked by the software, and because nothing entered on any Device may be lost.

## Considered Options

- **Refuse anything out of order.** Rejected: real tournaments go out of order. A round is paired before the last slip is in; a drop is recorded after the Pairings are posted. Refusing would stop the tournament to protect the record.
- **Refuse a Clash and make one Device redo its work.** Rejected: a Device that was offline would have its Actions thrown away on reconnecting.
- **Accept silently.** Rejected: an Organiser would not know that two Organisers entered different Results for one table.

## Consequences

- Flags are part of the tournament the engine returns, and the Consumer must show them.
- A Flag is cleared by fixing its cause or by an Action that accepts the situation as it is.
- Every Clash needs a rule that picks the same answer on every Device.
- The engine cannot prevent a mistake. It can only make it visible.
