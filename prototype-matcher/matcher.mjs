// PROTOTYPE - throwaway code, not production.
//
// Exact maximum-weight perfect matching on a general graph.
// Weights are K-component integer vectors compared lexicographically, so a
// strict priority order of constraints needs no big-number packing.
//
// Primal-dual blossom algorithm. Data layout follows van Rantwijk's
// mwmatching, with three changes aimed at speed on Swiss-shaped graphs:
//   1. one alternating tree per stage, grown from a single free vertex, and
//      only the vertices that tree touches are ever visited or reset
//   2. dual updates are lazy (one running offset D per stage) and the next
//      event comes from heaps instead of a scan over all vertices
//   3. a greedy jump start matches most vertices before any stage runs

class VHeap {
  constructor(keys, K) { this.keys = keys; this.K = K; this.a = new Int32Array(1024); this.n = 0; }
  less(x, y) {
    const k = this.keys, K = this.K, ox = x * K, oy = y * K;
    for (let c = 0; c < K; c++) { const d = k[ox + c] - k[oy + c]; if (d < 0) return true; if (d > 0) return false; }
    return x < y;
  }
  push(x) {
    if (this.n === this.a.length) { const na = new Int32Array(this.n * 2); na.set(this.a); this.a = na; }
    const a = this.a; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.less(x, a[p])) { a[i] = a[p]; i = p; } else break; }
    a[i] = x;
  }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a, top = a[0], x = a[--this.n], n = this.n; let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= n) break;
      if (c + 1 < n && this.less(a[c + 1], a[c])) c++;
      if (this.less(a[c], x)) { a[i] = a[c]; i = c; } else break;
    }
    a[i] = x;
    return top;
  }
}

export function solve(N, M, EI, EJ, W, K) {
  const endpoint = new Int32Array(2 * M);
  for (let k = 0; k < M; k++) { endpoint[2 * k] = EI[k]; endpoint[2 * k + 1] = EJ[k]; }
  const adjStart = new Int32Array(N + 1);
  for (let k = 0; k < M; k++) { adjStart[EI[k] + 1]++; adjStart[EJ[k] + 1]++; }
  for (let v = 0; v < N; v++) adjStart[v + 1] += adjStart[v];
  const adj = new Int32Array(2 * M);
  { const pos = adjStart.slice(0, N); for (let k = 0; k < M; k++) { adj[pos[EI[k]]++] = 2 * k + 1; adj[pos[EJ[k]]++] = 2 * k; } }

  const mate = new Int32Array(N).fill(-1);          // remote endpoint of matched edge
  const label = new Int8Array(2 * N);                // 0 none, 1 S, 2 T
  const labelend = new Int32Array(2 * N).fill(-1);
  const inblossom = new Int32Array(N);
  const blossomparent = new Int32Array(2 * N).fill(-1);
  const blossomchilds = new Array(2 * N).fill(null);
  const blossomendps = new Array(2 * N).fill(null);
  const blossombase = new Int32Array(2 * N).fill(-1);
  for (let i = 0; i < N; i++) { inblossom[i] = i; blossombase[i] = i; }
  const bestedge = new Int32Array(N).fill(-1);       // best S-edge into a vertex hidden inside a T-blossom
  const dual = new Float64Array(2 * N * K);          // rows 0..N-1 vertices, N..2N-1 blossoms
  const unused = []; for (let b = 2 * N - 1; b >= N; b--) unused.push(b);
  const pendingFree = [];
  const D = new Float64Array(K);                     // running dual offset of the current stage
  const key2 = new Float64Array(M * K), key3 = new Float64Array(M * K);
  const inH2 = new Uint8Array(M);
  // H4 needs its own key copy: a blossom's dual row is rewritten when it is absorbed
  // into a new blossom, and changing a key that sits inside a heap corrupts the heap.
  const key4 = new Float64Array(2 * N * K);
  const H2 = new VHeap(key2, K), H3 = new VHeap(key3, K), H4 = new VHeap(key4, K);
  const pushH4 = (b) => { const o = b * K; for (let c = 0; c < K; c++) key4[o + c] = dual[o + c]; H4.push(b); };
  const queue = new Int32Array(N); let qh = 0, qt = 0;
  const tflag = new Uint8Array(N), touchedV = new Int32Array(N); let ntv = 0;
  const bflag = new Uint8Array(2 * N); let touchedB = [];
  const tmp = new Float64Array(K);
  const stats = { greedyMatched: 0, stages: 0, blossoms: 0, expands: 0, events: 0, touched: 0, maxTouched: 0 };

  const touchV = (v) => { if (!tflag[v]) { tflag[v] = 1; touchedV[ntv++] = v; } };
  const touchB = (b) => { if (b >= N && !bflag[b]) { bflag[b] = 1; touchedB.push(b); } };

  function getLeaves(b, out) {
    if (b < N) { out.push(b); return out; }
    const stack = [b];
    while (stack.length) {
      const ch = blossomchilds[stack.pop()];
      for (let i = 0; i < ch.length; i++) { const c = ch[i]; if (c < N) out.push(c); else stack.push(c); }
    }
    return out;
  }

  function labelS(w, p) {
    const b = inblossom[w];
    label[w] = label[b] = 1; labelend[w] = labelend[b] = p;
    if (b < N) {
      const o = w * K; for (let c = 0; c < K; c++) dual[o + c] += D[c];
      touchV(w); queue[qt++] = w;
    } else {
      touchB(b);
      const ob = b * K; for (let c = 0; c < K; c++) dual[ob + c] -= D[c];
      const lv = getLeaves(b, []);
      for (let i = 0; i < lv.length; i++) {
        const v = lv[i], o = v * K; for (let c = 0; c < K; c++) dual[o + c] += D[c];
        touchV(v); queue[qt++] = v;
      }
    }
  }

  function labelT(w, p) {
    const b = inblossom[w];
    label[w] = label[b] = 2; labelend[w] = labelend[b] = p;
    if (b < N) {
      const o = w * K; for (let c = 0; c < K; c++) dual[o + c] -= D[c];
      touchV(w);
    } else {
      touchB(b);
      const ob = b * K; for (let c = 0; c < K; c++) dual[ob + c] += D[c];
      pushH4(b);
      const lv = getLeaves(b, []);
      for (let i = 0; i < lv.length; i++) {
        const v = lv[i], o = v * K; for (let c = 0; c < K; c++) dual[o + c] -= D[c];
        touchV(v);
      }
    }
    const mp = mate[blossombase[b]];
    labelS(endpoint[mp], mp ^ 1);
  }

  function scanBlossom(v, w) {
    const path = []; let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v];
      if (label[b] & 4) { base = blossombase[b]; break; }
      path.push(b); label[b] = 5;
      if (labelend[b] === -1) v = -1;
      else { v = endpoint[labelend[b]]; b = inblossom[v]; v = endpoint[labelend[b]]; }
      if (w !== -1) { const t = v; v = w; w = t; }
    }
    for (let i = 0; i < path.length; i++) label[path[i]] = 1;
    return base;
  }

  function addBlossom(base, k) {
    let v = EI[k], w = EJ[k];
    const bb = inblossom[base]; let bv = inblossom[v], bw = inblossom[w];
    const b = unused.pop();
    stats.blossoms++;
    blossombase[b] = base; blossomparent[b] = -1; blossomparent[bb] = b;
    const path = [], endps = [];
    while (bv !== bb) {
      blossomparent[bv] = b; path.push(bv); endps.push(labelend[bv]);
      v = endpoint[labelend[bv]]; bv = inblossom[v];
    }
    path.push(bb); path.reverse(); endps.reverse(); endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b; path.push(bw); endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]]; bw = inblossom[w];
    }
    blossomchilds[b] = path; blossomendps[b] = endps;
    // Children stop being top-level: freeze their own duals at the true value.
    for (let i = 0; i < path.length; i++) {
      const ch = path[i];
      if (ch >= N) {
        const o = ch * K;
        if (label[ch] === 1) for (let c = 0; c < K; c++) dual[o + c] += D[c];
        else if (label[ch] === 2) for (let c = 0; c < K; c++) dual[o + c] -= D[c];
      }
    }
    label[b] = 1; labelend[b] = labelend[bb];
    { const o = b * K; for (let c = 0; c < K; c++) dual[o + c] = -D[c]; }  // true value 0
    touchB(b);
    for (let i = 0; i < path.length; i++) {
      const ch = path[i], wasT = label[ch] === 2;
      const lv = getLeaves(ch, []);
      for (let q = 0; q < lv.length; q++) {
        const x = lv[q];
        if (wasT) { const o = x * K; for (let c = 0; c < K; c++) dual[o + c] += 2 * D[c]; queue[qt++] = x; }
        inblossom[x] = b;
      }
    }
  }

  function pushH2(k) {
    if (inH2[k]) return;
    let i = EI[k], j = EJ[k];
    if (label[inblossom[i]] !== 1) { const t = i; i = j; j = t; }
    const oi = i * K, oj = j * K, ok = k * K;
    for (let c = 0; c < K; c++) key2[ok + c] = dual[oi + c] + dual[oj + c] - 2 * W[ok + c];
    inH2[k] = 1; H2.push(k);
  }

  // Keep, for a vertex hidden inside a T-blossom, the S-edge with least slack.
  function updateBest(w, k) {
    const kb = bestedge[w];
    if (kb === -1) { bestedge[w] = k; return; }
    const s = EI[k] === w ? EJ[k] : EI[k], sb = EI[kb] === w ? EJ[kb] : EI[kb];
    const os = s * K, osb = sb * K, ok = k * K, okb = kb * K;
    for (let c = 0; c < K; c++) {
      const d = (dual[os + c] - 2 * W[ok + c]) - (dual[osb + c] - 2 * W[okb + c]);
      if (d < 0) { bestedge[w] = k; return; }
      if (d > 0) return;
    }
  }

  function expandBlossom(b) {
    stats.expands++;
    const childs = blossomchilds[b], endps = blossomendps[b], L = childs.length;
    const at = (arr, i) => arr[((i % L) + L) % L];
    // Every leaf is in T form; bring them back to true values first.
    { const lv = getLeaves(b, []); for (let i = 0; i < lv.length; i++) { const o = lv[i] * K; for (let c = 0; c < K; c++) dual[o + c] += D[c]; } }
    for (let i = 0; i < L; i++) {
      const s = childs[i];
      blossomparent[s] = -1;
      if (s < N) inblossom[s] = s;
      else { const lv = getLeaves(s, []); for (let q = 0; q < lv.length; q++) inblossom[lv[q]] = s; }
    }
    const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
    let j = childs.indexOf(entrychild), jstep, endptrick;
    if (j & 1) { j -= L; jstep = 1; endptrick = 0; } else { jstep = -1; endptrick = 1; }
    let p = labelend[b];
    while (j !== 0) {
      label[endpoint[p ^ 1]] = 0;
      label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
      labelT(endpoint[p ^ 1], p);
      j += jstep;
      p = at(endps, j - endptrick) ^ endptrick;
      j += jstep;
    }
    // The base child becomes T without stepping on to its mate.
    let bv = at(childs, j);
    label[endpoint[p ^ 1]] = label[bv] = 2;
    labelend[endpoint[p ^ 1]] = labelend[bv] = p;
    {
      const lv = getLeaves(bv, []);
      for (let i = 0; i < lv.length; i++) { const o = lv[i] * K; for (let c = 0; c < K; c++) dual[o + c] -= D[c]; }
      if (bv >= N) { touchB(bv); const o = bv * K; for (let c = 0; c < K; c++) dual[o + c] += D[c]; pushH4(bv); }
    }
    j += jstep;
    while (at(childs, j) !== entrychild) {
      bv = at(childs, j);
      if (label[bv] === 1) { j += jstep; continue; }
      const lv = getLeaves(bv, []);
      let found = -1;
      for (let i = 0; i < lv.length; i++) if (label[lv[i]] !== 0) { found = lv[i]; break; }
      if (found >= 0) {
        label[found] = 0;
        label[endpoint[mate[blossombase[bv]]]] = 0;
        labelT(found, labelend[found]);
      } else {
        // Back to unlabelled: its remembered S-edges become growth candidates.
        for (let i = 0; i < lv.length; i++) if (bestedge[lv[i]] !== -1) pushH2(bestedge[lv[i]]);
      }
      j += jstep;
    }
    label[b] = 0; labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = null; blossombase[b] = -1;
    pendingFree.push(b);
  }

  function augmentBlossom(b, v) {
    const chain = []; let t = v;
    while (t !== b) { chain.push(t); t = blossomparent[t]; }
    chain.push(b);
    for (let idx = 1; idx < chain.length; idx++) rotateBlossom(chain[idx], chain[idx - 1]);
  }

  function rotateBlossom(b, t) {
    const childs = blossomchilds[b], endps = blossomendps[b], L = childs.length;
    const at = (arr, i) => arr[((i % L) + L) % L];
    const i = childs.indexOf(t); let j = i, jstep, endptrick;
    if (i & 1) { j -= L; jstep = 1; endptrick = 0; } else { jstep = -1; endptrick = 1; }
    while (j !== 0) {
      j += jstep; t = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (t >= N) augmentBlossom(t, endpoint[p]);
      j += jstep; t = at(childs, j);
      if (t >= N) augmentBlossom(t, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1; mate[endpoint[p ^ 1]] = p;
    }
    blossomchilds[b] = childs.slice(i).concat(childs.slice(0, i));
    blossomendps[b] = endps.slice(i).concat(endps.slice(0, i));
    blossombase[b] = blossombase[blossomchilds[b][0]];
  }

  // Edge (p>>1) joins S-vertex v to free vertex w; p is its endpoint at w.
  function augment(v, w, p) {
    const bw = inblossom[w];
    if (bw >= N) augmentBlossom(bw, w);
    mate[w] = p ^ 1;
    let s = v, q = p;
    for (;;) {
      const bs = inblossom[s];
      if (bs >= N) augmentBlossom(bs, s);
      mate[s] = q;
      if (labelend[bs] === -1) break;
      const t = endpoint[labelend[bs]], bt = inblossom[t];
      s = endpoint[labelend[bt]];
      const j = endpoint[labelend[bt] ^ 1];
      if (bt >= N) augmentBlossom(bt, j);
      mate[j] = labelend[bt];
      q = labelend[bt] ^ 1;
    }
  }

  function stage(root) {
    D.fill(0); qh = qt = 0;
    labelS(root, -1);
    for (;;) {
      while (qh < qt) {
        const v = queue[qh++], ov = v * K;
        for (let a = adjStart[v], ae = adjStart[v + 1]; a < ae; a++) {
          const p = adj[a], k = p >> 1, w = endpoint[p];
          const bw = inblossom[w];
          if (inblossom[v] === bw) continue;
          const lw = label[bw], ow = w * K, ok = k * K;
          if (lw === 1) {
            let s = 0;
            for (let c = 0; c < K; c++) {
              const x = dual[ov + c] + dual[ow + c] - 2 * W[ok + c]; tmp[c] = x;
              if (s === 0) { const y = x - 2 * D[c]; if (y < 0) s = -1; else if (y > 0) s = 1; }
            }
            if (s <= 0) addBlossom(scanBlossom(v, w), k);
            else { key3.set(tmp, ok); H3.push(k); }
          } else if (lw === 0) {
            let s = 0;
            for (let c = 0; c < K; c++) {
              const x = dual[ov + c] + dual[ow + c] - 2 * W[ok + c]; tmp[c] = x;
              if (s === 0) { const y = x - D[c]; if (y < 0) s = -1; else if (y > 0) s = 1; }
            }
            if (s <= 0) {
              if (mate[blossombase[bw]] === -1) { augment(v, w, p); return true; }
              labelT(w, p ^ 1);
            } else if (!inH2[k]) { key2.set(tmp, ok); inH2[k] = 1; H2.push(k); }
          } else if (label[w] === 0) {
            let s = 0;
            for (let c = 0; c < K && s === 0; c++) { const x = dual[ov + c] + dual[ow + c] - 2 * W[ok + c]; if (x < 0) s = -1; else if (x > 0) s = 1; }
            if (s <= 0) { label[w] = 2; labelend[w] = p ^ 1; }
            else updateBest(w, k);
          }
        }
      }

      // Next event: smallest offset at which something becomes tight.
      let t2 = -1, t3 = -1, t4 = -1;
      while (H2.n > 0) {
        const k = H2.peek();
        let i = EI[k], j = EJ[k];
        if (label[inblossom[i]] !== 1) { const t = i; i = j; j = t; }
        const lj = label[inblossom[j]];
        if (lj === 1) { H2.pop(); inH2[k] = 0; continue; }
        const oi = i * K, oj = j * K, ok = k * K;
        if (lj === 2) {
          H2.pop(); inH2[k] = 0;
          if (label[j] === 0) {
            let s = 0;
            for (let c = 0; c < K && s === 0; c++) { const x = dual[oi + c] + dual[oj + c] - 2 * W[ok + c]; if (x < 0) s = -1; else if (x > 0) s = 1; }
            if (s <= 0) { label[j] = 2; labelend[j] = EI[k] === i ? 2 * k : 2 * k + 1; }
            else updateBest(j, k);
          }
          continue;
        }
        let cmp = 0;
        for (let c = 0; c < K; c++) {
          const x = dual[oi + c] + dual[oj + c] - 2 * W[ok + c]; tmp[c] = x;
          if (cmp === 0) { const d = x - key2[ok + c]; if (d > 0) cmp = 1; else if (d < 0) cmp = -1; }
        }
        if (cmp !== 0) { H2.pop(); key2.set(tmp, ok); H2.push(k); continue; }
        t2 = k; break;
      }
      while (H3.n > 0) { const k = H3.peek(); if (inblossom[EI[k]] === inblossom[EJ[k]]) H3.pop(); else { t3 = k; break; } }
      while (H4.n > 0) { const b = H4.peek(); if (blossombase[b] < 0 || blossomparent[b] !== -1 || label[b] !== 2) H4.pop(); else { t4 = b; break; } }

      let type = 0;
      if (t2 !== -1) { type = 2; const o = t2 * K; for (let c = 0; c < K; c++) tmp[c] = key2[o + c]; }
      if (t3 !== -1) {
        const o = t3 * K; let cmp = type === 0 ? -1 : 0;
        for (let c = 0; c < K && cmp === 0; c++) { const d = key3[o + c] / 2 - tmp[c]; if (d < 0) cmp = -1; else if (d > 0) cmp = 1; }
        if (cmp < 0) { type = 3; for (let c = 0; c < K; c++) tmp[c] = key3[o + c] / 2; }
      }
      if (t4 !== -1) {
        const o = t4 * K; let cmp = type === 0 ? -1 : 0;
        for (let c = 0; c < K && cmp === 0; c++) { const d = key4[o + c] - tmp[c]; if (d < 0) cmp = -1; else if (d > 0) cmp = 1; }
        if (cmp < 0) { type = 4; for (let c = 0; c < K; c++) tmp[c] = key4[o + c]; }
      }
      if (type === 0) return false;   // no way to match this root in this graph
      for (let c = 0; c < K; c++) { const d = tmp[c] - D[c]; if (d > 0) break; if (d < 0) throw new Error('dual offset went backwards'); }
      D.set(tmp);
      stats.events++;

      if (type === 2) {
        const k = H2.pop(); inH2[k] = 0;
        let i = EI[k], j = EJ[k];
        if (label[inblossom[i]] !== 1) { const t = i; i = j; j = t; }
        const p = EI[k] === i ? 2 * k + 1 : 2 * k;
        if (mate[blossombase[inblossom[j]]] === -1) { augment(i, j, p); return true; }
        labelT(j, p ^ 1);
      } else if (type === 3) {
        const k = H3.pop();
        addBlossom(scanBlossom(EI[k], EJ[k]), k);
      } else {
        expandBlossom(H4.pop());
      }
    }
  }

  function endStage() {
    for (let i = 0; i < ntv; i++) {
      const v = touchedV[i], l = label[inblossom[v]], o = v * K;
      if (l === 1) for (let c = 0; c < K; c++) dual[o + c] -= D[c];
      else if (l === 2) for (let c = 0; c < K; c++) dual[o + c] += D[c];
    }
    for (let i = 0; i < touchedB.length; i++) {
      const b = touchedB[i];
      if (blossombase[b] >= 0 && blossomparent[b] === -1) {
        const l = label[b], o = b * K;
        if (l === 1) for (let c = 0; c < K; c++) dual[o + c] += D[c];
        else if (l === 2) for (let c = 0; c < K; c++) dual[o + c] -= D[c];
      }
    }
    for (let i = 0; i < ntv; i++) { const v = touchedV[i]; label[v] = 0; labelend[v] = -1; bestedge[v] = -1; tflag[v] = 0; }
    for (let i = 0; i < touchedB.length; i++) { const b = touchedB[i]; label[b] = 0; labelend[b] = -1; bflag[b] = 0; }
    stats.touched += ntv; if (ntv > stats.maxTouched) stats.maxTouched = ntv;
    ntv = 0; touchedB = [];
    for (let i = 0; i < H2.n; i++) inH2[H2.a[i]] = 0;
    H2.n = H3.n = H4.n = 0;
    while (pendingFree.length) unused.push(pendingFree.pop());
  }

  // Jump start. Vertex dual = best incident weight (always feasible), then one
  // greedy pass that tightens each free vertex onto its least-slack edge.
  for (let v = 0; v < N; v++) {
    if (adjStart[v] === adjStart[v + 1]) return { ok: false, failedAt: v, stats };
    let best = -1;
    for (let a = adjStart[v]; a < adjStart[v + 1]; a++) {
      const k = adj[a] >> 1;
      if (best === -1) { best = k; continue; }
      for (let c = 0; c < K; c++) { const d = W[k * K + c] - W[best * K + c]; if (d > 0) { best = k; break; } if (d < 0) break; }
    }
    for (let c = 0; c < K; c++) dual[v * K + c] = W[best * K + c];
  }
  const ms = new Float64Array(K);
  for (let v = 0; v < N; v++) {
    if (mate[v] !== -1) continue;
    let bp = -1; const ov = v * K;
    for (let a = adjStart[v]; a < adjStart[v + 1]; a++) {
      const p = adj[a], k = p >> 1, ow = endpoint[p] * K, ok = k * K;
      let cmp = bp === -1 ? -1 : 0;
      for (let c = 0; c < K; c++) {
        const x = dual[ov + c] + dual[ow + c] - 2 * W[ok + c]; tmp[c] = x;
        if (cmp === 0) { const d = x - ms[c]; if (d < 0) cmp = -1; else if (d > 0) cmp = 1; }
      }
      if (cmp < 0) { bp = p; ms.set(tmp); }
    }
    for (let c = 0; c < K; c++) dual[ov + c] -= ms[c];
    const w = endpoint[bp];
    if (mate[w] === -1) { mate[v] = bp; mate[w] = bp ^ 1; stats.greedyMatched += 2; }
  }

  let ok = true, failedAt = -1;
  for (let r = 0; r < N; r++) {
    if (mate[r] !== -1) continue;
    const good = stage(r);
    endStage();
    stats.stages++;
    if (!good) { ok = false; failedAt = r; break; }
  }

  const partner = new Int32Array(N).fill(-1);
  for (let v = 0; v < N; v++) if (mate[v] !== -1) partner[v] = endpoint[mate[v]];
  return { ok, failedAt, partner, mate, endpoint, dual, inblossom, blossomparent, blossombase, blossomchilds, blossomendps, stats, N, K };
}

// Independent check of the optimality certificate on the solved graph.
// Slow (walks blossom ancestors per edge); used by the small tests only.
export function verify(sol, M, EI, EJ, W) {
  const { N, K, dual, mate, endpoint, blossomparent, blossombase, blossomendps } = sol;
  const sgn = (a) => { for (let c = 0; c < K; c++) { if (a[c] < 0) return -1; if (a[c] > 0) return 1; } return 0; };
  const row = (i) => dual.subarray(i * K, i * K + K);
  for (let v = 0; v < N; v++) if (mate[v] === -1) return `vertex ${v} unmatched`;
  for (let b = N; b < 2 * N; b++) if (blossombase[b] >= 0 && sgn(row(b)) < 0) return `blossom ${b} negative dual`;
  for (let k = 0; k < M; k++) {
    const i = EI[k], j = EJ[k];
    const s = new Float64Array(K);
    for (let c = 0; c < K; c++) s[c] = dual[i * K + c] + dual[j * K + c] - 2 * W[k * K + c];
    const ai = [], aj = [];
    for (let t = blossomparent[i]; t !== -1; t = blossomparent[t]) ai.push(t);
    for (let t = blossomparent[j]; t !== -1; t = blossomparent[t]) aj.push(t);
    while (ai.length && aj.length && ai[ai.length - 1] === aj[aj.length - 1]) {
      const b = ai.pop(); aj.pop();
      for (let c = 0; c < K; c++) s[c] += 2 * dual[b * K + c];
    }
    const g = sgn(s);
    if (g < 0) return `edge ${k} (${i},${j}) negative slack`;
    if (mate[i] >> 1 === k && mate[j] >> 1 === k && g !== 0) return `matched edge ${k} not tight`;
  }
  for (let b = N; b < 2 * N; b++) {
    if (blossombase[b] >= 0 && sgn(row(b)) > 0) {
      const e = blossomendps[b];
      if (e.length % 2 !== 1) return `blossom ${b} even cycle`;
      for (let q = 1; q < e.length; q += 2) {
        const p = e[q];
        if (mate[endpoint[p]] !== (p ^ 1) || mate[endpoint[p ^ 1]] !== p) return `blossom ${b} not full`;
      }
    }
  }
  return null;
}
