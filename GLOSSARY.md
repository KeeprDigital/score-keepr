# score-keepr

Three engines for running tournaments. One decides who plays whom, one works out the Standings, and one keeps the tournament's record and calls the other two. These are the words they share.

Everyday words defined here, such as tournament, round, table and game, are written without a capital in the other documents.

## Language

**Pairing Engine**:
The component that turns facts about a tournament into the pairings for its next round.
_Avoid_: Matchmaker, scheduler

**Standings Engine**:
The component that turns match results into Standings. It alone knows results, point values and tiebreakers.
_Avoid_: Scoring engine, ranking engine

**Tournament Engine**:
The component that turns a Log into the tournament as it stands and makes each new Action. It calls the other two engines.
_Avoid_: Event engine, state machine, orchestrator

**Consumer**:
Whatever software outside the engines calls them and owns the tournament's records. The Tournament Engine is never a Consumer.
_Avoid_: Client, host, app

**Device**:
One running copy of the Consumer that records Actions, such as a laptop or a phone's browser.
_Avoid_: Client, node, replica, peer

**Tournament**:
One competition, from its first Entrant to its Final Placings, recorded in one Log.
_Avoid_: Event, competition, meet

**Organiser**:
A person running a tournament.
_Avoid_: Operator, judge, scorekeeper, admin

**Action**:
One thing somebody did in a tournament, recorded once and never changed.
_Avoid_: Event, command, operation, change

**Log**:
Every Action recorded for one tournament. It is the only record treated as true; everything else is worked out from it.
_Avoid_: History, event log, journal

**Clash**:
Two Actions about the same thing, made by Devices that had not seen each other's.
_Avoid_: Conflict, collision, race

**Flag**:
Something the Tournament Engine asks an Organiser to look at. It never blocks anything.
_Avoid_: Warning, error, Violation (a broken Constraint), conflict

**Phase**:
One part of a tournament with its own Pairing System and its own Entrants, such as a Swiss Phase or a Top Cut.
_Avoid_: Stage, day, bracket

**Section**:
A set of Entrants within a Phase who are paired only among themselves.
_Avoid_: Group (means Score Group), division, flight

**Pod**:
A Section made by size, as for a draft.
_Avoid_: Group, table

**Round**:
One set of Pairings in a Phase, played at the same time.
_Avoid_: Turn, heat, wave

**Table**:
The numbered place where a Pairing is played.
_Avoid_: Board, seat, station

**Entrant**:
The unit that is paired and ranked in a tournament: one Player or one Team. It is what every engine sees.
_Avoid_: Participant, competitor, contestant

**Player**:
One person who plays.
_Avoid_: Entrant (the unit paired and ranked), user, member

**Team**:
Several Players competing as one Entrant.
_Avoid_: Squad, club (a Group Label), side

**Late Entry**:
An Entrant added after the first round of a Phase was paired.
_Avoid_: Late registration, walk-in

**Drop**:
An Entrant leaving a tournament by choice. They keep a Rank.
_Avoid_: Withdrawal, retirement

**Removal**:
An Entrant taken out of a tournament by an Organiser. They have no Rank.
_Avoid_: Disqualification (one reason for it), ban

**Pairing System**:
A named set of rules for producing pairings, such as one variety of Swiss or one kind of bracket.
_Avoid_: Method, format, algorithm, mode

**Pairing**:
Two Entrants matched to play each other in a round.
_Avoid_: Match, game, fixture, table

**Bye**:
A round in which an Entrant has no opponent and is credited for it.
_Avoid_: Sit-out, free win

**Awarded Bye**:
A Bye given by an Organiser, not by pairing.
_Avoid_: Earned bye, requested bye

**Unplayed Loss**:
A round an Entrant is charged a loss for without having an opponent.
_Avoid_: Forfeit, zero-point bye, missed round

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
A named kind of tie between Entrants, such as club, family or region, and an Entrant's value for it.
_Avoid_: Group (means Score Group), affiliation, tag

**Standings**:
The ordering of Entrants by Score and tiebreakers, worked out from match results by the Standings Engine.
_Avoid_: Rankings, leaderboard, table

**Result**:
What happened in one Pairing, Bye or Unplayed Loss, as reported to the Standings Engine.
_Avoid_: Match, score line, report

**Correction**:
A later Result for a Pairing that replaces an earlier one.
_Avoid_: Edit, amendment, fix

**Outcome**:
Win, loss or draw, stated for each side of a Result separately, so both sides can lose.
_Avoid_: Result (the whole record), verdict

**Game**:
One of the games that make up the play in a Pairing, as in a best of three.
_Avoid_: Match, leg, set

**Extra Score**:
A named number reported with a Result for each side, such as victory points.
_Avoid_: Score (an Entrant's standing number), points, margin

**Tiebreaker**:
A measure from the Standings Engine's catalogue that orders Entrants who are level on Score.
_Avoid_: Tiebreak, resistance, secondary score

**Starting Configuration**:
A generic Configuration shipped as data for the Consumer to pass in or adapt. An engine never applies it on its own.
_Avoid_: Default, default Configuration

**Preset**:
A named, dated piece of Configuration shipped with an engine and tied to one rules document.
_Avoid_: Ruleset, template, profile

**Final Placing**:
An Entrant's finishing position in the tournament, once its last Phase has been played.
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
The choices made for one call to an engine. For pairing, the Constraints in priority order. For standings, the point values and the Tiebreakers in order.
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
A Single Elimination Phase entered by the best-ranked Entrants of the Phases before it.
_Avoid_: Playoffs, finals, cut

**Random Seed**:
A value supplied by the Consumer that fixes every random choice a Pairing System makes.
_Avoid_: Seed (ambiguous with a bracket seeding position)

**Shuffle Position**:
The place the Random Seed gives an Entrant in a round's random order. Among Pairings the Constraints rate as equal, Entrants with nearby Shuffle Positions are paired.
_Avoid_: Tiebreak (means Standings tiebreakers), random number, key
