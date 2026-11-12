// Exact maximum-weight perfect matching on a general graph.
//
// Weights are rows of whole numbers compared level by level, so a strict priority order needs
// no big-number packing. This is the primal-dual blossom algorithm, laid out after van
// Rantwijk's mwmatching with four changes that suit Swiss-shaped graphs:
//
//   1. One alternating tree per stage, grown from a single unmatched vertex. Only the vertices
//      that tree touches are visited or reset.
//   2. Dual updates are lazy: one running offset per stage, with the next event taken from
//      heaps instead of a scan over every vertex.
//   3. A greedy start matches most vertices before any stage runs.
//   4. Wrapping a blossom in a new one, and unwrapping it again, leaves the vertices of the
//      largest child alone. Blossoms nest thousands deep when thousands of Entrants are equally
//      good for the Bye, and touching every vertex at every layer cost the square of the depth.
//
// The answer is never trusted on its own. `verifyMatching` checks the proof that comes with it.
//
// Index reads carry `!` throughout: every index is in range by construction, and this is the
// one place where the checks would cost real time.

export type MatchingGraph = {
  /** How many vertices. */
  size: number
  /** How many numbers each edge's weight has. */
  levels: number
  /** One entry per edge: the vertex at each end. */
  from: Int32Array
  to: Int32Array
  /** `levels` numbers per edge, to be made as large as possible, compared in order. */
  weight: Float64Array
}

export type MatchingSolution = {
  /** False when the graph has no perfect matching. */
  perfect: boolean
  /** For each vertex, the vertex it is matched to, or -1. */
  partner: Int32Array
  /** The proof. Rows 0 to size-1 belong to vertices, the rest to blossoms. */
  dual: Float64Array
  mate: Int32Array
  endpoint: Int32Array
  inblossom: Int32Array
  blossomparent: Int32Array
  blossombase: Int32Array
  blossomchilds: (number[] | null)[]
  blossomendps: (number[] | null)[]
  /** How much work it took. */
  steps: number
}

/** A heap of item numbers, smallest first, ordered by a row of numbers per item. */
class RowHeap {
  items: Int32Array = new Int32Array(1024)
  count = 0
  readonly keys: Float64Array
  readonly width: number

  constructor(keys: Float64Array, width: number) {
    this.keys = keys
    this.width = width
  }

  less(x: number, y: number): boolean {
    const keys = this.keys
    const width = this.width
    const ox = x * width
    const oy = y * width
    for (let c = 0; c < width; c++) {
      const difference = keys[ox + c]! - keys[oy + c]!
      if (difference < 0) return true
      if (difference > 0) return false
    }
    return x < y
  }

  push(x: number): void {
    if (this.count === this.items.length) {
      const grown = new Int32Array(this.count * 2)
      grown.set(this.items)
      this.items = grown
    }
    const items = this.items
    let i = this.count++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.less(x, items[parent]!)) {
        items[i] = items[parent]!
        i = parent
      } else break
    }
    items[i] = x
  }

  peek(): number {
    return this.items[0]!
  }

  pop(): number {
    const items = this.items
    const top = items[0]!
    const x = items[--this.count]!
    const count = this.count
    let i = 0
    for (;;) {
      let child = 2 * i + 1
      if (child >= count) break
      if (child + 1 < count && this.less(items[child + 1]!, items[child]!)) child++
      if (this.less(items[child]!, x)) {
        items[i] = items[child]!
        i = child
      } else break
    }
    items[i] = x
    return top
  }
}

/** Thrown from inside the search when the work allowed runs out. Never leaves this module. */
const OUT_OF_STEPS: { readonly reason: string } = { reason: 'the work allowed has run out' }

/**
 * Finds the heaviest perfect matching, or reports that there is none. Returns undefined if it
 * would take more than `maxSteps` steps.
 *
 * Every loop that is not bounded by its own counter counts a step each time round. So with a
 * finite `maxSteps` the search always ends, even if something inside it has gone wrong.
 */
export function solveMatching(
  graph: MatchingGraph,
  maxSteps: number = Number.POSITIVE_INFINITY,
): MatchingSolution | undefined {
  try {
    return search(graph, maxSteps)
  } catch (thrown) {
    if (thrown === OUT_OF_STEPS) return undefined
    throw thrown
  }
}

function search(graph: MatchingGraph, maxSteps: number): MatchingSolution {
  const N = graph.size
  const K = graph.levels
  const EI = graph.from
  const EJ = graph.to
  const W = graph.weight
  const M = EI.length

  const endpoint = new Int32Array(2 * M)
  for (let k = 0; k < M; k++) {
    endpoint[2 * k] = EI[k]!
    endpoint[2 * k + 1] = EJ[k]!
  }
  const adjStart = new Int32Array(N + 1)
  for (let k = 0; k < M; k++) {
    adjStart[EI[k]! + 1]!++
    adjStart[EJ[k]! + 1]!++
  }
  for (let v = 0; v < N; v++) adjStart[v + 1]! += adjStart[v]!
  const adj = new Int32Array(2 * M)
  {
    const fill = adjStart.slice(0, N)
    for (let k = 0; k < M; k++) {
      adj[fill[EI[k]!]!++] = 2 * k + 1
      adj[fill[EJ[k]!]!++] = 2 * k
    }
  }

  const mate = new Int32Array(N).fill(-1) // remote endpoint of the matched edge
  const label = new Int8Array(2 * N) // 0 none, 1 S, 2 T
  const labelend = new Int32Array(2 * N).fill(-1)
  // Which top-level blossom a vertex is in takes two reads: every vertex carries a group number,
  // and each group number points at one top-level blossom. A new blossom takes over the group
  // number of its largest child, so only the vertices of its smaller children are renumbered.
  // Blossoms can nest thousands deep, each one wrapping the last plus a vertex or two; writing
  // the new blossom into every vertex each time would cost the square of that depth.
  const group = new Int32Array(N)
  const topOf = new Int32Array(N)
  /** The group number a blossom's vertices carry while it is top-level. A vertex's is itself. */
  const groupOf = new Int32Array(2 * N)
  /** How many vertices a blossom holds. */
  const leafCount = new Int32Array(2 * N).fill(1)
  /**
   * Set on a child of a T-blossom that has just been expanded, until the child gets its new
   * label: its vertices' duals are still stored the way a T-vertex's are.
   */
  const stillT = new Uint8Array(2 * N)
  const blossomparent = new Int32Array(2 * N).fill(-1)
  const blossomchilds: (number[] | null)[] = Array.from({ length: 2 * N }, () => null)
  const blossomendps: (number[] | null)[] = Array.from({ length: 2 * N }, () => null)
  const blossombase = new Int32Array(2 * N).fill(-1)
  for (let i = 0; i < N; i++) {
    group[i] = i
    topOf[i] = i
    groupOf[i] = i
    blossombase[i] = i
  }
  const bestedge = new Int32Array(N).fill(-1) // best S-edge into a vertex hidden inside a T-blossom
  const dual = new Float64Array(2 * N * K)
  const unused: number[] = []
  for (let b = 2 * N - 1; b >= N; b--) unused.push(b)
  const pendingFree: number[] = []
  const D = new Float64Array(K) // running dual offset of the current stage
  const key2 = new Float64Array(M * K)
  const key3 = new Float64Array(M * K)
  const inH2 = new Uint8Array(M)
  // H4 needs its own copy of each key: a blossom's dual row is rewritten when the blossom is
  // absorbed into a new one, and changing a key that sits inside a heap corrupts the heap.
  const key4 = new Float64Array(2 * N * K)
  const H2 = new RowHeap(key2, K)
  const H3 = new RowHeap(key3, K)
  const H4 = new RowHeap(key4, K)
  const pushH4 = (b: number): void => {
    const o = b * K
    for (let c = 0; c < K; c++) key4[o + c] = dual[o + c]!
    H4.push(b)
  }
  const queue = new Int32Array(N)
  let qh = 0
  let qt = 0
  const tflag = new Uint8Array(N)
  const touchedV = new Int32Array(N)
  let ntv = 0
  const bflag = new Uint8Array(2 * N)
  let touchedB: number[] = []
  const tmp = new Float64Array(K)
  let steps = 0
  /** Counts one step, and stops the search when the work allowed runs out. */
  const tick = (): void => {
    if (++steps > maxSteps) throw OUT_OF_STEPS
  }

  const finish = (perfect: boolean): MatchingSolution => {
    const partner = new Int32Array(N).fill(-1)
    for (let v = 0; v < N; v++) if (mate[v] !== -1) partner[v] = endpoint[mate[v]!]!
    const inblossom = new Int32Array(N)
    for (let v = 0; v < N; v++) inblossom[v] = topOf[group[v]!]!
    return {
      perfect,
      partner,
      dual,
      mate,
      endpoint,
      inblossom,
      blossomparent,
      blossombase,
      blossomchilds,
      blossomendps,
      steps,
    }
  }

  const touchV = (v: number): void => {
    if (!tflag[v]) {
      tflag[v] = 1
      touchedV[ntv++] = v
    }
  }
  const touchB = (b: number): void => {
    if (b >= N && !bflag[b]) {
      bflag[b] = 1
      touchedB.push(b)
    }
  }

  function getLeaves(b: number, out: number[]): number[] {
    if (b < N) {
      out.push(b)
      return out
    }
    const stack = [b]
    while (stack.length > 0) {
      tick()
      const childs = blossomchilds[stack.pop()!]!
      for (let i = 0; i < childs.length; i++) {
        const child = childs[i]!
        if (child < N) out.push(child)
        else stack.push(child)
      }
    }
    return out
  }

  function labelS(w: number, p: number): void {
    const b = topOf[group[w]!]!
    label[w] = label[b] = 1
    labelend[w] = labelend[b] = p
    // From T form straight to S form is twice the offset; from the true value, once.
    const times = stillT[b] ? 2 : 1
    stillT[b] = 0
    if (b < N) {
      const o = w * K
      for (let c = 0; c < K; c++) dual[o + c]! += times * D[c]!
      touchV(w)
      queue[qt++] = w
    } else {
      touchB(b)
      const ob = b * K
      for (let c = 0; c < K; c++) dual[ob + c]! -= D[c]!
      const leaves = getLeaves(b, [])
      for (let i = 0; i < leaves.length; i++) {
        const v = leaves[i]!
        const o = v * K
        for (let c = 0; c < K; c++) dual[o + c]! += times * D[c]!
        touchV(v)
        queue[qt++] = v
      }
    }
  }

  function labelT(w: number, p: number): void {
    const b = topOf[group[w]!]!
    label[w] = label[b] = 2
    labelend[w] = labelend[b] = p
    // A child of a T-blossom just expanded is in T form already, and already touched.
    const ready = stillT[b] === 1
    stillT[b] = 0
    if (b < N) {
      if (!ready) {
        const o = w * K
        for (let c = 0; c < K; c++) dual[o + c]! -= D[c]!
      }
      touchV(w)
    } else {
      touchB(b)
      const ob = b * K
      for (let c = 0; c < K; c++) dual[ob + c]! += D[c]!
      pushH4(b)
      if (!ready) {
        const leaves = getLeaves(b, [])
        for (let i = 0; i < leaves.length; i++) {
          const v = leaves[i]!
          const o = v * K
          for (let c = 0; c < K; c++) dual[o + c]! -= D[c]!
          touchV(v)
        }
      }
    }
    const matched = mate[blossombase[b]!]!
    labelS(endpoint[matched]!, matched ^ 1)
  }

  function scanBlossom(first: number, second: number): number {
    let v = first
    let w = second
    const path: number[] = []
    let base = -1
    while (v !== -1 || w !== -1) {
      tick()
      let b = topOf[group[v]!]!
      if (label[b]! & 4) {
        base = blossombase[b]!
        break
      }
      path.push(b)
      label[b] = 5
      if (labelend[b] === -1) v = -1
      else {
        v = endpoint[labelend[b]!]!
        b = topOf[group[v]!]!
        v = endpoint[labelend[b]!]!
      }
      if (w !== -1) {
        const swap = v
        v = w
        w = swap
      }
    }
    for (let i = 0; i < path.length; i++) label[path[i]!] = 1
    return base
  }

  function addBlossom(base: number, k: number): void {
    let v = EI[k]!
    let w = EJ[k]!
    const bb = topOf[group[base]!]!
    let bv = topOf[group[v]!]!
    let bw = topOf[group[w]!]!
    const b = unused.pop()!
    blossombase[b] = base
    blossomparent[b] = -1
    blossomparent[bb] = b
    const path: number[] = []
    const endps: number[] = []
    while (bv !== bb) {
      tick()
      blossomparent[bv] = b
      path.push(bv)
      endps.push(labelend[bv]!)
      v = endpoint[labelend[bv]!]!
      bv = topOf[group[v]!]!
    }
    path.push(bb)
    path.reverse()
    endps.reverse()
    endps.push(2 * k)
    while (bw !== bb) {
      tick()
      blossomparent[bw] = b
      path.push(bw)
      endps.push(labelend[bw]! ^ 1)
      w = endpoint[labelend[bw]!]!
      bw = topOf[group[w]!]!
    }
    blossomchilds[b] = path
    blossomendps[b] = endps
    // The children stop being top-level: freeze their own duals at the true value.
    for (let i = 0; i < path.length; i++) {
      const child = path[i]!
      if (child >= N) {
        const o = child * K
        if (label[child] === 1) for (let c = 0; c < K; c++) dual[o + c]! += D[c]!
        else if (label[child] === 2) for (let c = 0; c < K; c++) dual[o + c]! -= D[c]!
      }
    }
    label[b] = 1
    labelend[b] = labelend[bb]!
    {
      const o = b * K
      for (let c = 0; c < K; c++) dual[o + c] = -D[c]! // true value 0
    }
    touchB(b)
    // The new blossom takes the group number of its largest child.
    let largest = path[0]!
    let count = 0
    for (let i = 0; i < path.length; i++) {
      const child = path[i]!
      count += leafCount[child]!
      if (leafCount[child]! > leafCount[largest]!) largest = child
    }
    leafCount[b] = count
    const g = groupOf[largest]!
    groupOf[b] = g
    for (let i = 0; i < path.length; i++) {
      const child = path[i]!
      const wasT = label[child] === 2
      // The largest child keeps its group number, and an S-child's vertices are queued already.
      if (child === largest && !wasT) continue
      const leaves = getLeaves(child, [])
      for (let q = 0; q < leaves.length; q++) {
        const x = leaves[q]!
        if (wasT) {
          const o = x * K
          for (let c = 0; c < K; c++) dual[o + c]! += 2 * D[c]!
          queue[qt++] = x
        }
        group[x] = g
      }
    }
    topOf[g] = b
  }

  function pushH2(k: number): void {
    if (inH2[k]) return
    let i = EI[k]!
    let j = EJ[k]!
    if (label[topOf[group[i]!]!] !== 1) {
      const swap = i
      i = j
      j = swap
    }
    const oi = i * K
    const oj = j * K
    const ok = k * K
    for (let c = 0; c < K; c++) key2[ok + c] = dual[oi + c]! + dual[oj + c]! - 2 * W[ok + c]!
    inH2[k] = 1
    H2.push(k)
  }

  // Keep, for a vertex hidden inside a T-blossom, the S-edge with least slack.
  function updateBest(w: number, k: number): void {
    const kb = bestedge[w]!
    if (kb === -1) {
      bestedge[w] = k
      return
    }
    const s = EI[k] === w ? EJ[k]! : EI[k]!
    const sb = EI[kb] === w ? EJ[kb]! : EI[kb]!
    const os = s * K
    const osb = sb * K
    const ok = k * K
    const okb = kb * K
    for (let c = 0; c < K; c++) {
      const difference = dual[os + c]! - 2 * W[ok + c]! - (dual[osb + c]! - 2 * W[okb + c]!)
      if (difference < 0) {
        bestedge[w] = k
        return
      }
      if (difference > 0) return
    }
  }

  function expandBlossom(b: number): void {
    const childs = blossomchilds[b]!
    const endps = blossomendps[b]!
    const L = childs.length
    const at = (list: number[], i: number): number => list[((i % L) + L) % L]!
    // Every vertex inside is in T form. A child that comes out as T again is left exactly as it
    // is, so each child is only marked here, and converted once its new label is known. The
    // child whose group number the blossom took keeps it; the rest go back to their own.
    const g = groupOf[b]!
    for (let i = 0; i < L; i++) {
      const s = childs[i]!
      blossomparent[s] = -1
      stillT[s] = 1
      const own = groupOf[s]!
      if (own !== g) {
        const leaves = getLeaves(s, [])
        for (let q = 0; q < leaves.length; q++) group[leaves[q]!] = own
      }
      topOf[own] = s
    }
    const entrychild = topOf[group[endpoint[labelend[b]! ^ 1]!]!]!
    let j = childs.indexOf(entrychild)
    let jstep: number
    let endptrick: number
    if (j & 1) {
      j -= L
      jstep = 1
      endptrick = 0
    } else {
      jstep = -1
      endptrick = 1
    }
    let p = labelend[b]!
    while (j !== 0) {
      tick()
      label[endpoint[p ^ 1]!] = 0
      label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]!] = 0
      labelT(endpoint[p ^ 1]!, p)
      j += jstep
      p = at(endps, j - endptrick) ^ endptrick
      j += jstep
    }
    // The base child becomes T without stepping on to its mate. Nothing has relabelled it yet,
    // so its vertices are in T form already.
    let bv = at(childs, j)
    label[endpoint[p ^ 1]!] = label[bv] = 2
    labelend[endpoint[p ^ 1]!] = labelend[bv] = p
    stillT[bv] = 0
    if (bv >= N) {
      touchB(bv)
      const o = bv * K
      for (let c = 0; c < K; c++) dual[o + c]! += D[c]!
      pushH4(bv)
    }
    j += jstep
    while (at(childs, j) !== entrychild) {
      tick()
      bv = at(childs, j)
      if (label[bv] === 1) {
        j += jstep
        continue
      }
      const leaves = getLeaves(bv, [])
      let found = -1
      for (let i = 0; i < leaves.length; i++) {
        if (label[leaves[i]!] !== 0) {
          found = leaves[i]!
          break
        }
      }
      if (found >= 0) {
        label[found] = 0
        label[endpoint[mate[blossombase[bv]!]!]!] = 0
        labelT(found, labelend[found]!)
      } else {
        // Back to unlabelled: its duals return to their true values, and its remembered
        // S-edges become growth candidates.
        if (stillT[bv]) {
          stillT[bv] = 0
          for (let i = 0; i < leaves.length; i++) {
            const o = leaves[i]! * K
            for (let c = 0; c < K; c++) dual[o + c]! += D[c]!
          }
        }
        for (let i = 0; i < leaves.length; i++) {
          const remembered = bestedge[leaves[i]!]!
          if (remembered !== -1) pushH2(remembered)
        }
      }
      j += jstep
    }
    label[b] = 0
    labelend[b] = -1
    blossomchilds[b] = blossomendps[b] = null
    blossombase[b] = -1
    pendingFree.push(b)
  }

  // Blossoms can nest thousands deep, so this pair must not call each other: work still to do
  // is kept in a list instead. `pending` holds blossoms to re-base, each followed by the
  // vertex that must become its base.
  const pending: number[] = []

  /** Rearranges the matching inside blossom `b` so that vertex `v` becomes its base. */
  function augmentBlossom(b: number, v: number): void {
    pending.push(b, v)
    while (pending.length > 0) {
      tick()
      const vertex = pending.pop()!
      const blossom = pending.pop()!
      // From the vertex outwards, turn each blossom so the child holding the vertex comes first.
      // Inner ones go first: an outer blossom takes its base from its first child.
      let child = vertex
      while (child !== blossom) {
        tick()
        const parent = blossomparent[child]!
        rotateBlossom(parent, child)
        child = parent
      }
    }
  }

  /**
   * Turns blossom `b` so that `child` is its first child, re-matching the children it passes.
   * Any child that is itself a blossom is queued to be re-based, not done here: that work only
   * touches the inside of that child, so its order does not matter.
   */
  function rotateBlossom(b: number, child: number): void {
    const childs = blossomchilds[b]!
    const endps = blossomendps[b]!
    const L = childs.length
    const at = (list: number[], i: number): number => list[((i % L) + L) % L]!
    const i = childs.indexOf(child)
    let j = i
    let jstep: number
    let endptrick: number
    if (i & 1) {
      j -= L
      jstep = 1
      endptrick = 0
    } else {
      jstep = -1
      endptrick = 1
    }
    while (j !== 0) {
      tick()
      j += jstep
      let t = at(childs, j)
      const p = at(endps, j - endptrick) ^ endptrick
      if (t >= N) pending.push(t, endpoint[p]!)
      j += jstep
      t = at(childs, j)
      if (t >= N) pending.push(t, endpoint[p ^ 1]!)
      mate[endpoint[p]!] = p ^ 1
      mate[endpoint[p ^ 1]!] = p
    }
    blossomchilds[b] = childs.slice(i).concat(childs.slice(0, i))
    blossomendps[b] = endps.slice(i).concat(endps.slice(0, i))
    blossombase[b] = blossombase[blossomchilds[b]![0]!]!
  }

  // Edge (p >> 1) joins S-vertex v to free vertex w; p is its endpoint at w.
  function augment(v: number, w: number, p: number): void {
    const bw = topOf[group[w]!]!
    if (bw >= N) augmentBlossom(bw, w)
    mate[w] = p ^ 1
    let s = v
    let q = p
    for (;;) {
      tick()
      const bs = topOf[group[s]!]!
      if (bs >= N) augmentBlossom(bs, s)
      mate[s] = q
      if (labelend[bs] === -1) break
      const t = endpoint[labelend[bs]!]!
      const bt = topOf[group[t]!]!
      s = endpoint[labelend[bt]!]!
      const j = endpoint[labelend[bt]! ^ 1]!
      if (bt >= N) augmentBlossom(bt, j)
      mate[j] = labelend[bt]!
      q = labelend[bt]! ^ 1
    }
  }

  /** Grows one tree from `root`. True when it found a way to match the root. */
  function stage(root: number): boolean {
    D.fill(0)
    qh = qt = 0
    labelS(root, -1)
    for (;;) {
      while (qh < qt) {
        tick()
        const v = queue[qh++]!
        const ov = v * K
        for (let a = adjStart[v]!, end = adjStart[v + 1]!; a < end; a++) {
          const p = adj[a]!
          const k = p >> 1
          const w = endpoint[p]!
          if (group[v] === group[w]) continue
          const bw = topOf[group[w]!]!
          const lw = label[bw]!
          const ow = w * K
          const ok = k * K
          if (lw === 1) {
            let sign = 0
            for (let c = 0; c < K; c++) {
              const x = dual[ov + c]! + dual[ow + c]! - 2 * W[ok + c]!
              tmp[c] = x
              if (sign === 0) {
                const y = x - 2 * D[c]!
                if (y < 0) sign = -1
                else if (y > 0) sign = 1
              }
            }
            if (sign <= 0) addBlossom(scanBlossom(v, w), k)
            else {
              key3.set(tmp, ok)
              H3.push(k)
            }
          } else if (lw === 0) {
            let sign = 0
            for (let c = 0; c < K; c++) {
              const x = dual[ov + c]! + dual[ow + c]! - 2 * W[ok + c]!
              tmp[c] = x
              if (sign === 0) {
                const y = x - D[c]!
                if (y < 0) sign = -1
                else if (y > 0) sign = 1
              }
            }
            if (sign <= 0) {
              if (mate[blossombase[bw]!] === -1) {
                augment(v, w, p)
                return true
              }
              labelT(w, p ^ 1)
            } else if (!inH2[k]) {
              key2.set(tmp, ok)
              inH2[k] = 1
              H2.push(k)
            }
          } else if (label[w] === 0) {
            let sign = 0
            for (let c = 0; c < K && sign === 0; c++) {
              const x = dual[ov + c]! + dual[ow + c]! - 2 * W[ok + c]!
              if (x < 0) sign = -1
              else if (x > 0) sign = 1
            }
            if (sign <= 0) {
              label[w] = 2
              labelend[w] = p ^ 1
            } else updateBest(w, k)
          }
        }
      }

      tick()

      // Next event: the smallest offset at which something becomes tight.
      let t2 = -1
      let t3 = -1
      let t4 = -1
      while (H2.count > 0) {
        tick()
        const k = H2.peek()
        let i = EI[k]!
        let j = EJ[k]!
        if (label[topOf[group[i]!]!] !== 1) {
          const swap = i
          i = j
          j = swap
        }
        const lj = label[topOf[group[j]!]!]!
        if (lj === 1) {
          H2.pop()
          inH2[k] = 0
          continue
        }
        const oi = i * K
        const oj = j * K
        const ok = k * K
        if (lj === 2) {
          H2.pop()
          inH2[k] = 0
          if (label[j] === 0) {
            let sign = 0
            for (let c = 0; c < K && sign === 0; c++) {
              const x = dual[oi + c]! + dual[oj + c]! - 2 * W[ok + c]!
              if (x < 0) sign = -1
              else if (x > 0) sign = 1
            }
            if (sign <= 0) {
              label[j] = 2
              labelend[j] = EI[k] === i ? 2 * k : 2 * k + 1
            } else updateBest(j, k)
          }
          continue
        }
        let moved = 0
        for (let c = 0; c < K; c++) {
          const x = dual[oi + c]! + dual[oj + c]! - 2 * W[ok + c]!
          tmp[c] = x
          if (moved === 0) {
            const difference = x - key2[ok + c]!
            if (difference > 0) moved = 1
            else if (difference < 0) moved = -1
          }
        }
        if (moved !== 0) {
          H2.pop()
          key2.set(tmp, ok)
          H2.push(k)
          continue
        }
        t2 = k
        break
      }
      while (H3.count > 0) {
        tick()
        const k = H3.peek()
        if (group[EI[k]!] === group[EJ[k]!]) H3.pop()
        else {
          t3 = k
          break
        }
      }
      while (H4.count > 0) {
        tick()
        const b = H4.peek()
        if (blossombase[b]! < 0 || blossomparent[b] !== -1 || label[b] !== 2) H4.pop()
        else {
          t4 = b
          break
        }
      }

      let type = 0
      if (t2 !== -1) {
        type = 2
        const o = t2 * K
        for (let c = 0; c < K; c++) tmp[c] = key2[o + c]!
      }
      if (t3 !== -1) {
        const o = t3 * K
        let order = type === 0 ? -1 : 0
        for (let c = 0; c < K && order === 0; c++) {
          const difference = key3[o + c]! / 2 - tmp[c]!
          if (difference < 0) order = -1
          else if (difference > 0) order = 1
        }
        if (order < 0) {
          type = 3
          for (let c = 0; c < K; c++) tmp[c] = key3[o + c]! / 2
        }
      }
      if (t4 !== -1) {
        const o = t4 * K
        let order = type === 0 ? -1 : 0
        for (let c = 0; c < K && order === 0; c++) {
          const difference = key4[o + c]! - tmp[c]!
          if (difference < 0) order = -1
          else if (difference > 0) order = 1
        }
        if (order < 0) {
          type = 4
          for (let c = 0; c < K; c++) tmp[c] = key4[o + c]!
        }
      }
      if (type === 0) return false // no way to match this root in this graph
      for (let c = 0; c < K; c++) {
        const difference = tmp[c]! - D[c]!
        if (difference > 0) break
        if (difference < 0) throw new Error('matcher: dual offset went backwards')
      }
      D.set(tmp)

      if (type === 2) {
        const k = H2.pop()
        inH2[k] = 0
        let i = EI[k]!
        let j = EJ[k]!
        if (label[topOf[group[i]!]!] !== 1) {
          const swap = i
          i = j
          j = swap
        }
        const p = EI[k] === i ? 2 * k + 1 : 2 * k
        if (mate[blossombase[topOf[group[j]!]!]!] === -1) {
          augment(i, j, p)
          return true
        }
        labelT(j, p ^ 1)
      } else if (type === 3) {
        const k = H3.pop()
        addBlossom(scanBlossom(EI[k]!, EJ[k]!), k)
      } else {
        expandBlossom(H4.pop())
      }
    }
  }

  /** Puts every touched dual back to its true value and clears the tree. */
  function endStage(): void {
    for (let i = 0; i < ntv; i++) {
      const v = touchedV[i]!
      const l = label[topOf[group[v]!]!]
      const o = v * K
      if (l === 1) for (let c = 0; c < K; c++) dual[o + c]! -= D[c]!
      else if (l === 2) for (let c = 0; c < K; c++) dual[o + c]! += D[c]!
    }
    for (let i = 0; i < touchedB.length; i++) {
      const b = touchedB[i]!
      if (blossombase[b]! >= 0 && blossomparent[b] === -1) {
        const l = label[b]
        const o = b * K
        if (l === 1) for (let c = 0; c < K; c++) dual[o + c]! += D[c]!
        else if (l === 2) for (let c = 0; c < K; c++) dual[o + c]! -= D[c]!
      }
    }
    for (let i = 0; i < ntv; i++) {
      const v = touchedV[i]!
      label[v] = 0
      labelend[v] = -1
      bestedge[v] = -1
      tflag[v] = 0
    }
    for (let i = 0; i < touchedB.length; i++) {
      const b = touchedB[i]!
      label[b] = 0
      labelend[b] = -1
      bflag[b] = 0
    }
    ntv = 0
    touchedB = []
    for (let i = 0; i < H2.count; i++) inH2[H2.items[i]!] = 0
    H2.count = H3.count = H4.count = 0
    while (pendingFree.length > 0) unused.push(pendingFree.pop()!)
  }

  // Greedy start. Each vertex's dual is its best incident weight, which is always feasible.
  // Then one pass tightens each free vertex onto its least-slack edge.
  for (let v = 0; v < N; v++) {
    if (adjStart[v] === adjStart[v + 1]) return finish(false)
    let best = -1
    for (let a = adjStart[v]!; a < adjStart[v + 1]!; a++) {
      const k = adj[a]! >> 1
      if (best === -1) {
        best = k
        continue
      }
      for (let c = 0; c < K; c++) {
        const difference = W[k * K + c]! - W[best * K + c]!
        if (difference > 0) {
          best = k
          break
        }
        if (difference < 0) break
      }
    }
    for (let c = 0; c < K; c++) dual[v * K + c] = W[best * K + c]!
  }
  const least = new Float64Array(K)
  for (let v = 0; v < N; v++) {
    tick()
    if (mate[v] !== -1) continue
    let bestEnd = -1
    const ov = v * K
    for (let a = adjStart[v]!; a < adjStart[v + 1]!; a++) {
      const p = adj[a]!
      const k = p >> 1
      const ow = endpoint[p]! * K
      const ok = k * K
      let order = bestEnd === -1 ? -1 : 0
      for (let c = 0; c < K; c++) {
        const x = dual[ov + c]! + dual[ow + c]! - 2 * W[ok + c]!
        tmp[c] = x
        if (order === 0) {
          const difference = x - least[c]!
          if (difference < 0) order = -1
          else if (difference > 0) order = 1
        }
      }
      if (order < 0) {
        bestEnd = p
        least.set(tmp)
      }
    }
    for (let c = 0; c < K; c++) dual[ov + c]! -= least[c]!
    const w = endpoint[bestEnd]!
    if (mate[w] === -1) {
      mate[v] = bestEnd
      mate[w] = bestEnd ^ 1
    }
  }

  for (let root = 0; root < N; root++) {
    if (mate[root] !== -1) continue
    const matched = stage(root)
    endStage()
    if (!matched) return finish(false)
  }
  return finish(true)
}
