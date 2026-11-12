import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vite-plus/test'

import { parseScenario, type Scenario } from './scenario.ts'

const INPUT = '.scenario.txt'
const OUTPUT = '.expected.txt'

/**
 * Turns every `*.scenario.txt` file in a folder into a test. `run` returns the engine's answer
 * as text, which is compared with the `*.expected.txt` file beside it.
 *
 * A scenario with no expected file has one recorded on its first run. To re-record after an
 * intended change, run the tests with `-u` and review the diff.
 */
export function scenarioSuite(folder: URL, run: (scenario: Scenario) => string): void {
  const directory = fileURLToPath(folder)
  const names = readdirSync(directory)
    .filter((file) => file.endsWith(INPUT))
    .map((file) => file.slice(0, -INPUT.length))
    .sort()

  if (names.length === 0) {
    throw new Error(`No ${INPUT} files in ${directory}`)
  }

  for (const name of names) {
    test(name, async () => {
      const scenario = parseScenario(readFileSync(join(directory, name + INPUT), 'utf8'))
      await expect(`${run(scenario)}\n`).toMatchFileSnapshot(join(directory, name + OUTPUT))
    })
  }
}
