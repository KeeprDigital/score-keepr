import { describe, expect, test } from 'vite-plus/test'

import { startingConfiguration, type StandingsInput } from '../src/index.ts'
import { mustRank, rowOf } from './support/run.ts'

const roundOne = (): StandingsInput => ({
  entrants: ['ann', 'ben', 'cal', 'dee', 'eve'].map((id) => ({ id })),
  results: [
    { round: 1, entrants: ['ann', 'ben'], outcomes: ['win', 'loss'] },
    { round: 1, entrants: ['dee', 'cal'], outcomes: ['loss', 'win'] },
    { round: 1, entrant: 'eve', kind: 'bye' },
  ],
  configuration: startingConfiguration,
})

describe('computeStandings on a first round', () => {
  test('winners are level on top, the Bye just behind them, losers level below', () => {
    const result = mustRank(roundOne())
    // eve is level with the winners on Score and on opponents' win rate (a third, having no
    // opponents), but behind on opponents' opponents' win rate: theirs is 1, hers the stated third.
    expect(result.rows.map((row) => [row.rank, row.id, row.score])).toEqual([
      [1, 'ann', 3],
      [1, 'cal', 3],
      [3, 'eve', 3],
      [4, 'ben', 0],
      [4, 'dee', 0],
    ])
  })

  test('reports each record, opponents faced and Byes received', () => {
    const result = mustRank(roundOne())
    expect(rowOf(result, 'ann')).toMatchObject({
      record: { wins: 1, losses: 0, draws: 0 },
      opponents: ['ben'],
      byes: 0,
      dropped: false,
    })
    expect(rowOf(result, 'eve')).toMatchObject({
      record: { wins: 1, losses: 0, draws: 0 },
      opponents: [],
      byes: 1,
      assignedByes: 1,
      awardedByes: 0,
    })
  })

  test('gives each Tiebreaker as an exact fraction and a plain number', () => {
    const result = mustRank(roundOne())
    // ann's only opponent has lost one of one, which the floor lifts to a third.
    expect(rowOf(result, 'ann').tiebreakers[0]).toEqual({
      exact: { numerator: '1', denominator: '3' },
      value: 1 / 3,
    })
    // ben's only opponent has won one of one.
    expect(rowOf(result, 'ben').tiebreakers[0]?.exact).toEqual({ numerator: '1', denominator: '1' })
  })

  test('an Entrant with no Results still appears', () => {
    const input = roundOne()
    input.entrants.push({ id: 'fay' })
    expect(rowOf(mustRank(input), 'fay')).toMatchObject({
      score: 0,
      opponents: [],
      rank: 6,
      record: { wins: 0, losses: 0, draws: 0 },
    })
  })

  test('reports the engine version from package.json', async () => {
    const { default: manifest } = await import('../package.json', { with: { type: 'json' } })
    expect(mustRank(roundOne()).engineVersion).toBe(manifest.version)
  })
})
