import {
  buildStructure,
  checkPairings,
  pairRound,
  type Constraint,
  type RoundSuccess,
  type StructureSuccess,
} from '@score-keepr/pairing'
import { pairingEntrantsFrom, topCutFrom } from '@score-keepr/shared'
import {
  computeStandings,
  finalPlacings,
  type FinalPlacingsSuccess,
  type Result,
  type StandingsConfiguration,
  type StandingsEntrant,
  type StandingsSuccess,
} from '@score-keepr/standings'

export type EventPlan = {
  size: number
  rounds: number
  /** How many go through to Single Elimination. 0 for no cut. */
  cut: number
  standings: StandingsConfiguration
  /** The pairing Configuration for a given round. */
  pairing: (round: number, last: boolean) => Constraint[]
  seed: number
  /** The chance that an Entrant with a losing record goes home after a round. */
  dropRate: number
}

export type RoundPlayed = {
  round: number
  present: string[]
  standingsBefore: StandingsSuccess
  paired: RoundSuccess
}

export type EventPlayed = {
  rounds: RoundPlayed[]
  finalStandings: StandingsSuccess
  results: Result[]
  dropped: Map<string, number>
  cut?: {
    structure: StructureSuccess
    placings: FinalPlacingsSuccess[]
    winners: { pairing: number; winner: string }[]
  }
}

/** Fails loudly with the engine's own errors, so a broken hand-over between engines is obvious. */
function must<T extends { ok: boolean }>(what: string, result: T): Extract<T, { ok: true }> {
  if (!result.ok)
    throw new Error(
      `${what} failed: ${JSON.stringify((result as unknown as { errors: unknown }).errors)}`,
    )
  return result as Extract<T, { ok: true }>
}

/**
 * Plays a whole event the way a Consumer would: Standings from the Results so far, mapped to
 * pairing input, paired, results made up, and round again. Then a cut, played to the end.
 */
export function playEvent(plan: EventPlan): EventPlayed {
  let state = plan.seed | 0
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const ids = Array.from({ length: plan.size }, (_, at) => `e${String(at).padStart(4, '0')}`)
  const skill = new Map(ids.map((id) => [id, random()]))
  const dropped = new Map<string, number>()
  const results: Result[] = []
  const randomSeed = `event-${plan.seed}`
  const drawsAllowed = plan.standings.allow.draws

  const standingsNow = (roundsDone: number): StandingsSuccess => {
    const entrants: StandingsEntrant[] = ids.map((id) => {
      const after = dropped.get(id)
      return after === undefined ? { id } : { id, status: { type: 'dropped', afterRound: after } }
    })
    return must(
      'computeStandings',
      computeStandings({
        entrants,
        results,
        configuration: plan.standings,
        plannedRounds: Math.max(roundsDone, 1),
        randomSeed,
      }),
    )
  }

  const played: RoundPlayed[] = []
  for (let round = 1; round <= plan.rounds; round++) {
    const standingsBefore = standingsNow(round - 1)
    const present = ids.filter((id) => !dropped.has(id))
    const { entrants } = must(
      'pairingEntrantsFrom',
      pairingEntrantsFrom(standingsBefore.rows, { present }),
    )
    const configuration = plan.pairing(round, round === plan.rounds)
    const input = { system: 'swiss' as const, entrants, configuration, randomSeed, round }
    const paired = must('pairRound', pairRound(input))
    played.push({ round, present, standingsBefore, paired })

    // The engine's own answer must check out as complete and as good as the best.
    const checked = must(
      'checkPairings',
      checkPairings({
        ...input,
        pairings: paired.pairings.map((pairing) => pairing.entrants),
        byes: paired.bye === null ? [] : [paired.bye],
        compare: true,
      }),
    )
    if (checked.comparison?.asGoodAsBest !== true || checked.coverage.missing.length > 0) {
      throw new Error(`Round ${round}: the engine's own Pairings did not check out`)
    }

    for (const { entrants: pair } of paired.pairings) {
      const [first, second] = pair
      const roll = random()
      const firstWins =
        roll < 0.5 + ((skill.get(first) as number) - (skill.get(second) as number)) * 0.4
      if (drawsAllowed && random() < 0.04)
        results.push({
          round,
          entrants: [first, second],
          outcomes: ['draw', 'draw'],
          games: [1, 1, 1],
        })
      else if (firstWins)
        results.push({
          round,
          entrants: [first, second],
          outcomes: ['win', 'loss'],
          games: random() < 0.6 ? [2, 0, 0] : [2, 1, 0],
        })
      else
        results.push({
          round,
          entrants: [first, second],
          outcomes: ['loss', 'win'],
          games: random() < 0.6 ? [0, 2, 0] : [1, 2, 0],
        })
    }
    if (paired.bye !== null) results.push({ round, entrant: paired.bye, kind: 'bye' })

    if (round < plan.rounds) {
      for (const row of standingsNow(round).rows) {
        if (!dropped.has(row.id) && row.record.losses > row.record.wins && random() < plan.dropRate)
          dropped.set(row.id, round)
      }
    }
  }

  const finalStandings = standingsNow(plan.rounds)
  const event: EventPlayed = { rounds: played, finalStandings, results, dropped }
  if (plan.cut < 2) return event

  // The cut is taken from those still in the event. A random last Tiebreaker makes every Rank different.
  const separated = must(
    'computeStandings for the cut',
    computeStandings({
      entrants: ids.map((id) => {
        const after = dropped.get(id)
        return after === undefined
          ? { id }
          : { id, status: { type: 'dropped' as const, afterRound: after } }
      }),
      results,
      configuration: {
        ...plan.standings,
        tiebreakers: [
          ...plan.standings.tiebreakers.filter((each) => each.type !== 'random'),
          { type: 'random' },
        ],
      },
      plannedRounds: Math.max(plan.rounds, 1),
      randomSeed,
    }),
  )
  const eligible = separated.rows.filter((row) => !row.dropped)
  if (eligible.length < plan.cut) return event
  const cutEntrants = must('topCutFrom', topCutFrom(eligible, plan.cut)).entrants
  const structure = must(
    'buildStructure',
    buildStructure({ system: 'single-elimination', entrants: cutEntrants }),
  )

  const ranks = separated.rows.map((row) => ({ id: row.id, rank: row.rank }))
  const winners: { pairing: number; winner: string }[] = []
  const winnerOf = new Map<number, string>()
  const placings: FinalPlacingsSuccess[] = [
    must(
      'finalPlacings',
      finalPlacings({ entrants: ranks, rounds: structure.rounds, winners: [] }),
    ),
  ]
  for (const round of structure.rounds) {
    for (const pairing of round.pairings) {
      const sides = pairing.slots.map((slot) =>
        'entrant' in slot ? slot.entrant : (winnerOf.get(slot.winnerOf) as string),
      )
      const winner = sides[random() < 0.5 ? 0 : 1] as string
      winnerOf.set(pairing.number, winner)
      winners.push({ pairing: pairing.number, winner })
      placings.push(
        must(
          'finalPlacings',
          finalPlacings({ entrants: ranks, rounds: structure.rounds, winners: [...winners] }),
        ),
      )
    }
  }
  event.cut = { structure, placings, winners }
  return event
}
