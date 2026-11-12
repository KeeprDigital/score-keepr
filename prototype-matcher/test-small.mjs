// PROTOTYPE - throwaway. Compares the matcher with brute force on small random graphs.
// Run: node prototype-matcher/test-small.mjs [trials]
import { solve, verify } from './matcher.mjs';

let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const ri = (n) => Math.floor(rnd() * n);

function cmpVec(a, b, K) { for (let c = 0; c < K; c++) { if (a[c] < b[c]) return -1; if (a[c] > b[c]) return 1; } return 0; }

// Best perfect matching by DP over vertex subsets. Returns total weight vector or null.
function brute(N, M, EI, EJ, W, K) {
  const w = new Map();
  for (let k = 0; k < M; k++) {
    const key = Math.min(EI[k], EJ[k]) * N + Math.max(EI[k], EJ[k]);
    const v = Array.from(W.subarray(k * K, k * K + K));
    if (!w.has(key) || cmpVec(v, w.get(key), K) > 0) w.set(key, v);
  }
  const best = new Array(1 << N).fill(null);
  best[0] = new Array(K).fill(0);
  for (let mask = 1; mask < (1 << N); mask++) {
    let i = 0; while (!(mask & (1 << i))) i++;
    let b = null;
    for (let j = i + 1; j < N; j++) {
      if (!(mask & (1 << j))) continue;
      const rest = best[mask ^ (1 << i) ^ (1 << j)];
      const e = w.get(i * N + j);
      if (!rest || !e) continue;
      const t = rest.map((x, c) => x + e[c]);
      if (!b || cmpVec(t, b, K) > 0) b = t;
    }
    best[mask] = b;
  }
  return best[(1 << N) - 1];
}

const trials = Number(process.argv[2] || 20000);
let fails = 0, infeasible = 0;
for (let t = 0; t < trials && fails < 5; t++) {
  const N = 2 * (1 + ri(7));                 // 2..14
  const K = 1 + ri(3);
  const range = [2, 4, 10, 1000][ri(4)];     // small ranges force ties
  const density = [1, 0.7, 0.4][ri(3)];
  const ei = [], ej = [], ws = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (rnd() > density) continue;
    if (rnd() < 0.5) { ei.push(i); ej.push(j); } else { ei.push(j); ej.push(i); }
    for (let c = 0; c < K; c++) ws.push(-ri(range));
  }
  const M = ei.length, EI = Int32Array.from(ei), EJ = Int32Array.from(ej), W = Float64Array.from(ws);
  const want = brute(N, M, EI, EJ, W, K);
  let sol;
  try { sol = solve(N, M, EI, EJ, W, K); }
  catch (e) { fails++; console.log(`trial ${t}: threw ${e.message}`, JSON.stringify({ N, K, ei, ej, ws })); continue; }
  if (!want) { infeasible++; if (sol.ok) { fails++; console.log(`trial ${t}: solver matched an infeasible graph`); } continue; }
  if (!sol.ok) { fails++; console.log(`trial ${t}: solver failed on feasible graph`, JSON.stringify({ N, K, ei, ej, ws })); continue; }
  const got = new Array(K).fill(0);
  let bad = null;
  for (let v = 0; v < N; v++) {
    const k = sol.mate[v] >> 1;
    if (sol.partner[sol.partner[v]] !== v) bad = 'partner not symmetric';
    if (v < sol.partner[v]) for (let c = 0; c < K; c++) got[c] += W[k * K + c];
  }
  bad = bad || verify(sol, M, EI, EJ, W);
  if (!bad && cmpVec(got, want, K) !== 0) bad = `weight ${got} != optimum ${want}`;
  if (bad) { fails++; console.log(`trial ${t}: ${bad}`, JSON.stringify({ N, K, ei, ej, ws })); }
}
console.log(fails === 0 ? `PASS ${trials} trials (${infeasible} infeasible graphs agreed)` : `FAIL (${fails} shown)`);
