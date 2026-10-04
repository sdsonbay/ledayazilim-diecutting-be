import {
  DielineBuilder,
  centroid,
  distance,
  pointInPolygon,
  polygonArea,
  signedArea,
  type Dieline,
  type PathCommand,
  type Point,
} from '@diecut/core'
import { ImportError, type ImportedPath } from './types.ts'

const SNAP = 0.25
const MIN_EDGE = SNAP * 0.5
/** PDF path uçları arası boşluk — Illustrator export'ta ~3–5 mm olabilir. */
const WELD_EPS = 5
/** Katlama ekseni en az bu kadar mm olmalı — köşe artefaktları (0.5 mm) elenir. */
const MIN_CREASE_EDGE = 8
const MIN_FACE_AREA = 8

interface Vertex {
  x: number
  y: number
  key: string
}

interface Seg {
  a: Vertex
  b: Vertex
  crease: boolean
}

const snap = (v: number): number => Math.round(v / SNAP) * SNAP


const keyOf = (x: number, y: number): string => `${snap(x).toFixed(2)},${snap(y).toFixed(2)}`

const vertex = (x: number, y: number): Vertex => {
  const sx = snap(x)
  const sy = snap(y)
  return { x: sx, y: sy, key: keyOf(sx, sy) }
}

const pointOnSeg = (p: Vertex, a: Vertex, b: Vertex): boolean => {
  if (p.key === a.key || p.key === b.key) return false
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  if (len2 < SNAP * SNAP) return false
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  if (t < 0.01 || t > 0.99) return false
  const projX = a.x + abx * t
  const projY = a.y + aby * t
  return Math.hypot(p.x - projX, p.y - projY) <= SNAP * 1.2
}

const segIntersect = (a: Vertex, b: Vertex, c: Vertex, d: Vertex): Vertex | null => {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const s = { x: d.x - c.x, y: d.y - c.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null
  return vertex(a.x + r.x * t, a.y + r.y * t)
}

/** Aynı eksende kopuk path uçları (≤14 mm) — dikey/yatay PDF boşlukları. */
const COLLINEAR_WELD = 14

const shouldWeldEndpoints = (a: Vertex, b: Vertex, endpointKeys: Set<string>): boolean => {
  if (!endpointKeys.has(a.key) && !endpointKeys.has(b.key)) return false
  const d = distance(a, b)
  if (d <= WELD_EPS) return true
  if (d <= COLLINEAR_WELD && (Math.abs(a.x - b.x) <= SNAP * 2 || Math.abs(a.y - b.y) <= SNAP * 2)) return true
  return false
}

/** Path segmentleriyle bağlı bileşenler — zaten bağlı uçlara köprü ekleme (eğri köşe artefaktı). */
const endpointComponents = (raw: { a: Vertex; b: Vertex; crease: boolean }[]): {
  byKey: Map<string, Vertex>
  find: (key: string) => string
  unite: (a: string, b: string) => void
} => {
  const byKey = new Map<string, Vertex>()
  for (const seg of raw) {
    if (!byKey.has(seg.a.key)) byKey.set(seg.a.key, seg.a)
    if (!byKey.has(seg.b.key)) byKey.set(seg.b.key, seg.b)
  }
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let r = key
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r) as string
    let cur = key
    while (parent.has(cur) && parent.get(cur) !== cur) {
      const next = parent.get(cur) as string
      parent.set(cur, r)
      cur = next
    }
    return r
  }
  const unite = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  for (const key of byKey.keys()) parent.set(key, key)
  for (const seg of raw) unite(seg.a.key, seg.b.key)
  return { byKey, find, unite }
}

/** Kopuk bileşenleri en kısa köprüyle birleştir — koordinat kaydırma yok. */
const bridgeEndpointGaps = (
  raw: { a: Vertex; b: Vertex; crease: boolean }[],
  endpointKeys: Set<string>,
): void => {
  const { byKey, find, unite } = endpointComponents(raw)
  const endpoints = [...endpointKeys]
    .map((key) => byKey.get(key))
    .filter((v): v is Vertex => Boolean(v))
  const candidates: { a: Vertex; b: Vertex; d: number }[] = []
  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      const a = endpoints[i] as Vertex
      const b = endpoints[j] as Vertex
      if (!shouldWeldEndpoints(a, b, endpointKeys)) continue
      if (find(a.key) === find(b.key)) continue
      candidates.push({ a, b, d: distance(a, b) })
    }
  }
  candidates.sort((x, y) => x.d - y.d)
  const seen = new Set<string>()
  for (const { a, b } of candidates) {
    if (find(a.key) === find(b.key)) continue
    const edgeKey = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`
    if (seen.has(edgeKey)) continue
    seen.add(edgeKey)
    raw.push({ a, b, crease: false })
    unite(a.key, b.key)
  }
}

const splitSegments = (raw: { a: Vertex; b: Vertex; crease: boolean }[], verts: Vertex[]): Seg[] => {
  const extra: Vertex[] = [...verts]
  for (let i = 0; i < raw.length; i += 1) {
    for (let j = i + 1; j < raw.length; j += 1) {
      const hit = segIntersect(raw[i].a, raw[i].b, raw[j].a, raw[j].b)
      if (hit) extra.push(hit)
    }
  }
  const uniq = new Map<string, Vertex>()
  for (const v of extra) uniq.set(v.key, v)
  const all = [...uniq.values()]

  const out: Seg[] = []
  const seen = new Set<string>()
  for (const seg of raw) {
    const splits = all.filter((v) => pointOnSeg(v, seg.a, seg.b))
    const along = [seg.a, ...splits, seg.b].sort((p, q) => {
      const dp = Math.hypot(p.x - seg.a.x, p.y - seg.a.y)
      const dq = Math.hypot(q.x - seg.a.x, q.y - seg.a.y)
      return dp - dq
    })
    for (let i = 0; i < along.length - 1; i += 1) {
      const a = along[i] as Vertex
      const b = along[i + 1] as Vertex
      if (a.key === b.key) continue
      if (distance(a, b) < MIN_EDGE) continue
      const edgeKey = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`
      if (seen.has(edgeKey)) {
        const existing = out.find((s) => (s.a.key === a.key && s.b.key === b.key) || (s.a.key === b.key && s.b.key === a.key))
        if (existing && seg.crease) existing.crease = true
        continue
      }
      seen.add(edgeKey)
      out.push({ a, b, crease: seg.crease })
    }
  }
  return out
}

export const reconstruct = (paths: ImportedPath[], filename: string): Dieline => {
  const raw: { a: Vertex; b: Vertex; crease: boolean }[] = []
  const verts: Vertex[] = []
  const endpointKeys = new Set<string>()
  for (const path of paths) {
    if (path.points.length === 0) continue
    const first = path.points[0]
    const last = path.points[path.points.length - 1]
    if (first) endpointKeys.add(vertex(first.x, first.y).key)
    if (last) endpointKeys.add(vertex(last.x, last.y).key)
  }
  for (const path of paths) {
    const crease = path.layer === 'crease' || path.layer === 'perf' || path.layer === 'cutcrease'
    for (let i = 1; i < path.points.length; i += 1) {
      const a = vertex(path.points[i - 1].x, path.points[i - 1].y)
      const b = vertex(path.points[i].x, path.points[i].y)
      if (a.key === b.key) continue
      raw.push({ a, b, crease })
      verts.push(a, b)
    }
  }
  if (raw.length < 3) throw new ImportError('Yeterli çizgi yok — kesim ve kırım vektör olmalı')

  bridgeEndpointGaps(raw, endpointKeys)
  const segs = splitSegments(raw, verts)

  let boundsMinX = Infinity
  let boundsMinY = Infinity
  let boundsMaxX = -Infinity
  let boundsMaxY = -Infinity
  for (const path of paths) {
    for (const p of path.points) {
      boundsMinX = Math.min(boundsMinX, p.x)
      boundsMinY = Math.min(boundsMinY, p.y)
      boundsMaxX = Math.max(boundsMaxX, p.x)
      boundsMaxY = Math.max(boundsMaxY, p.y)
    }
  }
  const layoutArea = Math.max((boundsMaxX - boundsMinX) * (boundsMaxY - boundsMinY), 1)
  /** Dış (sonsuz) yüz — tablonun ~%65'inden büyük, kırımsız siluet. */
  const isOuterContainerFace = (outline: Point[]): boolean =>
    polygonArea(outline) > layoutArea * 0.65

  const adj = new Map<string, { to: Vertex; crease: boolean }[]>()
  const byKey = new Map<string, Vertex>()
  for (const seg of segs) {
    byKey.set(seg.a.key, seg.a)
    byKey.set(seg.b.key, seg.b)
    const add = (from: Vertex, to: Vertex, crease: boolean) => {
      const list = adj.get(from.key) ?? []
      if (!list.some((n) => n.to.key === to.key)) list.push({ to, crease })
      adj.set(from.key, list)
    }
    add(seg.a, seg.b, seg.crease)
    add(seg.b, seg.a, seg.crease)
  }

  const faceSignatures = new Set<string>()
  const faces: { outline: Point[]; creaseKeys: Set<string> }[] = []

  const dirKey = (a: string, b: string) => `${a}>${b}`

  const faceSignature = (outline: Point[]): string => {
    const edges: string[] = []
    for (let i = 0; i < outline.length; i += 1) {
      const p = outline[i] as Point
      const q = outline[(i + 1) % outline.length] as Point
      const a = keyOf(p.x, p.y)
      const b = keyOf(q.x, q.y)
      edges.push(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
    edges.sort()
    return edges.join(';')
  }

  const nextVertex = (prev: Vertex, cur: Vertex): Vertex | null => {
    const nbrs = adj.get(cur.key)
    if (!nbrs || nbrs.length === 0) return null
    const ranked = nbrs
      .map((n) => ({ n, angle: Math.atan2(n.to.y - cur.y, n.to.x - cur.x) }))
      .sort((a, b) => a.angle - b.angle)
    const idx = ranked.findIndex((r) => r.n.to.key === prev.key)
    if (idx < 0) return ranked[0]?.n.to ?? null
    const n = ranked.length
    return ranked[(idx - 1 + n) % n]?.n.to ?? null
  }

  for (const [fromKey, nbrs] of adj) {
    const from = byKey.get(fromKey)
    if (!from) continue
    for (const n of nbrs) {
      const outline: Point[] = []
      const creaseKeys = new Set<string>()
      let prev = from
      let cur = n.to
      let guard = 0
      const stepSeen = new Set<string>([dirKey(from.key, n.to.key)])
      outline.push({ x: from.x, y: from.y })
      while (guard < 4000) {
        guard += 1
        outline.push({ x: cur.x, y: cur.y })
        const edge = segs.find(
          (s) => (s.a.key === prev.key && s.b.key === cur.key) || (s.a.key === cur.key && s.b.key === prev.key),
        )
        if (edge?.crease) {
          const ck = prev.key < cur.key ? `${prev.key}|${cur.key}` : `${cur.key}|${prev.key}`
          creaseKeys.add(ck)
        }
        const nxt = nextVertex(prev, cur)
        if (!nxt) break
        const stepKey = dirKey(cur.key, nxt.key)
        if (stepSeen.has(stepKey) && nxt.key !== from.key) break
        if (stepSeen.has(stepKey) && nxt.key === from.key && outline.length >= 3) {
          cur = from
          break
        }
        stepSeen.add(stepKey)
        prev = cur
        cur = nxt
        if (cur.key === from.key && outline.length >= 3) break
      }
      if (outline.length < 3 || cur.key !== from.key) continue
      if (outline[outline.length - 1] && keyOf(outline[outline.length - 1].x, outline[outline.length - 1].y) === from.key) {
        outline.pop()
      }
      if (isOuterContainerFace(outline)) continue
      if (Math.abs(signedArea(outline)) <= MIN_FACE_AREA) continue
      const sig = faceSignature(outline)
      if (faceSignatures.has(sig)) continue
      faceSignatures.add(sig)
      faces.push({ outline, creaseKeys })
    }
  }

  const contains = (outer: Point[], inner: Point[]): boolean => {
    if (polygonArea(inner) >= polygonArea(outer) * 0.9) return false
    const c = centroid(inner)
    if (!pointInPolygon(c, outer)) return false
    let inside = 0
    for (const p of inner) if (pointInPolygon(p, outer)) inside += 1
    return inside >= inner.length * 0.65
  }

  const candidates = faces.filter((face) => {
    const area = polygonArea(face.outline)
    if (face.creaseKeys.size > 0) return area >= MIN_FACE_AREA
    return area >= 900
  })

  const panels = candidates.filter(
    (face) =>
      !(
        face.creaseKeys.size === 0 &&
        candidates.some((other) => other !== face && contains(other.outline, face.outline))
      ),
  )

  if (panels.length === 0) {
    throw new ImportError('Kapalı panel bulunamadı. Kesim dış hat ve kırım çizgileri ayrı katmanda olmalı.')
  }

  const builder = new DielineBuilder(
    'imported',
    { name: { tr: filename, en: filename }, caliper: 0.4 },
    { source: filename },
  )

  for (const path of paths) {
    const cmds: PathCommand[] = path.points.map((p, i) =>
      i === 0 ? { c: 'M', x: p.x, y: p.y } : { c: 'L', x: p.x, y: p.y },
    )
    builder.addPath(path.layer, cmds)
  }

  const ranked = [...panels].sort((a, b) => polygonArea(b.outline) - polygonArea(a.outline))
  const holesFor: Point[][][] = ranked.map(() => [])
  const pushHole = (parent: number, outline: Point[]) => {
    const c = centroid(outline)
    const exists = holesFor[parent]?.some((h) => {
      const q = centroid(h)
      return Math.hypot(q.x - c.x, q.y - c.y) < 1.5
    })
    if (exists) return
    const wound = signedArea(outline) > 0 ? [...outline].reverse() : [...outline]
    holesFor[parent]?.push(wound)
  }

  for (const face of faces) {
    if (ranked.includes(face)) continue
    const area = polygonArea(face.outline)
    if (area < MIN_FACE_AREA) continue
    let best = -1
    let bestArea = Infinity
    ranked.forEach((body, i) => {
      if (body === face) return
      if (!contains(body.outline, face.outline)) return
      const a = polygonArea(body.outline)
      if (a < bestArea) {
        bestArea = a
        best = i
      }
    })
    if (best < 0) continue
    pushHole(best, face.outline)
  }

  for (const path of paths) {
    if (path.layer !== 'cut' || path.points.length < 4) continue
    const first = path.points[0]
    const last = path.points[path.points.length - 1]
    if (!first || !last) continue
    if (Math.hypot(first.x - last.x, first.y - last.y) > 1.2) continue
    const outline = path.points.slice(0, Math.hypot(first.x - last.x, first.y - last.y) < 0.4 ? -1 : undefined)
    if (polygonArea(outline) < MIN_FACE_AREA) continue
    let best = -1
    let bestArea = Infinity
    ranked.forEach((body, i) => {
      if (!contains(body.outline, outline)) return
      const a = polygonArea(body.outline)
      if (a < bestArea) {
        bestArea = a
        best = i
      }
    })
    if (best >= 0) pushHole(best, outline)
  }

  const ids: string[] = []
  ranked.forEach((face, i) => {
    const id = `p${i}`
    ids.push(id)
    const holes = holesFor[i] ?? []
    builder.panel({
      id,
      name: id,
      label: { tr: i === 0 ? 'Taban' : `Panel ${i}`, en: i === 0 ? 'Base' : `Panel ${i}` },
      outline: signedArea(face.outline) < 0 ? [...face.outline].reverse() : face.outline,
      ...(holes.length > 0 ? { holes } : {}),
      role: i === 0 ? 'bottom' : 'wall',
      printable: true,
    })
  })

  type Link = { a: number; b: number; axis: [Point, Point]; len: number }
  const edgeKeyOf = (p: Point, q: Point): string => {
    const a = keyOf(p.x, p.y)
    const b = keyOf(q.x, q.y)
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }
  const edgesOf = (outline: Point[]): Map<string, [Point, Point]> => {
    const map = new Map<string, [Point, Point]>()
    for (let i = 0; i < outline.length; i += 1) {
      const p = outline[i] as Point
      const q = outline[(i + 1) % outline.length] as Point
      map.set(edgeKeyOf(p, q), [p, q])
    }
    return map
  }
  const faceEdges = ranked.map((f) => edgesOf(f.outline))

  /** Kesişimlerde bölünmüş kırım segmentleri — tam path kenarı panel sınırıyla uyuşmayabilir. */
  const creaseEdgeKeys = new Set<string>()
  for (const seg of segs) {
    if (!seg.crease) continue
    const ek = seg.a.key < seg.b.key ? `${seg.a.key}|${seg.b.key}` : `${seg.b.key}|${seg.a.key}`
    creaseEdgeKeys.add(ek)
  }

  const links: Link[] = []
  const linked = new Set<string>()
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      let best: [Point, Point] | null = null
      let bestLen = 0
      for (const [ek, axis] of faceEdges[i] as Map<string, [Point, Point]>) {
        if (!(faceEdges[j] as Map<string, [Point, Point]>).has(ek)) continue
        if (!creaseEdgeKeys.has(ek)) continue
        const len = distance(axis[0], axis[1])
        if (len > bestLen) {
          bestLen = len
          best = axis
        }
      }
      if (!best || bestLen < MIN_CREASE_EDGE) continue
      const pair = `${i}-${j}`
      if (linked.has(pair)) continue
      linked.add(pair)
      links.push({ a: i, b: j, axis: best, len: bestLen })
    }
  }

  // Kruskal-benzeri: önce uzun kırım kenarları — duvarlar kanatlardan önce bağlansın.
  links.sort((x, y) => y.len - x.len)
  const seen = new Set([0])
  const linkDegree = new Map<number, number>()
  const parentOf = new Map<number, number>()
  while (seen.size < ranked.length) {
    let added = false
    for (const link of links) {
      const aSeen = seen.has(link.a)
      const bSeen = seen.has(link.b)
      if (aSeen === bSeen) continue
      const par = aSeen ? link.a : link.b
      const child = aSeen ? link.b : link.a
      if (seen.has(child)) continue
      seen.add(child)
      parentOf.set(child, par)
      linkDegree.set(child, (linkDegree.get(child) ?? 0) + 1)
      linkDegree.set(par, (linkDegree.get(par) ?? 0) + 1)
      added = true
      const childArea = polygonArea(ranked[child].outline)
      const thin = childArea < 320 || (childArea < 500 && link.len / Math.max(Math.sqrt(childArea), 1) > 2)
      builder.fold({
        parent: ids[par] as string,
        child: ids[child] as string,
        axis: link.axis,
        angle: thin ? 180 : 90,
        draw: false,
      })
    }
    if (!added) break
  }

  // Rolleri katlama derecesine göre güncelle (kanat / yapıştırma).
  const panelRoles = new Map<string, { role: 'bottom' | 'wall' | 'flap' | 'glue' | 'lid'; printable: boolean }>()
  panelRoles.set(ids[0] as string, { role: 'bottom', printable: true })
  for (let i = 1; i < ranked.length; i += 1) {
    const area = polygonArea(ranked[i].outline)
    const par = parentOf.get(i) ?? -1
    const role =
      area < 320
        ? 'glue'
        : par === 0
          ? 'wall'
          : (linkDegree.get(i) ?? 0) <= 1 && area < 3200
            ? 'flap'
            : 'wall'
    panelRoles.set(ids[i] as string, { role, printable: role !== 'glue' })
  }

  builder.root(ids[0] as string)
  if (seen.size < ranked.length) {
    builder.warn(
      'disconnected',
      'warning',
      `${ranked.length - seen.size} panel katlama ağacına bağlanamadı.`,
      `${ranked.length - seen.size} panels could not be attached to the fold tree.`,
    )
  }
  if (links.length === 0) {
    builder.warn(
      'no-folds',
      'warning',
      'Kırım bulunamadı; 3D düz durur. CREASE katmanı veya mavi/yeşil kırım çizgisi gerekir.',
      'No creases found; 3D stays flat. A CREASE layer is required.',
    )
  }
  const built = builder.build()
  for (const panel of built.panels) {
    const role = panelRoles.get(panel.id)
    if (role) {
      panel.role = role.role
      panel.printable = role.printable
    }
  }
  return built
}
