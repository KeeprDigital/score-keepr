/** A scenario file, read into plain strings. Each engine decides what the strings mean. */
export type Scenario = {
  /** Lines that began with `#`. */
  notes: string[]
  /** `key: value` pairs from the lines above the table. */
  settings: Record<string, string>
  columns: string[]
  /** One object per table row, keyed by column. A missing or `-` cell is an empty string. */
  rows: Record<string, string>[]
}

const GAP = / {2,}/

/**
 * Reads the scenario text format:
 *
 *     # a note
 *     seed: s1   round: 4
 *
 *     entrant  score  faced
 *     ann      9      ben cal
 *
 * Settings and cells are separated by two or more spaces, so a value may contain single spaces.
 */
export function parseScenario(text: string): Scenario {
  const scenario: Scenario = { notes: [], settings: {}, columns: [], rows: [] }
  const lines = text.split('\n')
  let inTable = false

  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd()
    const fail = (problem: string): never => {
      throw new Error(`Scenario line ${index + 1}: ${problem}\n  ${line}`)
    }

    if (line.startsWith('#')) {
      scenario.notes.push(line.slice(1).trim())
    } else if (line === '') {
      if (Object.keys(scenario.settings).length > 0) inTable = true
    } else if (!inTable) {
      for (const part of line.split(GAP)) {
        const colon = part.indexOf(':')
        if (colon < 1) fail(`expected "key: value", found "${part}"`)
        const key = part.slice(0, colon).trim()
        if (key in scenario.settings) fail(`"${key}" is set twice`)
        scenario.settings[key] = part.slice(colon + 1).trim()
      }
    } else if (scenario.columns.length === 0) {
      scenario.columns = line.split(GAP)
    } else {
      const cells = line.split(GAP)
      if (cells.length > scenario.columns.length) {
        fail(`${cells.length} cells but only ${scenario.columns.length} columns`)
      }
      const row: Record<string, string> = {}
      for (const [at, column] of scenario.columns.entries()) {
        const cell = cells[at] ?? ''
        row[column] = cell === '-' ? '' : cell
      }
      scenario.rows.push(row)
    }
  }
  return scenario
}

/** Lays rows out in aligned columns, two spaces apart, with no trailing spaces. */
export function formatTable(rows: readonly (readonly string[])[]): string {
  const widths: number[] = []
  for (const row of rows) {
    for (const [at, cell] of row.entries()) {
      widths[at] = Math.max(widths[at] ?? 0, cell.length)
    }
  }
  return rows
    .map((row) =>
      row
        .map((cell, at) => cell.padEnd(widths[at] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}
