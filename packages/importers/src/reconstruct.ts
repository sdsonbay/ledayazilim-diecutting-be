import {
  DielineBuilder,
  distance,
  pointInPolygon,
  polygonArea,
  signedArea,
  type Dieline,
  type PanelRole,
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

  return buildFromSegments(segs, paths, filename)
}

// ---------------------------------------------------------------------------
// Düzlemsel bölünme (yarım kenar) → paneller, kırımlar, katlama ağacı
// ---------------------------------------------------------------------------

interface HalfEdge {
  from: Vertex
  to: Vertex
  crease: boolean
  twin: number
  next: number
  face: number
  angle: number
}

interface Face {
  /** Saat yönünün tersine dolaşılan sınır (sınırlı yüzlerde alan > 0). */
  outline: Point[]
  area: number
  edges: number[]
}

/** Kesim çizgisini geçen bölge malzeme ↔ boşluk değiştirir; kırım çizgisini geçen değiştirmez. */
const buildFromSegments = (segs: Seg[], paths: ImportedPath[], filename: string): Dieline => {
  const he: HalfEdge[] = []
  const out = new Map<string, number[]>()
  for (const seg of segs) {
    const i = he.length
    he.push({ from: seg.a, to: seg.b, crease: seg.crease, twin: i + 1, next: -1, face: -1, angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) })
    he.push({ from: seg.b, to: seg.a, crease: seg.crease, twin: i, next: -1, face: -1, angle: Math.atan2(seg.a.y - seg.b.y, seg.a.x - seg.b.x) })
    for (const k of [i, i + 1]) {
      const list = out.get(he[k]!.from.key) ?? []
      list.push(k)
      out.set(he[k]!.from.key, list)
    }
  }
  for (const list of out.values()) list.sort((a, b) => he[a]!.angle - he[b]!.angle)
  // Sonraki kenar: varılan köşede, gelinen kenarın ikizinden saat yönünde bir önceki çıkış.
  for (let i = 0; i < he.length; i += 1) {
    const e = he[i]!
    const list = out.get(e.to.key)!
    const idx = list.indexOf(e.twin)
    e.next = list[(idx - 1 + list.length) % list.length]!
  }

  const faces: Face[] = []
  for (let i = 0; i < he.length; i += 1) {
    if (he[i]!.face >= 0) continue
    const id = faces.length
    const edges: number[] = []
    const outline: Point[] = []
    let k = i
    let guard = 0
    while (he[k]!.face < 0 && guard < 200_000) {
      he[k]!.face = id
      edges.push(k)
      outline.push({ x: he[k]!.from.x, y: he[k]!.from.y })
      k = he[k]!.next
      guard += 1
    }
    faces.push({ outline, area: signedArea(outline), edges })
  }

  // Bağlı bileşenler: içteki bir bileşenin (ör. ayrı çizilmiş delik) dış yüzü,
  // onu çevreleyen yüzle aynı bölgedir.
  const comp = new Map<string, number>()
  let compCount = 0
  for (const key of out.keys()) {
    if (comp.has(key)) continue
    const stack = [key]
    comp.set(key, compCount)
    while (stack.length) {
      const v = stack.pop()!
      for (const k of out.get(v) ?? []) {
        const w = he[k]!.to.key
        if (!comp.has(w)) {
          comp.set(w, compCount)
          stack.push(w)
        }
      }
    }
    compCount += 1
  }
  const faceComp = faces.map((f) => comp.get(he[f.edges[0]!]!.from.key) ?? 0)
  const parentFace = faces.map(() => -1)
  const holesOf = new Map<number, number[]>()
  faces.forEach((f, i) => {
    if (f.area > 0) return
    // Bileşenin dış sınırı: onu içeren en küçük, başka bileşene ait sınırlı yüz.
    const probe = f.outline[0]!
    let best = -1
    let bestArea = Infinity
    faces.forEach((g, j) => {
      if (g.area <= 0 || faceComp[j] === faceComp[i] || g.area >= bestArea) return
      if (pointInPolygon(probe, g.outline)) {
        best = j
        bestArea = g.area
      }
    })
    parentFace[i] = best
    if (best >= 0) holesOf.set(best, [...(holesOf.get(best) ?? []), i])
  })
  // Bölge kimliği: dış yüzler çevreleyen yüzle birleşir.
  const region = faces.map((_, i) => i)
  const root = (i: number): number => (parentFace[i]! >= 0 && faces[i]!.area <= 0 ? root(parentFace[i]!) : region[i]!)

  // Malzeme / boşluk: en dıştaki yüzlerden başla, kesimde değiştir, kırımda koru.
  const material = new Map<number, boolean>()
  const queue: number[] = []
  faces.forEach((f, i) => {
    if (f.area <= 0 && parentFace[i] === -1) {
      material.set(i, false)
      queue.push(i)
    }
  })
  const neighbours = (r: number): { other: number; crease: boolean }[] => {
    const list: { other: number; crease: boolean }[] = []
    const members = faces.map((_, i) => i).filter((i) => root(i) === r)
    for (const m of members) {
      for (const k of faces[m]!.edges) {
        const other = root(he[he[k]!.twin]!.face)
        if (other !== r) list.push({ other, crease: he[k]!.crease })
      }
    }
    return list
  }
  const neighbourCache = new Map<number, { other: number; crease: boolean }[]>()
  // Dış boşluğa komşu her bölge malzemedir (dış hatta kesim yerine kırım çizilmiş olsa bile).
  const outer = [...queue]
  queue.length = 0
  for (const r of outer) {
    const list = neighbours(r)
    neighbourCache.set(r, list)
    for (const { other } of list) {
      if (material.has(other)) continue
      material.set(other, true)
      queue.push(other)
    }
  }
  while (queue.length) {
    const r = queue.shift()!
    const mat = material.get(r)!
    const list = neighbourCache.get(r) ?? neighbours(r)
    neighbourCache.set(r, list)
    for (const { other, crease } of list) {
      if (material.has(other)) continue
      material.set(other, crease ? mat : !mat)
      queue.push(other)
    }
  }

  const hasCrease = (i: number) => faces[i]!.edges.some((k) => he[k]!.crease && root(he[he[k]!.twin]!.face) !== i)
  const panelFaces = faces
    .map((f, i) => ({ f, i }))
    .filter(({ f, i }) => f.area >= MIN_FACE_AREA && root(i) === i && material.get(i) === true)
    // Kırımsız küçük parça (ör. kenardan taşan oyuk dikdörtgeninin dış yarısı) hurdadır.
    .filter(({ f, i }) => hasCrease(i) || f.area >= 900)
  if (panelFaces.length === 0) {
    throw new ImportError('Kapalı panel bulunamadı. Kesim dış hat ve kırım çizgileri ayrı katmanda olmalı.')
  }

  const builder = new DielineBuilder('imported', { name: { tr: filename, en: filename }, caliper: 0.4 }, { source: filename })
  for (const path of paths) {
    const cmds: PathCommand[] = path.points.map((p, i) => (i === 0 ? { c: 'M', x: p.x, y: p.y } : { c: 'L', x: p.x, y: p.y }))
    builder.addPath(path.layer, cmds)
  }

  const index = new Map<number, number>()
  panelFaces.forEach(({ i }, n) => index.set(i, n))
  const outlineOf = (f: Face) => simplifyCollinear(f.outline)

  // Kırım bağlantıları: iki farklı panel arasındaki kırım kenarları, eş doğrusal parçalar tek eksen.
  type Link = { a: number; b: number; axis: [Point, Point]; len: number }
  const pairSegs = new Map<string, { a: number; b: number; segs: [Point, Point][] }>()
  for (let k = 0; k < he.length; k += 2) {
    const e = he[k]!
    if (!e.crease) continue
    const fa = index.get(root(e.face))
    const fb = index.get(root(he[e.twin]!.face))
    if (fa === undefined || fb === undefined || fa === fb) continue
    const [a, b] = fa < fb ? [fa, fb] : [fb, fa]
    const key = `${a}-${b}`
    const entry = pairSegs.get(key) ?? { a, b, segs: [] }
    entry.segs.push([{ x: e.from.x, y: e.from.y }, { x: e.to.x, y: e.to.y }])
    pairSegs.set(key, entry)
  }
  const links: Link[] = []
  for (const { a, b, segs: list } of pairSegs.values()) {
    const axis = mergeAxis(list)
    const len = distance(axis[0], axis[1])
    if (len >= MIN_CREASE_EDGE * 0.5) links.push({ a, b, axis, len })
  }

  // Kök: en çok kırımı olan büyük panel (gövde); ağaç: en uzun kırımlar önce (en büyük kapsayan ağaç).
  const degree = new Map<number, number>()
  for (const l of links) {
    degree.set(l.a, (degree.get(l.a) ?? 0) + l.len)
    degree.set(l.b, (degree.get(l.b) ?? 0) + l.len)
  }
  const areas = panelFaces.map(({ f }) => f.area)
  let rootIdx = 0
  panelFaces.forEach((_, n) => {
    const score = areas[n]! * (1 + (degree.get(n) ?? 0) / 1000)
    const best = areas[rootIdx]! * (1 + (degree.get(rootIdx) ?? 0) / 1000)
    if (score > best) rootIdx = n
  })
  const parentOf = new Map<number, { parent: number; link: Link }>()
  const inTree = new Set([rootIdx])
  for (;;) {
    let pick: Link | null = null
    for (const l of links) {
      if (inTree.has(l.a) === inTree.has(l.b)) continue
      if (!pick || l.len > pick.len) pick = l
    }
    if (!pick) break
    const parent = inTree.has(pick.a) ? pick.a : pick.b
    const child = parent === pick.a ? pick.b : pick.a
    parentOf.set(child, { parent, link: pick })
    inTree.add(child)
  }

  const roles = assignRoles(panelFaces.map(({ f }) => outlineOf(f)), rootIdx, parentOf)
  const ids = panelFaces.map((_, n) => `p${n}`)
  panelFaces.forEach(({ f, i }, n) => {
    const holes = (holesOf.get(i) ?? [])
      .map((h) => faces[h]!.outline)
      .filter((h) => Math.abs(signedArea(h)) >= MIN_FACE_AREA * 0.25)
      .map((h) => (signedArea(h) > 0 ? [...h].reverse() : h))
    const role = roles.role[n]!
    builder.panel({
      id: ids[n]!,
      name: ids[n]!,
      label: { tr: n === rootIdx ? 'Gövde' : `Panel ${n}`, en: n === rootIdx ? 'Body' : `Panel ${n}` },
      outline: outlineOf(f),
      ...(holes.length ? { holes } : {}),
      role,
      printable: role !== 'glue',
    })
  })
  builder.root(ids[rootIdx]!)
  // Ağaç sırasıyla (ebeveyn önce) katla.
  const order = [...parentOf.keys()].sort((x, y) => depthOf(x, parentOf) - depthOf(y, parentOf))
  for (const child of order) {
    const { parent, link } = parentOf.get(child)!
    builder.fold({ parent: ids[parent]!, child: ids[child]!, axis: link.axis, angle: roles.angle.get(child) ?? 90, draw: false })
  }

  if (inTree.size < panelFaces.length) {
    builder.warn(
      'disconnected',
      'warning',
      `${panelFaces.length - inTree.size} panel katlama ağacına bağlanamadı (ayrı parça olabilir).`,
      `${panelFaces.length - inTree.size} panels could not be attached to the fold tree (separate pieces?).`,
    )
  }
  if (links.length === 0) {
    builder.warn('no-folds', 'warning', 'Kırım bulunamadı; 3D düz durur. CREASE katmanı veya yeşil kırım çizgisi gerekir.', 'No creases found; 3D stays flat. A CREASE layer is required.')
  }
  return builder.build()
}

const depthOf = (n: number, parentOf: Map<number, { parent: number }>): number => {
  let d = 0
  let cur = n
  while (parentOf.has(cur) && d < 1000) {
    cur = parentOf.get(cur)!.parent
    d += 1
  }
  return d
}

/** Eş doğrusal ardışık köşeleri ayıklar (eğriler korunur: yalnız neredeyse düz açılar). */
const simplifyCollinear = (pts: Point[]): Point[] => {
  const outPts: Point[] = []
  const n = pts.length
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i - 1 + n) % n]!
    const b = pts[i]!
    const c = pts[(i + 1) % n]!
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const len = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y)
    if (len > 0 && Math.abs(cross) / len < 1e-4) {
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
      if (dot > 0) continue
    }
    outPts.push(b)
  }
  return outPts.length >= 3 ? outPts : pts
}

/** Aynı panel çifti arasındaki kırım parçaları: eş doğrusalsa uçtan uca tek eksen, değilse en uzunu. */
const mergeAxis = (list: [Point, Point][]): [Point, Point] => {
  const longest = list.reduce((m, s) => (distance(s[0], s[1]) > distance(m[0], m[1]) ? s : m), list[0]!)
  const [p, q] = longest
  const len = distance(p, q)
  const dx = (q.x - p.x) / len
  const dy = (q.y - p.y) / len
  const collinear = list.every((s) => s.every((v) => Math.abs((v.x - p.x) * dy - (v.y - p.y) * dx) < 0.3))
  if (!collinear) return longest
  let lo = 0
  let hi = len
  for (const s of list) {
    for (const v of s) {
      const t = (v.x - p.x) * dx + (v.y - p.y) * dy
      lo = Math.min(lo, t)
      hi = Math.max(hi, t)
    }
  }
  return [
    { x: p.x + dx * lo, y: p.y + dy * lo },
    { x: p.x + dx * hi, y: p.y + dy * hi },
  ]
}

/** Bir panelin verilen yöne göre genişliği (izdüşüm aralığı). */
const extentAlong = (outline: Point[], dx: number, dy: number): number => {
  let lo = Infinity
  let hi = -Infinity
  for (const v of outline) {
    const t = v.x * dx + v.y * dy
    lo = Math.min(lo, t)
    hi = Math.max(hi, t)
  }
  return hi - lo
}

/**
 * Panel rolleri ve katlama açıları (sezgisel):
 * - Kökten paralel kırımlarla zincirlenen eşit yükseklikte paneller gövde duvarlarıdır;
 *   zincirde k ≥ 5 eşit duvar varsa çokgen tüp (360/k), dar uç panel yapıştırma payıdır.
 * - Gövde dışındaki büyük kanat kapak, küçükleri toz kapağı, onların çocukları dil.
 */
const assignRoles = (
  outlines: Point[][],
  rootIdx: number,
  parentOf: Map<number, { parent: number; link: { axis: [Point, Point]; len: number } }>,
): { role: PanelRole[]; angle: Map<number, number> } => {
  const n = outlines.length
  const role: PanelRole[] = outlines.map(() => 'flap')
  const angle = new Map<number, number>()
  const children = new Map<number, number[]>()
  for (const [c, { parent }] of parentOf) children.set(parent, [...(children.get(parent) ?? []), c])
  const dirOf = (c: number) => {
    const [a, b] = parentOf.get(c)!.link.axis
    const len = Math.max(distance(a, b), 1e-9)
    return { dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, len }
  }
  const parallel = (c1: number, c2: number) => {
    const d1 = dirOf(c1)
    const d2 = dirOf(c2)
    return Math.abs(d1.dx * d2.dy - d1.dy * d2.dx) < 0.02 && Math.abs(d1.len - d2.len) < Math.max(1, d1.len * 0.03)
  }

  // Gövde zinciri: kökten tek bir yönde, paralel ve aynı uzunlukta kırımlarla ilerleyen paneller.
  // Her yön ayrı denenir (tepside iki yön de 3 panelde kalır; tüpte bir yön ≥ 4 panele uzar).
  const rootKids = children.get(rootIdx) ?? []
  const chainFrom = (seed: number[]): Set<number> => {
    const chain = new Set([rootIdx])
    const stack = [...seed]
    while (stack.length) {
      const c = stack.pop()!
      chain.add(c)
      for (const g of children.get(c) ?? []) if (parallel(c, g) && !chain.has(g)) stack.push(g)
    }
    return chain
  }
  let body = new Set([rootIdx])
  for (const c of rootKids) {
    const group = rootKids.filter((o) => o === c || parallel(c, o))
    const chain = chainFrom(group)
    if (chain.size > body.size) body = chain
  }
  const bodyList = [...body].filter((b) => b !== rootIdx)
  const chainDir = bodyList.length ? dirOf(bodyList[0]!) : null
  const widthOf = (i: number) => (chainDir ? extentAlong(outlines[i]!, -chainDir.dy, chainDir.dx) : 0)

  // Tüp/gövde: en az 4 panellik zincir (duvarlar + yapıştırma) ya da eşit genişlikte 3 duvar
  // (üçgen tüp). Tepsideki duvar–taban–duvar üçlüsü gövde sayılmaz.
  const chainWidths = [...body].map(widthOf)
  const equalTriple = body.size === 3 && Math.max(...chainWidths) - Math.min(...chainWidths) <= Math.max(1, Math.max(...chainWidths) * 0.05)
  const isTube = Boolean(chainDir) && (body.size >= 4 || equalTriple)
  if (!isTube) {
    body.clear()
    body.add(rootIdx)
  }
  if (isTube && chainDir) {
    const widths = [...body].map(widthOf)
    const maxW = Math.max(...widths)
    const walls = [...body].filter((i) => widthOf(i) >= maxW * 0.35)
    const glue = [...body].filter((i) => widthOf(i) < maxW * 0.35)
    for (const w of walls) role[w] = 'wall'
    for (const g of glue) role[g] = 'glue'
    const wallW = walls.map(widthOf)
    const equal = Math.max(...wallW) - Math.min(...wallW) <= Math.max(1, Math.max(...wallW) * 0.05)
    const k = walls.length
    const turn = (k >= 5 || k === 3) && equal ? 360 / k : 90
    for (const b of body) if (b !== rootIdx) angle.set(b, turn)
  } else {
    role[rootIdx] = 'bottom'
    for (const c of rootKids) role[c] = 'wall'
  }
  if (isTube) role[rootIdx] = 'wall'

  // Gövdeye bağlı diğer paneller: her duvar kenarında en büyük olan kapak, diğerleri toz kapağı.
  const structural = new Set([...body, ...(role[rootIdx] === 'bottom' ? [rootIdx, ...rootKids] : [])])
  const attached: number[] = []
  for (const s of structural) for (const c of children.get(s) ?? []) if (!structural.has(c)) attached.push(c)
  const areaOf = (i: number) => polygonArea(outlines[i]!)
  const maxAttached = Math.max(0, ...attached.map(areaOf))
  for (const c of attached) role[c] = areaOf(c) >= maxAttached * 0.6 ? 'lid' : 'dust'
  // Daha derindekiler: dil / kanat.
  for (let i = 0; i < n; i += 1) {
    if (structural.has(i) || attached.includes(i)) continue
    role[i] = 'flap'
  }
  return { role, angle }
}
