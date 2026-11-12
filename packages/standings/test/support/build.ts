import type { MatchResult, Result, StandingsEntrant } from '../../src/index.ts'

/**
 * Builds an event one Result at a time, inventing opponents as needed, so a test can say
 * "this Entrant went 5-2-1" without writing out who they played.
 */
export class Event {
  readonly results: Result[] = []
  private readonly ids = new Set<string>()
  private readonly statuses = new Map<string, StandingsEntrant['status']>()
  private readonly rounds = new Map<string, number>()
  private fillers = 0

  get entrants(): StandingsEntrant[] {
    return [...this.ids].map((id) => {
      const status = this.statuses.get(id)
      return status === undefined ? { id } : { id, status }
    })
  }

  private next(id: string): number {
    this.ids.add(id)
    const round = (this.rounds.get(id) ?? 0) + 1
    this.rounds.set(id, round)
    return round
  }

  private filler(): string {
    const id = `filler-${++this.fillers}`
    this.ids.add(id)
    return id
  }

  /** One match between two named Entrants, in the next round free for both. */
  match(
    first: string,
    second: string,
    outcome: 'beat' | 'drew' | 'lost-to',
    games?: [number, number, number],
  ): this {
    const round = Math.max(this.next(first), this.next(second))
    this.rounds.set(first, round)
    this.rounds.set(second, round)
    const result: MatchResult = {
      round,
      entrants: [first, second],
      outcomes:
        outcome === 'beat'
          ? ['win', 'loss']
          : outcome === 'drew'
            ? ['draw', 'draw']
            : ['loss', 'win'],
    }
    if (games !== undefined) result.games = games
    this.results.push(result)
    return this
  }

  /** Gives an Entrant a record against invented opponents, each of whom plays only this one match. */
  record(id: string, wins: number, losses: number, draws: number): this {
    for (let n = 0; n < wins; n++) this.match(id, this.filler(), 'beat')
    for (let n = 0; n < losses; n++) this.match(id, this.filler(), 'lost-to')
    for (let n = 0; n < draws; n++) this.match(id, this.filler(), 'drew')
    return this
  }

  /** One match against an invented opponent, with a game score. */
  games(id: string, won: number, lost: number, drawn = 0): this {
    return this.match(id, this.filler(), won > lost ? 'beat' : won < lost ? 'lost-to' : 'drew', [
      won,
      lost,
      drawn,
    ])
  }

  bye(id: string, kind: 'bye' | 'awarded-bye' | 'loss' = 'bye'): this {
    this.results.push({ round: this.next(id), entrant: id, kind })
    return this
  }

  drop(id: string): this {
    this.ids.add(id)
    this.statuses.set(id, { type: 'dropped', afterRound: this.rounds.get(id) ?? 0 })
    return this
  }

  remove(id: string): this {
    this.ids.add(id)
    this.statuses.set(id, { type: 'removed' })
    return this
  }
}
