import type { PathCommand, Point, Rect } from './types.ts'

export const EPS = 1e-9

export const pt = (x: number, y: number): Point => ({ x, y })

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x
export const length = (a: Point): number => Math.hypot(a.x, a.y)
export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

export function normalize(a: Point): Point {
  const l = length(a)
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Saat yönünün tersine 90° döndürür — kenar normali üretmek için. */
export const perpendicular = (a: Point): Point => ({ x: -a.y, y: a.x })

export function rotate(p: Point, radians: number, about: Point = { x: 0, y: 0 }): Point {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  const dx = p.x - about.x
  const dy = p.y - about.y
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c }
}

/** Afin dönüşüm matrisi: [a c e; b d f; 0 0 1] (SVG sırası). */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export const translation = (dx: number, dy: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy })

export function rotation(radians: number): Matrix {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 }
}

export const scaling = (sx: number, sy: number = sx): Matrix => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 })

/** Y eksenine göre ayna (dieline'ın ters yüzünü üretmek için). */
export const mirrorX = (): Matrix => ({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  }
}

export const applyMatrix = (m: Matrix, p: Point): Point => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
})

export function boundsOfPoints(points: readonly Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function unionRect(a: Rect, b: Rect): Rect {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Kapalı poligonun işaretli alanı; pozitif = saat yönünün tersi. */
export function signedArea(polygon: readonly Point[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point
    const b = polygon[(i + 1) % polygon.length] as Point
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export const polygonArea = (polygon: readonly Point[]): number => Math.abs(signedArea(polygon))

export function polygonCentroid(polygon: readonly Point[]): Point {
  const a = signedArea(polygon)
  if (Math.abs(a) < EPS) return boundsCenter(boundsOfPoints(polygon))
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i] as Point
    const q = polygon[(i + 1) % polygon.length] as Point
    const w = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * w
    cy += (p.y + q.y) * w
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export const boundsCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })

export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point
    const b = polygon[j] as Point
    const intersects = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

// ---------------------------------------------------------------------------
// Yay (arc) çözümleme ve düzleştirme
// ---------------------------------------------------------------------------

interface ArcCenter {
  cx: number
  cy: number
  startAngle: number
  deltaAngle: number
  rx: number
  ry: number
  rot: number
}

/**
 * SVG uç-nokta yay parametrelerini merkez parametrelerine çevirir
 * (SVG 1.1 spec, ek F.6.5). Yayı örneklemek için gerekli.
 */
function arcEndpointToCenter(from: Point, cmd: Extract<PathCommand, { c: 'A' }>): ArcCenter | null {
  let { rx, ry } = cmd
  const phi = (cmd.rot * Math.PI) / 180
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx < EPS || ry < EPS) return null

  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx2 = (from.x - cmd.x) / 2
  const dy2 = (from.y - cmd.y) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  // Yarıçaplar uç noktaları taşıyamayacak kadar küçükse orantılı olarak büyüt.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }

  const sign = cmd.large !== cmd.sweep ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const co = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (co * (rx * y1p)) / ry
  const cyp = (co * -(ry * x1p)) / rx

  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + cmd.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + cmd.y) / 2

  const angleOf = (ux: number, uy: number): number => Math.atan2(uy, ux)
  const startAngle = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry)
  const endAngle = angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry)
  let delta = endAngle - startAngle
  if (!cmd.sweep && delta > 0) delta -= 2 * Math.PI
  if (cmd.sweep && delta < 0) delta += 2 * Math.PI

  return { cx, cy, startAngle, deltaAngle: delta, rx, ry, rot: phi }
}

function sampleArc(center: ArcCenter, tolerance: number): Point[] {
  const maxR = Math.max(center.rx, center.ry)
  // Sagitta hatasını `tolerance` altında tutacak minimum segment sayısı.
  const perSegment = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / maxR)))
  const steps = Math.max(2, Math.ceil(Math.abs(center.deltaAngle) / Math.max(perSegment, 1e-3)))
  const out: Point[] = []
  const cosR = Math.cos(center.rot)
  const sinR = Math.sin(center.rot)
  for (let i = 1; i <= steps; i++) {
    const a = center.startAngle + (center.deltaAngle * i) / steps
    const px = center.rx * Math.cos(a)
    const py = center.ry * Math.sin(a)
    out.push({ x: center.cx + px * cosR - py * sinR, y: center.cy + px * sinR + py * cosR })
  }
  return out
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): Point[] {
  const chord = distance(p0, p3) + distance(p0, p1) + distance(p1, p2) + distance(p2, p3)
  const steps = Math.max(2, Math.ceil(Math.sqrt(chord / Math.max(tolerance, 1e-4))))
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return out
}

/**
 * Komut listesini poligon zincirlerine çevirir. DXF/CF2 export'u,
 * dizgi hesabı ve alan/uzunluk istatistikleri bunu kullanır.
 */
export function flattenPath(commands: readonly PathCommand[], tolerance = 0.05): Point[][] {
  const chains: Point[][] = []
  let current: Point[] = []
  let cursor: Point = { x: 0, y: 0 }
  let subpathStart: Point = { x: 0, y: 0 }

  const flush = (): void => {
    if (current.length > 1) chains.push(current)
    current = []
  }

  for (const cmd of commands) {
    switch (cmd.c) {
      case 'M':
        flush()
        cursor = { x: cmd.x, y: cmd.y }
        subpathStart = cursor
        current = [cursor]
        break
      case 'L':
        cursor = { x: cmd.x, y: cmd.y }
        current.push(cursor)
        break
      case 'C': {
        const pts = sampleCubic(cursor, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, { x: cmd.x, y: cmd.y }, tolerance)
        current.push(...pts)
        cursor = { x: cmd.x, y: cmd.y }
        break
      }
      case 'A': {
        const center = arcEndpointToCenter(cursor, cmd)
        if (center) current.push(...sampleArc(center, tolerance))
        else current.push({ x: cmd.x, y: cmd.y })
        cursor = { x: cmd.x, y: cmd.y }
        break
      }
      case 'Z':
        current.push({ ...subpathStart })
        cursor = subpathStart
        flush()
        break
    }
  }
  flush()
  return chains
}

export function chainLength(chain: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < chain.length; i++) total += distance(chain[i - 1] as Point, chain[i] as Point)
  return total
}

export function pathLength(commands: readonly PathCommand[], tolerance = 0.05): number {
  return flattenPath(commands, tolerance).reduce((sum, chain) => sum + chainLength(chain), 0)
}

export function transformCommands(commands: readonly PathCommand[], m: Matrix): PathCommand[] {
  // Ölçek izotropik değilse yay parametreleri bozulur; bu durumda önce düzleştir.
  const anisotropic = Math.abs(Math.hypot(m.a, m.b) - Math.hypot(m.c, m.d)) > 1e-6
  const source = anisotropic ? commandsFromChains(flattenPath(commands)) : commands

  return source.map((cmd): PathCommand => {
    switch (cmd.c) {
      case 'M':
      case 'L': {
        const p = applyMatrix(m, { x: cmd.x, y: cmd.y })
        return { c: cmd.c, x: p.x, y: p.y }
      }
      case 'C': {
        const c1 = applyMatrix(m, { x: cmd.x1, y: cmd.y1 })
        const c2 = applyMatrix(m, { x: cmd.x2, y: cmd.y2 })
        const p = applyMatrix(m, { x: cmd.x, y: cmd.y })
        return { c: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y }
      }
      case 'A': {
        const p = applyMatrix(m, { x: cmd.x, y: cmd.y })
        const s = Math.hypot(m.a, m.b)
        const flipped = m.a * m.d - m.b * m.c < 0
        const extraRot = (Math.atan2(m.b, m.a) * 180) / Math.PI
        return {
          c: 'A',
          rx: cmd.rx * s,
          ry: cmd.ry * s,
          rot: cmd.rot + (flipped ? -extraRot : extraRot),
          large: cmd.large,
          sweep: flipped ? !cmd.sweep : cmd.sweep,
          x: p.x,
          y: p.y,
        }
      }
      case 'Z':
        return cmd
    }
  })
}

export function commandsFromChains(chains: readonly (readonly Point[])[]): PathCommand[] {
  const out: PathCommand[] = []
  for (const chain of chains) {
    const first = chain[0]
    if (!first) continue
    out.push({ c: 'M', x: first.x, y: first.y })
    for (let i = 1; i < chain.length; i++) {
      const p = chain[i] as Point
      out.push({ c: 'L', x: p.x, y: p.y })
    }
  }
  return out
}

export function transformPolygon(polygon: readonly Point[], m: Matrix): Point[] {
  return polygon.map((p) => applyMatrix(m, p))
}

export const centroid = (pts: readonly Point[]): Point => {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  const n = Math.max(pts.length, 1)
  return { x: x / n, y: y / n }
}

/**
 * Kırım işareti: çocuk panel eksenin sağındaysa artı açı (valley).
 * foldVertical / foldHorizontal ile aynı kural; eksen yönü ters olsa da düzelir.
 */
export function signedFoldAngle(axis: readonly [Point, Point], childOutline: readonly Point[], degrees: number): number {
  const mag = Math.abs(degrees)
  if (mag < 1e-6) return 0
  const [a, b] = axis
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-8) return degrees
  const c = centroid(childOutline)
  const cr = dx * (c.y - a.y) - dy * (c.x - a.x)
  if (Math.abs(cr) < len * 0.15) return degrees
  return cr < 0 ? mag : -mag
}

/** Sayıyı üretim toleransına yuvarlar (mikron altı gürültüyü temizler). */
export const round = (n: number, decimals = 4): number => {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}
