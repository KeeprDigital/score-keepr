// PROTOTYPE - throwaway code, not production.
//
// One Swiss round with the agreed default order, solved exactly:
//   0 no rematch   1 bye cap   2 bye to lowest score
//   3 pair close in score (squared gap)   4 keep top clean   5 seeded tiebreak
//
// Tiebreak: every entrant gets a seeded pseudo-random position on a line; the
// cost of a pairing is the squared distance between the two positions. With
// nothing else in play this is "shuffle, then pair neighbours".
//
// The matcher only sees a sparse set of candidate pairings. Afterwards every
// pairing left out is priced against the matcher's dual solution. If none
// could improve the result, the result is proven best over ALL pairings.
import { solve } from './matcher.mjs';

export const K = 6;

export function pairRound(f, o = {}) {
  const T0 = performance.now();
  const n = f.n, cap = o.byeCap ?? 1;
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => f.score[b] - f.score[a] || f.key[a] - f.key[b] || a - b);
  const pos = new Int32Array(n);
  const sScore = new Int32Array(n), sKey = new Float64Array(n), sByes = new Int32Array(n);
  for (let a = 0; a < n; a++) { const i = order[a]; pos[i] = a; sScore[a] = f.score[i]; sKey[a] = f.key[i]; sByes[a] = f.byes[i]; }
  const opp = new Array(n);
  for (let a = 0; a < n; a++) { const src = f.opp[order[a]]; const l = new Int32Array(src.length); for (let q = 0; q < src.length; q++) l[q] = pos[src[q]]; opp[a] = l; }
  const isRe = (a, b) => { const l = opp[a]; for (let q = 0; q < l.length; q++) if (l[q] === b) return true; return false; };
  const gStart = [0];
  for (let a = 1; a < n; a++) if (sScore[a] !== sScore[a - 1]) gStart.push(a);
  gStart.push(n);
  const G = gStart.length - 1;
  const hasBye = n % 2 === 1, N = n + (hasBye ? 1 : 0), BYE = n;
  const minScore = n ? sScore[n - 1] : 0;

  // Negated cost vector of pairing a with b (a < b in sorted order, so a scores >= b).
  function weight(a, b, out, off) {
    if (b === BYE) {
      out[off] = 0; out[off + 1] = sByes[a] >= cap ? -1 : 0; out[off + 2] = -(sScore[a] - minScore);
      out[off + 3] = 0; out[off + 4] = 0; out[off + 5] = -(sKey[a] * sKey[a]);
      return;
    }
    const diff = sScore[a] - sScore[b], dx = sKey[a] - sKey[b];
    out[off] = isRe(a, b) ? -1 : 0; out[off + 1] = 0; out[off + 2] = 0;
    out[off + 3] = -(diff * diff); out[off + 4] = diff > 0 ? -(sScore[a] - minScore + 1) : 0;
    out[off + 5] = -(dx * dx);
  }

  function build(Ks, Kc, span, withRematch, complete, extra) {
    const ei = [], ej = [];
    if (complete) {
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { ei.push(a); ej.push(b); }
    } else {
      for (let g = 0; g < G; g++) {
        const gs = gStart[g], ge = gStart[g + 1];
        for (let a = gs; a < ge; a++) {
          for (let b = a + 1, cnt = 0; b < ge && cnt < Ks; b++) {
            if (!withRematch && isRe(a, b)) continue;
            ei.push(a); ej.push(b); cnt++;
          }
          for (let h = g + 1; h < G && h <= g + span; h++) {
            const hs = gStart[h], he = gStart[h + 1];
            let lo = hs, hi = he;
            while (lo < hi) { const m = (lo + hi) >> 1; if (sKey[m] < sKey[a]) lo = m + 1; else hi = m; }
            let up = lo, dn = lo - 1;
            for (let cnt = 0; cnt < Kc && (dn >= hs || up < he);) {
              let b;
              if (dn < hs) b = up++; else if (up >= he) b = dn--;
              else if (sKey[a] - sKey[dn] <= sKey[up] - sKey[a]) b = dn--; else b = up++;
              if (!withRematch && isRe(a, b)) continue;
              ei.push(a); ej.push(b); cnt++;
            }
          }
        }
      }
      for (let q = 0; q < extra.length; q += 2) { ei.push(extra[q]); ej.push(extra[q + 1]); }
    }
    if (hasBye) for (let a = 0; a < n; a++) { ei.push(a); ej.push(BYE); }
    const M = ei.length, EI = Int32Array.from(ei), EJ = Int32Array.from(ej), W = new Float64Array(M * K);
    for (let k = 0; k < M; k++) weight(EI[k], EJ[k], W, k * K);
    return { M, EI, EJ, W };
  }

  const st = { n, groups: G, oddGroups: 0, widen: 0, resolves: 0, edges: 0, buildMs: 0, solveMs: 0, priceMs: 0, slowChecks: 0, pairsPriced: 0 };
  for (let g = 0; g < G; g++) if ((gStart[g + 1] - gStart[g]) & 1) st.oddGroups++;

  let Ks = o.Ks ?? 6, Kc = o.Kc ?? 3, span = 1, withRematch = false, complete = o.complete ?? false;
  const extra = [], extraSeen = new Set();
  let sol, gph;
  const wv = new Float64Array(K), sv = new Float64Array(K);

  for (;;) {
    let t = performance.now();
    gph = build(Ks, Kc, span, withRematch, complete, extra);
    st.buildMs += performance.now() - t; t = performance.now();
    sol = solve(N, gph.M, gph.EI, gph.EJ, gph.W, K);
    st.solveMs += performance.now() - t; st.edges = gph.M;
    if (!sol.ok) {
      st.widen++;
      if (st.widen === 1) { Ks *= 2; Kc *= 2; span = 2; }
      else if (st.widen === 2) withRematch = true;
      else if (st.widen === 3 && n <= 3000) complete = true;
      else throw new Error('no perfect matching found in candidate graph');
      continue;
    }
    if (complete) break;
    t = performance.now();
    const viol = price();
    st.priceMs += performance.now() - t;
    if (viol.length === 0) break;
    for (let q = 0; q < viol.length; q += 2) {
      const key = viol[q] * N + viol[q + 1];
      if (!extraSeen.has(key)) { extraSeen.add(key); extra.push(viol[q], viol[q + 1]); }
    }
    st.resolves++;
    if (st.resolves > 50) throw new Error('pricing did not converge');
  }

  // Prices every pairing the matcher did not see. Returns those that could improve the result.
  //
  // Reduced cost of pairing (a,b) = dual[a] + dual[b] + 2*cost + 2*(duals of blossoms holding both).
  // Entrants are bucketed per score group by (outermost blossom, upper five dual components).
  // Against a bucket the upper components are constant, so either the whole bucket is safe, or
  // only entrants within a window of tiebreak positions can be negative. Survivors of that
  // cheap bound get the exact check, which needs the lowest common blossom (Euler tour + RMQ).
  function price() {
    const { dual, inblossom, blossomparent, blossomchilds, blossombase } = sol;
    const d5 = new Float64Array(n);
    for (let a = 0; a < n; a++) d5[a] = dual[a * K + 5];

    // anchor[x]: lowest ancestor blossom whose dual has a non-zero upper component, else the
    // outermost blossom. Blossoms below an anchor only carry tiebreak-level duals (>= 0).
    let first = null, eul, dep, table, Zup, anchor, topOf;
    function prepLCA() {
      const total = 2 * N; first = new Int32Array(total).fill(-1); Zup = new Float64Array(total * K);
      anchor = new Int32Array(total).fill(-1); topOf = new Int32Array(total).fill(-1);
      const structural = (y) => { for (let c = 0; c < 5; c++) if (dual[y * K + c] !== 0) return true; return false; };
      const e = [], dp = [];
      for (let b = N; b < total; b++) {
        if (blossombase[b] < 0 || blossomparent[b] !== -1) continue;
        for (let c = 0; c < K; c++) Zup[b * K + c] = dual[b * K + c];
        anchor[b] = b; topOf[b] = b;
        const sn = [b], si = [0];
        first[b] = e.length; e.push(b); dp.push(0);
        while (sn.length) {
          const top = sn.length - 1, x = sn[top], ch = blossomchilds[x], i = si[top];
          if (i === ch.length) { sn.pop(); si.pop(); if (sn.length) { e.push(sn[sn.length - 1]); dp.push(sn.length - 1); } continue; }
          si[top] = i + 1;
          const y = ch[i];
          first[y] = e.length; e.push(y); dp.push(sn.length); topOf[y] = b;
          if (y >= N) {
            for (let c = 0; c < K; c++) Zup[y * K + c] = Zup[x * K + c] + dual[y * K + c];
            anchor[y] = structural(y) ? y : anchor[x];
            sn.push(y); si.push(0);
          } else { anchor[y] = anchor[x]; e.push(x); dp.push(sn.length - 1); }
        }
      }
      eul = Int32Array.from(e); dep = Int32Array.from(dp);
      const L = eul.length; table = [new Int32Array(L)];
      for (let i = 0; i < L; i++) table[0][i] = i;
      for (let j = 1; (1 << j) <= L; j++) {
        const prev = table[j - 1], half = 1 << (j - 1), cur = new Int32Array(L - (1 << j) + 1);
        for (let i = 0; i < cur.length; i++) { const x = prev[i], y = prev[i + half]; cur[i] = dep[x] <= dep[y] ? x : y; }
        table.push(cur);
      }
    }
    prepLCA();
    function lca(a, b) {
      let l = first[a], r = first[b]; if (l > r) { const t = l; l = r; r = t; }
      const j = 31 - Math.clz32(r - l + 1), x = table[j][l], y = table[j][r - (1 << j) + 1];
      return eul[dep[x] <= dep[y] ? x : y];
    }
    function exactNegative(a, b) {
      st.slowChecks++;
      weight(a, b, wv, 0);
      for (let c = 0; c < K; c++) sv[c] = dual[a * K + c] + dual[b * K + c] - 2 * wv[c];
      if (inblossom[a] === inblossom[b]) {
        const l = lca(a, b);
        for (let c = 0; c < K; c++) sv[c] += 2 * Zup[l * K + c];
      }
      for (let c = 0; c < K; c++) { if (sv[c] < 0) return true; if (sv[c] > 0) return false; }
      return false;
    }

    // Buckets per group.
    const buckets = new Array(G); let nb = 0;
    for (let g = 0; g < G; g++) {
      const map = new Map();
      for (let a = gStart[g]; a < gStart[g + 1]; a++) {
        const o = a * K, anc = anchor[a];
        const key = anc + '|' + dual[o] + ',' + dual[o + 1] + ',' + dual[o + 2] + ',' + dual[o + 3] + ',' + dual[o + 4];
        let B = map.get(key);
        if (!B) { B = { anc, u: Array.from(dual.subarray(o, o + 5)), m5: Infinity, pos: [] }; map.set(key, B); }
        B.pos.push(a); if (d5[a] < B.m5) B.m5 = d5[a];
      }
      buckets[g] = Array.from(map.values()); nb += buckets[g].length;
    }
    st.buckets = nb;

    // Duals of all blossoms that are certainly common to anything under anchors x and y.
    const pCache = new Map();
    function commonNode(x, y) {
      if (x === -1 || y === -1 || topOf[x] !== topOf[y]) return -1;
      const key = x < y ? x * 2 * N + y : y * 2 * N + x;
      let p = pCache.get(key);
      if (p === undefined) { p = lca(x, y); pCache.set(key, p); }
      return p;
    }
    const viol = [];
    const cU = [0, 0, 0, 0, 0];
    for (let g = 0; g < G; g++) {
      const gs = gStart[g], ge = gStart[g + 1];
      for (let h = g; h < G; h++) {
        const diff = sScore[gs] - sScore[gStart[h]];
        cU[3] = 2 * diff * diff; cU[4] = diff > 0 ? 2 * (sScore[gs] - minScore + 1) : 0;
        const bl = buckets[h];
        for (let a = gs; a < ge; a++) {
          const oa = a * K, xa = anchor[a], x = sKey[a], a5 = d5[a];
          for (let q = 0; q < bl.length; q++) {
            const B = bl[q], P = commonNode(xa, B.anc), same = P !== -1, oz = P * K;
            let s = 0;
            for (let c = 0; c < 5 && s === 0; c++) s = dual[oa + c] + B.u[c] + cU[c] + (same ? 2 * Zup[oz + c] : 0);
            if (s > 0) continue;
            const pos = B.pos, zz = same ? 2 * Zup[oz + 5] : 0;
            if (s < 0) {
              for (let i = 0; i < pos.length; i++) { const b = pos[i]; if (h === g && b <= a) continue; st.pairsPriced++; if (exactNegative(a, b)) viol.push(a, b); }
              continue;
            }
            const thr = -(a5 + B.m5 + zz);
            if (thr <= 0) continue;
            let lo = 0, hi = pos.length;
            while (lo < hi) { const m = (lo + hi) >> 1; if (sKey[pos[m]] < x) lo = m + 1; else hi = m; }
            for (let i = lo; i < pos.length; i++) {
              const b = pos[i], dx = sKey[b] - x, t2 = 2 * dx * dx;
              if (t2 >= thr) break;
              if (h === g && b <= a) continue;
              st.pairsPriced++;
              if (t2 + a5 + d5[b] + zz < 0 && exactNegative(a, b)) viol.push(a, b);
            }
            for (let i = lo - 1; i >= 0; i--) {
              const b = pos[i], dx = x - sKey[b], t2 = 2 * dx * dx;
              if (t2 >= thr) break;
              if (h === g && b <= a) continue;
              st.pairsPriced++;
              if (t2 + a5 + d5[b] + zz < 0 && exactNegative(a, b)) viol.push(a, b);
            }
          }
        }
      }
    }
    st.violations = (st.violations || 0) + viol.length / 2;
    return viol;
  }

  // Remaining half of the certificate: every chosen pairing is tight, blossoms are well formed.
  let t = performance.now();
  let certified = true;
  {
    const { dual, blossomparent, blossombase, blossomendps, mate, endpoint, partner } = sol;
    for (let a = 0; a < N && certified; a++) {
      const b = partner[a];
      if (b < 0) { certified = false; break; }
      if (b < a) continue;
      weight(a, b, wv, 0);
      for (let c = 0; c < K; c++) sv[c] = dual[a * K + c] + dual[b * K + c] - 2 * wv[c];
      const anc = new Set();
      for (let x = blossomparent[a]; x !== -1; x = blossomparent[x]) anc.add(x);
      for (let x = blossomparent[b]; x !== -1; x = blossomparent[x]) if (anc.has(x)) for (let c = 0; c < K; c++) sv[c] += 2 * dual[x * K + c];
      for (let c = 0; c < K; c++) if (sv[c] !== 0) certified = false;
    }
    for (let b = N; b < 2 * N && certified; b++) {
      if (blossombase[b] < 0) continue;
      let s = 0; for (let c = 0; c < K && s === 0; c++) s = Math.sign(dual[b * K + c]);
      if (s < 0) certified = false;
      if (s > 0) {
        const e = blossomendps[b];
        if (e.length % 2 !== 1) certified = false;
        for (let q = 1; q < e.length; q += 2) { const p = e[q]; if (mate[endpoint[p]] !== (p ^ 1) || mate[endpoint[p ^ 1]] !== p) certified = false; }
      }
    }
  }
  st.certMs = performance.now() - t;
  st.certified = certified || complete;

  const pairs = []; let bye = -1;
  const total = new Float64Array(K);
  for (let a = 0; a < n; a++) {
    const b = sol.partner[a];
    if (b === BYE) { bye = order[a]; weight(a, BYE, wv, 0); for (let c = 0; c < K; c++) total[c] -= wv[c]; }
    else if (a < b) { pairs.push([order[a], order[b]]); weight(a, b, wv, 0); for (let c = 0; c < K; c++) total[c] -= wv[c]; }
  }
  st.totalMs = performance.now() - T0;
  st.matcher = sol.stats;
  return { pairs, bye, cost: Array.from(total), stats: st };
}

export function hash32(a, b, c) {
  let h = 0x9e3779b9 ^ a;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= b;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= c;
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f); h ^= h >>> 15;
  return h >>> 0;
}
