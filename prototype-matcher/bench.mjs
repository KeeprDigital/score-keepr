// PROTOTYPE - throwaway. Simulates a Swiss event and times every round.
// Run: node prototype-matcher/bench.mjs <entrants> <rounds> [seed]
import { pairRound, hash32 } from './swiss.mjs';

const n0 = Number(process.argv[2] || 2000), rounds = Number(process.argv[3] || 9), seed = Number(process.argv[4] || 1);
let s = seed >>> 0;
const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const skill = new Float64Array(n0), score = new Int32Array(n0), byes = new Int32Array(n0), losses = new Int32Array(n0);
const opps = Array.from({ length: n0 }, () => []);
const dropped = new Uint8Array(n0);
for (let i = 0; i < n0; i++) skill[i] = (rnd() + rnd() + rnd() - 1.5) * 400;

console.log(`entrants ${n0}, rounds ${rounds}, seed ${seed}`);
console.log('rnd  active grp odd   edges greedy% stages  maxTree  solve  price  total ms | resolve widen rematch pairdown maxgap proven  priced(k) slow(k) buckets viol');
let worst = 0;
for (let r = 1; r <= rounds; r++) {
  const act = []; for (let i = 0; i < n0; i++) if (!dropped[i]) act.push(i);
  const n = act.length, local = new Int32Array(n0).fill(-1);
  act.forEach((g, l) => { local[g] = l; });
  const f = {
    n,
    score: Int32Array.from(act, (g) => score[g]),
    byes: Int32Array.from(act, (g) => byes[g]),
    key: Int32Array.from(act, (g) => hash32(seed, r, g) >>> 12),
    opp: act.map((g) => opps[g].map((x) => local[x]).filter((x) => x >= 0)),
  };
  const res = pairRound(f);
  const st = res.stats; worst = Math.max(worst, st.totalMs);
  if (process.env.CHECK && n <= 1500) {
    // Same round solved over every possible pairing: the proven result must cost exactly the same.
    const full = pairRound(f, { complete: true });
    if (full.cost.join() !== res.cost.join()) throw new Error(`round ${r}: sparse ${res.cost} != complete ${full.cost}`);
  }
  let rematch = 0, pairdown = 0, maxgap = 0;
  for (const [a, b] of res.pairs) {
    const ga = act[a], gb = act[b];
    if (opps[ga].includes(gb)) rematch++;
    const gap = Math.abs(score[ga] - score[gb]); if (gap) pairdown++; if (gap > maxgap) maxgap = gap;
  }
  const seen = new Uint8Array(n); let okCover = true;
  for (const [a, b] of res.pairs) { if (seen[a] || seen[b]) okCover = false; seen[a] = seen[b] = 1; }
  if (res.bye >= 0) { if (seen[res.bye]) okCover = false; seen[res.bye] = 1; }
  if (!okCover || seen.includes(0)) throw new Error('not every entrant paired exactly once');
  const p = (x, w) => String(x).padStart(w);
  console.log(`${p(r, 3)} ${p(n, 7)} ${p(st.groups, 3)} ${p(st.oddGroups, 3)} ${p(st.edges, 7)} ${p((100 * st.matcher.greedyMatched / n).toFixed(0), 6)} ${p(st.matcher.stages, 6)} ${p(st.matcher.maxTouched, 8)} ${p(st.solveMs.toFixed(0), 6)} ${p(st.priceMs.toFixed(0), 6)} ${p(st.totalMs.toFixed(0), 6)}    | ${p(st.resolves, 7)} ${p(st.widen, 5)} ${p(rematch, 7)} ${p(pairdown, 8)} ${p(maxgap, 6)} ${p(st.certified ? 'yes' : 'NO', 6)} ${p((st.pairsPriced / 1e3).toFixed(0), 10)} ${p((st.slowChecks / 1e3).toFixed(0), 7)} ${p(st.buckets ?? 0, 7)} ${p(st.violations ?? 0, 4)}`);
  // play the round
  for (const [a, b] of res.pairs) {
    const ga = act[a], gb = act[b];
    opps[ga].push(gb); opps[gb].push(ga);
    const x = rnd();
    if (x < 0.03) { score[ga] += 1; score[gb] += 1; }
    else if (rnd() < 1 / (1 + 10 ** ((skill[gb] - skill[ga]) / 400))) { score[ga] += 3; losses[gb]++; }
    else { score[gb] += 3; losses[ga]++; }
  }
  if (res.bye >= 0) { const g = act[res.bye]; score[g] += 3; byes[g]++; }
  if (r >= 3) for (const g of act) if (losses[g] >= 2 && rnd() < 0.04) dropped[g] = 1;
}
console.log(`slowest round: ${worst.toFixed(0)} ms`);
