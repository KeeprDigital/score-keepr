import { scenarioSuite } from '@score-keepr/testkit'
import { describe } from 'vite-plus/test'

import { computeStandings } from '../src/index.ts'
import { describeStandings, standingsFromScenario } from './support/scenario.ts'

describe('standings scenarios', () => {
  scenarioSuite(new URL('./scenarios/', import.meta.url), (scenario) =>
    describeStandings(computeStandings(standingsFromScenario(scenario))),
  )
})
