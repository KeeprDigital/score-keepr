import {
  computeStandings,
  type InputError,
  type StandingsInput,
  type StandingsRow,
  type StandingsSuccess,
} from '../../src/index.ts'

/** Works out Standings that are expected to be valid, and fails loudly if they are not. */
export function mustRank(input: StandingsInput): StandingsSuccess {
  const result = computeStandings(input)
  if (!result.ok)
    throw new Error(`Expected Standings, got errors: ${JSON.stringify(result.errors)}`)
  return result
}

/** Runs an input that is expected to be invalid, and returns its errors. */
export function mustFail(input: StandingsInput): InputError[] {
  const result = computeStandings(input)
  if (result.ok) throw new Error('Expected errors, got Standings')
  return result.errors
}

/** The row for one Entrant. */
export function rowOf(result: StandingsSuccess, id: string): StandingsRow {
  const row = result.rows.find((each) => each.id === id)
  if (row === undefined) throw new Error(`No row for ${id}`)
  return row
}
