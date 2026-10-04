import { centroid, distance, flattenPath, lerp, normalize, perpendicular, pointInPolygon, polygonArea, signedArea, sub } from './geometry.ts'
import type { DielinePath, Panel, Point } from './types.ts'

const MIN_HOLE_AREA = 8
const EDGE_EPS = 1.25
const BITE_DEPTH = 0.65
const T_EPS = 0.004

const dropClose = (chain: Point[]): Point[] => {
  if (chain.length < 2) return chain
  const a = chain[0]
  const b = chain[chain.length - 1]
  if (a && b && distance(a, b) < 0.45) return chain.slice(0, -1)
  return chain
}

const closedChain = (chain: Point[]): boolean => {
  if (chain.length < 4) return false
  const a = chain[0]
  const b = chain[chain.length - 1]
  return Boolean(a && b && distance(a, b) < 0.7)
}

const densifyChain = (chain: Point[], step = 1.6): Point[] => {
  if (chain.length < 2) return chain
  const closed = closedChain(chain)
  const pts = dropClose(chain)
  if (pts.length < 2) return chain
  const out: Point[] = []
  const n = pts.length
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    if (!a || !b) continue
    out.push(a)
    const len = distance(a, b)
    const segs = Math.floor(len / step)
    for (let k = 1; k < segs; k += 1) {
      out.push({ x: a.x + ((b.x - a.x) * k) / segs, y: a.y + ((b.y - a.y) * k) / segs })
    }
  }
  const last = pts[n - 1]
  if (!closed && last) out.push(last)
  else if (closed && pts[0]) out.push(pts[0])
  return out
}

const touchesOutline = (outline: Point[], chain: Point[]): boolean => {
  for (const p of chain) {
    for (let e = 0; e < outline.length; e += 1) {
      const a = outline[e]
      const b = outline[(e + 1) % outline.length]
      if (!a || !b) continue
      if (distToSeg(p, a, b).dist <= EDGE_EPS + 0.35) return true
    }
  }
  return false
}

const distToSeg = (p: Point, a: Point, b: Point): { dist: number; t: number } => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return { dist: distance(p, a), t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { dist: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t }
}

const signedOffset = (p: Point, a: Point, b: Point): number => {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 1e-9) return 0
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len
}

const interiorSign = (outline: Point[], a: Point, b: Point): number => {
  const mid = lerp(a, b, 0.5)
  const n = normalize(perpendicular(sub(b, a)))
  const probe = { x: mid.x + n.x * 1.2, y: mid.y + n.y * 1.2 }
  return pointInPolygon(probe, outline) ? 1 : -1
}

const containsMostly = (outer: Point[], inner: Point[]): boolean => {
  if (polygonArea(inner) >= polygonArea(outer) * 0.88) return false
  if (!pointInPolygon(centroid(inner), outer)) return false
  let inside = 0
  for (const p of inner) if (pointInPolygon(p, outer)) inside += 1
  return inside >= inner.length * 0.68
}

interface Bite {
  edge: number
  t0: number
  pts: Point[]
}

const collectBites = (outline: Point[], chain: Point[]): Bite[] => {
  const n = chain.length
  if (n < 5) return []
  const closed = closedChain(chain)
  const count = closed ? n - 1 : n
  const bites: Bite[] = []

  let i = 0
  while (i < count) {
    const start = chain[i]
    if (!start) break
    let edge = -1
    let t0 = 0
    let a: Point | null = null
    let b: Point | null = null
    for (let e = 0; e < outline.length; e += 1) {
      const ea = outline[e]
      const eb = outline[(e + 1) % outline.length]
      if (!ea || !eb) continue
      const hit = distToSeg(start, ea, eb)
      if (hit.dist <= EDGE_EPS && (edge < 0 || hit.dist < EDGE_EPS)) {
        edge = e
        t0 = hit.t
        a = ea
        b = eb
      }
    }
    if (edge < 0 || !a || !b) {
      i += 1
      continue
    }

    const inward = interiorSign(outline, a, b)
    const pts: Point[] = [start]
    let maxIn = 0
    let endT = t0
    let endK = i
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
    if (edgeLen < 12) {
      i += 1
      continue
    }
    const limit = i + Math.min(48, closed ? count : count - i)
    let hitVertex = false
    for (let k = i + 1; k < limit; k += 1) {
      const q = chain[k % (closed ? n - 1 : n)]
      if (!q) break
      pts.push(q)
      const depth = signedOffset(q, a, b) * inward
      if (depth > maxIn) maxIn = depth
      const back = distToSeg(q, a, b)
      if (k > i + 2 && back.dist <= EDGE_EPS && Math.abs(back.t - t0) > T_EPS && maxIn >= BITE_DEPTH) {
        endT = back.t
        endK = k
        break
      }
      for (let vi = 0; vi < outline.length; vi += 1) {
        if (vi === edge || vi === (edge + 1) % outline.length) continue
        const v = outline[vi]
        if (v && distance(q, v) < 1.15) {
          hitVertex = true
          break
        }
      }
      if (hitVertex) break
    }

    const span = Math.abs(endT - t0)
    const chord = span * edgeLen
    if (
      !hitVertex &&
      endK > i &&
      maxIn >= BITE_DEPTH &&
      maxIn <= Math.min(55, edgeLen * 0.45) &&
      span > T_EPS &&
      span < 0.62 &&
      chord > 4 &&
      chord < 3.4 * maxIn + 8
    ) {
      const ordered = endT < t0 ? [...pts].reverse() : pts
      bites.push({ edge, t0: Math.min(t0, endT), pts: ordered })
      i = endK
      continue
    }
    i += 1
  }
  return bites
}

const spliceBites = (outline: Point[], bites: Bite[]): Point[] => {
  if (bites.length === 0) return outline
  const byEdge = new Map<number, Bite[]>()
  for (const bite of bites) {
    const list = byEdge.get(bite.edge) ?? []
    if (!list.some((b) => Math.abs(b.t0 - bite.t0) < 0.02)) list.push(bite)
    byEdge.set(bite.edge, list)
  }
  const edges = [...byEdge.keys()].sort((x, y) => y - x)
  let result = outline
  for (const edge of edges) {
    const list = (byEdge.get(edge) ?? []).sort((x, y) => x.t0 - y.t0)
    const a = result[edge]
    const b = result[(edge + 1) % result.length]
    if (!a || !b) continue
    const inserted: Point[] = []
    for (const bite of list) {
      for (const p of bite.pts) {
        if (distance(p, a) < 0.28 || distance(p, b) < 0.28) continue
        const last = inserted[inserted.length - 1]
        if (last && distance(last, p) < 0.18) continue
        inserted.push(p)
      }
    }
    if (inserted.length < 2) continue
    result = [...result.slice(0, edge + 1), ...inserted, ...result.slice(edge + 1)]
  }
  return result
}

/**
 * Üretim kesimlerini 3D panellere işler: iç kapalı yollar delik,
 * kenardan içeri binen oyuklar (başparmak çentiği vb.) dış hat.
 */
export const applyCutFeatures = (panels: Panel[], paths: DielinePath[]): Panel[] => {
  const chains: Point[][] = []
  for (const path of paths) {
    if (path.layer !== 'cut' && path.layer !== 'cutcrease') continue
    for (const chain of flattenPath(path.commands, 0.12)) {
      if (chain.length >= 2) chains.push(chain)
    }
  }

  return panels.map((panel) => {
    let outline = [...panel.outline]
    if (outline.length >= 2) {
      const first = outline[0]
      const last = outline[outline.length - 1]
      if (first && last && distance(first, last) < 0.25) outline = outline.slice(0, -1)
    }
    if (outline.length < 3) return panel

    const dense = chains.map((chain) => densifyChain(chain))
    const holes = [...(panel.holes ?? [])]
    for (const chain of dense) {
      if (!closedChain(chain)) continue
      const poly = dropClose(chain)
      if (polygonArea(poly) < MIN_HOLE_AREA) continue
      if (!containsMostly(outline, poly)) continue
      if (touchesOutline(outline, poly)) continue
      const wound = signedArea(poly) > 0 ? [...poly].reverse() : [...poly]
      const c = centroid(wound)
      if (holes.some((h) => distance(centroid(h), c) < 1.4)) continue
      holes.push(wound)
    }

    const bites: Bite[] = []
    for (const chain of dense) bites.push(...collectBites(outline, chain))
    outline = spliceBites(outline, bites)

    return {
      ...panel,
      outline,
      ...(holes.length > 0 ? { holes } : panel.holes ? { holes: panel.holes } : {}),
    }
  })
}
