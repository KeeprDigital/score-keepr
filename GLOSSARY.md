# Pairing Engine

Decides who plays whom in a tournament round. It exists so that pairing logic lives apart from everything else tournament software does.

## Language

**Pairing Engine**:
The component that turns facts about a tournament into the pairings for its next round.
_Avoid_: Matchmaker, scheduler

**Standings Engine**:
The component that turns match results into Standings. It alone knows results, point values and tiebreakers.
_Avoid_: Scoring engine, ranking engine

**Consumer**:
Whatever software calls the engines and owns the tournament's records.
_Avoid_: Client, host, app

**Entrant**:
One competing unit in a tournament, whether a single player or a team.
_Avoid_: Player, participant, competitor, team

**Pairing System**:
A named set of rules for producing pairings, such as one variety of Swiss or one kind of bracket.
_Avoid_: Method, format, algorithm, mode

**Pairing**:
Two Entrants matched to play each other in a round.
_Avoid_: Match, game, fixture, table

**Bye**:
A round in which an Entrant has no opponent.
_Avoid_: Sit-out, free win

**Score**:
The whole number the Consumer supplies for an Entrant to say how well they are doing. The Pairing Engine never learns how it was earned.
_Avoid_: Points, match points, record

**Score Group**:
All Entrants in a round who share the same Score.
_Avoid_: Bracket, tier, point group

**Pair-down**:
A Pairing between Entrants from different Score Groups.
_Avoid_: Float, pair-up, cross-pairing

**Group Label**:
A named kind of tie between Entrants, such as club, family or pod, and an Entrant's value for it.
_Avoid_: Group (means Score Group), affiliation, tag

**Standings**:
The ordering of Entrants by Score and tiebreakers, worked out from match results by the Standings Engine.
_Avoid_: Rankings, leaderboard, table

**Result**:
What happened in one Pairing or Bye, as the Consumer reports it to the Standings Engine.
_Avoid_: Match, score line, report

**Outcome**:
Win, loss or draw, stated for each side of a Result separately, so both sides can lose.
_Avoid_: Result (the whole record), verdict

**Tiebreaker**:
A measure from the Standings Engine's catalogue that orders Entrants who are level on Score.
_Avoid_: Tiebreak, resistance, secondary score

**Starting Configuration**:
A generic Configuration shipped as data for the Consumer to pass in or adapt. An engine never applies it on its own.
_Avoid_: Default, default Configuration

**Preset**:
A named Standings Configuration shipped with the engine and tied to one dated rules document.
_Avoid_: Ruleset, template, profile

**Final Placing**:
An Entrant's finishing position once a Top Cut has been played.
_Avoid_: Final rank, final standing

**Rank**:
An Entrant's position in the Standings, produced by the Standings Engine or supplied by the Consumer.
_Avoid_: Seed, placement, standing

**Constraint**:
A rule a round's Pairings should satisfy, chosen from the Pairing Engine's catalogue and given a priority by the Consumer.
_Avoid_: Rule, restriction, criterion

**Violation**:
A yes-or-no Constraint broken by the returned Pairings, together with the Entrants affected. A Pair-down is not a Violation.
_Avoid_: Error, warning, conflict

**Configuration**:
The choices the Consumer makes for one call to an engine. For pairing, the Constraints in priority order. For standings, the point values and the Tiebreakers in order.
_Avoid_: Ruleset, settings, options

**Round-by-Round System**:
A Pairing System that decides one round at a time, because each round depends on what has happened so far. Swiss is the main example.
_Avoid_: Dynamic system, Swiss-style

**Swiss**:
The Round-by-Round System in which nobody is eliminated and each round's Pairings are driven by a Configuration.
_Avoid_: Swiss-system, Swiss rounds

**Fixed-Structure System**:
A Pairing System whose whole shape is known before play starts, such as an elimination bracket or a round robin.
_Avoid_: Bracket system, static system, strict system

**Single Elimination**:
The Fixed-Structure System in which the loser of each Pairing is out and winners meet along a path set by Rank before play starts.
_Avoid_: Knockout, bracket, playoff

**Slot**:
One side of a Pairing in a Fixed-Structure System: either a named Entrant or the winner of an earlier Pairing.
_Avoid_: Seat, position, placeholder

**Top Cut**:
The elimination stage played by the best-ranked Entrants after the round-by-round stage ends.
_Avoid_: Playoffs, finals, cut

**Random Seed**:
A value supplied by the Consumer that fixes every random choice a Pairing System makes.
_Avoid_: Seed (ambiguous with a bracket seeding position)

**Shuffle Position**:
The place the Random Seed gives an Entrant in a round's random order. Among Pairings the Constraints rate as equal, Entrants with nearby Shuffle Positions are paired.
_Avoid_: Tiebreak (means Standings tiebreakers), random number, key
