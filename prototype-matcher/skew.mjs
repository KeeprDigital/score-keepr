// PROTOTYPE - throwaway. How far from uniform is the seeded tiebreak?
//
// For a small field, list every pairing that is best under the real constraints (brute force).
// Then run many seeds and count how often the tiebreak picks each one. Uniform would pick
// each equally. Two tiebreak definitions are compared:
//   line: each entrant gets a random position; cost = squared distance (what the prototype uses)
//   pair: each possible pairing gets its own independent random number
// "noise" is what a truly uniform pick shows at the same sample size, for reference.
// Run: node prototype-matcher/skew.mjs [seeds]
const SEEDS = Number(process.argv[2] || 400000);
let s = 99;
const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function matchings(ids) {
  if (ids.length === 0) return [[]];
  const [a, ...rest] = ids, out = [];
  for (let i = 0; i < rest.length; i++) {
    const others = rest.filter((_, j) => j !== i);
    for (const m of matchings(others)) out.push([[a, rest[i]], ...m]);
  }
  return out;
}
function allPairings(n) {       // with a bye when n is odd: entry [i, -1]
  const ids = [...Array(n).keys()];
  if (n % 2 === 0) return matchings(ids);
  const out = [];
  for (const b of ids) for (const m of matchings(ids.filter((x) => x !== b))) out.push([...m, [b, -1]]);
  return out;
}
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; };

function upperCost(p, f) {
  const min = Math.min(...f.score); let re = 0, cap = 0, low = 0, gap = 0, top = 0;
  for (const [a, b] of p) {
    if (b === -1) { if (f.byes[a] >= 1) cap++; low += f.score[a] - min; continue; }
    if (f.opp[a].includes(b)) re++;
    const d = Math.abs(f.score[a] - f.score[b]);
    gap += d * d; if (d) top += Math.max(f.score[a], f.score[b]) - min + 1;
  }
  return [re, cap, low, gap, top];
}
function best(f) {
  const all = allPairings(f.n); let bc = null, out = [];
  for (const p of all) { const c = upperCost(p, f); const k = bc ? cmp(c, bc) : -1; if (k < 0) { bc = c; out = [p]; } else if (k === 0) out.push(p); }
  return out;
}

// Build a realistic position by playing rounds with a uniform pick among best pairings.
function play(n, rounds, drawRate = 0.05) {
  const f = { n, score: Array(n).fill(0), byes: Array(n).fill(0), opp: Array.from({ length: n }, () => []) };
  for (let r = 0; r < rounds; r++) {
    const O = best(f), p = O[Math.floor(rnd() * O.length)];
    for (const [a, b] of p) {
      if (b === -1) { f.score[a] += 3; f.byes[a]++; continue; }
      f.opp[a].push(b); f.opp[b].push(a);
      const x = rnd(); if (x < drawRate) { f.score[a]++; f.score[b]++; } else if (x < 0.5 + drawRate / 2) f.score[a] += 3; else f.score[b] += 3;
    }
  }
  return f;
}

function measure(name, f) {
  const O = best(f), m = O.length, n = f.n;
  if (m < 2) { console.log(`${name.padEnd(34)} only one best pairing, nothing to choose`); return; }
  const cnt = { line: new Int32Array(m), pair: new Int32Array(m), unif: new Int32Array(m) };
  const key = new Float64Array(n), pw = new Float64Array((n + 1) * (n + 1));
  for (let t = 0; t < SEEDS; t++) {
    for (let i = 0; i < n; i++) key[i] = Math.floor(rnd() * 1048576);
    for (let i = 0; i < n; i++) for (let j = i + 1; j <= n; j++) pw[i * (n + 1) + j] = rnd();
    let bl = Infinity, il = 0, bp = Infinity, ip = 0;
    for (let q = 0; q < m; q++) {
      let cl = 0, cp = 0;
      for (const [a, b] of O[q]) {
        if (b === -1) { cl += key[a] * key[a]; cp += pw[a * (n + 1) + n]; }
        else { const d = key[a] - key[b]; cl += d * d; cp += pw[Math.min(a, b) * (n + 1) + Math.max(a, b)]; }
      }
      if (cl < bl) { bl = cl; il = q; } if (cp < bp) { bp = cp; ip = q; }
    }
    cnt.line[il]++; cnt.pair[ip]++; cnt.unif[Math.floor(rnd() * m)]++;
  }
  const ratio = (c) => { let lo = Infinity, hi = 0; for (const x of c) { if (x < lo) lo = x; if (x > hi) hi = x; } return lo === 0 ? 'inf' : (hi / lo).toFixed(2); };
  // Per entrant: how often are they in an uneven pairing (pair-down or bye)? Compare most vs least exposed
  // among entrants on the same score who are ever exposed at all.
  const exposure = (c) => {
    const e = new Float64Array(n);
    O.forEach((p, q) => { for (const [a, b] of p) { if (b === -1) e[a] += c[q]; else if (f.score[a] !== f.score[b]) { e[a] += c[q]; e[b] += c[q]; } } });
    let worst = 1;
    for (const sc of new Set(f.score)) {
      const g = [...Array(n).keys()].filter((i) => f.score[i] === sc && e[i] > 0).map((i) => e[i]);
      if (g.length > 1) worst = Math.max(worst, Math.max(...g) / Math.min(...g));
    }
    return worst.toFixed(2);
  };
  // True exposure ratio under an exactly uniform pick (not sampled).
  const trueUnif = exposure(new Int32Array(m).fill(1));
  console.log(`${name.padEnd(34)} ${String(m).padStart(5)}   ${ratio(cnt.line).padStart(6)} ${ratio(cnt.pair).padStart(6)} ${ratio(cnt.unif).padStart(6)}     ${exposure(cnt.line).padStart(6)} ${exposure(cnt.pair).padStart(6)} ${trueUnif.padStart(6)}`);
}

console.log(`${SEEDS} seeds per scenario`);
console.log('                                    best    most/least picked pairing   most/least exposed entrant');
console.log('scenario                         pairings    line   pair  noise          line   pair uniform');
measure('8 entrants, round 1', play(8, 0));
measure('10 entrants, round 1', play(10, 0));
measure('9 entrants, round 1 (bye)', play(9, 0));
for (const [n, r] of [[8, 1], [8, 2], [8, 3], [10, 2], [10, 3], [10, 4], [9, 2], [9, 3], [11, 2], [12, 2], [12, 3]])
  for (let v = 1; v <= 2; v++) measure(`${n} entrants, after ${r} rounds (#${v})`, play(n, r));
