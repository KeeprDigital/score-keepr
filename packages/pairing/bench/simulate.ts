// Plays a whole simulated Swiss event and times every round.
//
//   node packages/pairing/bench/simulate.ts <entrants> <rounds> [--check]
//
// With --check it exits with an error if any round is not proven best, or is slower than the
// target for its size (2 s up to 10,000 Entrants, 10 s up to 20,000).
import { pairRound, startingConfiguration, type RoundInput } from '../src/index.ts'

const [sizeText = '1000', roundsText = '9', ...flags] = process.argv.slice(2)
const size = Number(sizeText)
const rounds = Number(roundsText)
const check = flags.includes('--check')
const target = size <= 10_001 ? 2000 : size <= 20_001 ? 10_000 : Number.POSITIVE_INFINITY

// A small seeded generator, so every run plays the same event.
let state = 12345
const random = (): number => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type Player = {
  id: string
  score: number
  opponents: string[]
  byes: number
  skill: number
  dropped: boolean
}
const players: Player[] = Array.from({ length: size }, (_, at) => ({
  id: `e${at}`,
  score: 0,
  opponents: [],
  byes: 0,
  skill: random(),
  dropped: false,
}))
const byId = new Map(players.map((player) => [player.id, player]))

let slowest = 0
let failed = false
for (let round = 1; round <= rounds; round++) {
  const input: RoundInput = {
    system: 'swiss',
    entrants: players
      .filter((player) => !player.dropped)
      .map(({ id, score, opponents, byes }) => ({ id, score, opponents, byes })),
    configuration: startingConfiguration,
    randomSeed: 'bench',
    round,
  }
  const started = performance.now()
  const result = pairRound(input)
  const took = performance.now() - started
  slowest = Math.max(slowest, took)
  if (!result.ok) {
    console.log(`round ${round}: errors ${JSON.stringify(result.errors).slice(0, 200)}`)
    failed = true
    break
  }
  const pairDowns = result.pairings.filter((pairing) => pairing.scoreGap > 0).length
  console.log(
    `round ${String(round).padStart(2)}: ${took.toFixed(0).padStart(5)} ms  entrants ${input.entrants.length}  ` +
      `pair-downs ${pairDowns}  violations ${result.violations.length}  proven ${result.provenBest ? 'yes' : 'NO'}`,
  )
  if (!result.provenBest || took > target) failed = true

  for (const { entrants } of result.pairings) {
    const first = byId.get(entrants[0]) as Player
    const second = byId.get(entrants[1]) as Player
    first.opponents.push(second.id)
    second.opponents.push(first.id)
    const roll = random()
    if (roll < 0.03) {
      first.score += 1
      second.score += 1
    } else if (roll < 0.03 + 0.97 * (0.5 + (first.skill - second.skill) * 0.4)) first.score += 3
    else second.score += 3
  }
  if (result.bye !== null) {
    const lucky = byId.get(result.bye) as Player
    lucky.score += 3
    lucky.byes += 1
  }
  // From round three, a few of those with two or more losses go home.
  if (round >= 3) {
    for (const player of players) {
      if (!player.dropped && round * 3 - player.score >= 6 && random() < 0.04) player.dropped = true
    }
  }
}
console.log(`${size} entrants, ${rounds} rounds: slowest round ${slowest.toFixed(0)} ms`)
if (check && failed) {
  console.log('FAILED: a round was not proven best, or was slower than the target')
  process.exit(1)
}
