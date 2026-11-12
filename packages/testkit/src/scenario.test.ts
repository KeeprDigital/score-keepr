import { describe, expect, test } from 'vite-plus/test'

import { formatTable, parseScenario } from './scenario.ts'

describe('parseScenario', () => {
  test('reads notes, settings and a table', () => {
    const text = [
      '# top group is odd',
      '# so someone is paired down',
      'seed: s1   round: 4',
      'config: no-rematch, bye-cap 1',
      '',
      'entrant  score  club  faced',
      'ann      9      red   ben cal',
      'ben      9      -     ann',
      'cal      6',
      '',
    ].join('\n')

    expect(parseScenario(text)).toEqual({
      notes: ['top group is odd', 'so someone is paired down'],
      settings: { seed: 's1', round: '4', config: 'no-rematch, bye-cap 1' },
      columns: ['entrant', 'score', 'club', 'faced'],
      rows: [
        { entrant: 'ann', score: '9', club: 'red', faced: 'ben cal' },
        { entrant: 'ben', score: '9', club: '', faced: 'ann' },
        { entrant: 'cal', score: '6', club: '', faced: '' },
      ],
    })
  })

  test('allows a scenario with no table', () => {
    expect(parseScenario('seed: s1\n')).toEqual({
      notes: [],
      settings: { seed: 's1' },
      columns: [],
      rows: [],
    })
  })

  test('says which line is wrong', () => {
    expect(() => parseScenario('seed: s1\nnot a setting\n')).toThrow(/line 2/)
    expect(() => parseScenario('seed: s1\n\na  b\n1  2  3\n')).toThrow(/line 4/)
    expect(() => parseScenario('seed: s1   seed: s2\n')).toThrow(/line 1/)
  })
})

describe('formatTable', () => {
  test('lines the columns up', () => {
    expect(
      formatTable([
        ['ann', 'v', 'ben', ''],
        ['calvin', 'v', 'dee', 'pair-down, gap 3'],
      ]),
    ).toBe(['ann     v  ben', 'calvin  v  dee  pair-down, gap 3'].join('\n'))
  })
})
