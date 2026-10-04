import { distance, normalize, sub } from './geometry.ts'
import type { PathCommand, Point } from './types.ts'

/**
 * Yol kurucu. Koordinat sistemi +y yukarı; yay `sweep` bayrağı
 * "saat yönünün tersi" anlamına gelir. SVG/PDF export'u y eksenini
 * çevirdiği için orada sweep de ters çevrilir.
 */
export class PathBuilder {
  private readonly cmds: PathCommand[] = []
  private cursor: Point = { x: 0, y: 0 }
  private start: Point = { x: 0, y: 0 }

  static from(points: readonly Point[], close = true): PathBuilder {
    const b = new PathBuilder()
    points.forEach((p, i) => (i === 0 ? b.moveTo(p) : b.lineTo(p)))
    if (close) b.close()
    return b
  }

  moveTo(p: Point): this {
    this.cmds.push({ c: 'M', x: p.x, y: p.y })
    this.cursor = p
    this.start = p
    return this
  }

  lineTo(p: Point): this {
    this.cmds.push({ c: 'L', x: p.x, y: p.y })
    this.cursor = p
    return this
  }

  xy(x: number, y: number): this {
    return this.lineTo({ x, y })
  }

  by(dx: number, dy: number): this {
    return this.lineTo({ x: this.cursor.x + dx, y: this.cursor.y + dy })
  }

  curveTo(c1: Point, c2: Point, p: Point): this {
    this.cmds.push({ c: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y })
    this.cursor = p
    return this
  }

  arcTo(p: Point, radius: number, counterClockwise: boolean, large = false): this {
    this.cmds.push({ c: 'A', rx: radius, ry: radius, rot: 0, large, sweep: counterClockwise, x: p.x, y: p.y })
    this.cursor = p
    return this
  }

  /**
   * Köşeyi verilen yarıçapla yuvarlar: imleçten `corner`'a gider, oradan
   * `next` yönüne teğet bir yayla döner. Kutu köşelerinde kırılmayı
   * azaltmak ve kalıp bıçağının ömrünü uzatmak için kullanılır.
   */
  filletTo(corner: Point, next: Point, radius: number): this {
    if (radius <= 0) return this.lineTo(corner)

    const v1 = normalize(sub(this.cursor, corner))
    const v2 = normalize(sub(next, corner))
    const cosTheta = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y))
    const theta = Math.acos(cosTheta)
    if (!Number.isFinite(theta) || theta < 1e-6 || Math.abs(theta - Math.PI) < 1e-6) {
      return this.lineTo(corner)
    }

    const maxTangent = Math.min(distance(this.cursor, corner), distance(corner, next))
    let tangent = radius / Math.tan(theta / 2)
    // Kenar teğet uzunluğundan kısaysa yayı küçült; imleç tam teğet noktasındaysa
    // (tangent === maxTangent) kırpma yapılmaz ki 0.02·r'lik kırıntı segment oluşmasın.
    if (tangent > maxTangent + 1e-6) tangent = maxTangent * 0.98
    const effectiveRadius = tangent * Math.tan(theta / 2)
    if (effectiveRadius < 1e-4) return this.lineTo(corner)

    const t1 = { x: corner.x + v1.x * tangent, y: corner.y + v1.y * tangent }
    const t2 = { x: corner.x + v2.x * tangent, y: corner.y + v2.y * tangent }
    // Dönüş yönü: gelen kenar ile giden kenarın çapraz çarpımı.
    const turn = (corner.x - this.cursor.x) * (next.y - corner.y) - (corner.y - this.cursor.y) * (next.x - corner.x)

    if (distance(this.cursor, t1) > 1e-6) this.lineTo(t1)
    return this.arcTo(t2, effectiveRadius, turn > 0)
  }

  /** Köşeyi 45° pahla keser. Toz kapaklarında sürtünmeyi önlemek için standart. */
  chamferTo(corner: Point, next: Point, size: number): this {
    if (size <= 0) return this.lineTo(corner)
    const v1 = normalize(sub(this.cursor, corner))
    const v2 = normalize(sub(next, corner))
    const maxSize = Math.min(distance(this.cursor, corner), distance(corner, next)) * 0.98
    const s = Math.min(size, maxSize)
    this.lineTo({ x: corner.x + v1.x * s, y: corner.y + v1.y * s })
    return this.lineTo({ x: corner.x + v2.x * s, y: corner.y + v2.y * s })
  }

  close(): this {
    this.cmds.push({ c: 'Z' })
    this.cursor = this.start
    return this
  }

  get current(): Point {
    return this.cursor
  }

  build(): PathCommand[] {
    return [...this.cmds]
  }
}

export function polyline(points: readonly Point[], close = false): PathCommand[] {
  return PathBuilder.from(points, close).build()
}

export function segment(a: Point, b: Point): PathCommand[] {
  return [
    { c: 'M', x: a.x, y: a.y },
    { c: 'L', x: b.x, y: b.y },
  ]
}

export function rectPoints(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]
}

export function rectPath(x: number, y: number, width: number, height: number): PathCommand[] {
  return polyline(rectPoints(x, y, width, height), true)
}

export function circlePath(center: Point, radius: number): PathCommand[] {
  const right = { x: center.x + radius, y: center.y }
  const left = { x: center.x - radius, y: center.y }
  return [
    { c: 'M', x: right.x, y: right.y },
    { c: 'A', rx: radius, ry: radius, rot: 0, large: false, sweep: true, x: left.x, y: left.y },
    { c: 'A', rx: radius, ry: radius, rot: 0, large: false, sweep: true, x: right.x, y: right.y },
    { c: 'Z' },
  ]
}

/**
 * Yuvarlatılmış dikdörtgen (stadium / hap formu). Euroslot, kulp oyuğu ve
 * kilit yarığı için kapalı kesim konturu.
 */
export function stadiumPath(center: Point, width: number, height: number): PathCommand[] {
  const w = Math.abs(width)
  const h = Math.abs(height)
  if (w < 1e-6 || h < 1e-6) return []
  const r = Math.min(w, h) / 2
  const cx = center.x
  const cy = center.y
  if (w >= h) {
    const left = cx - w / 2 + r
    const right = cx + w / 2 - r
    const top = cy + h / 2
    const bot = cy - h / 2
    return [
      { c: 'M', x: left, y: bot },
      { c: 'L', x: right, y: bot },
      { c: 'A', rx: r, ry: r, rot: 0, large: false, sweep: true, x: right, y: top },
      { c: 'L', x: left, y: top },
      { c: 'A', rx: r, ry: r, rot: 0, large: false, sweep: true, x: left, y: bot },
      { c: 'Z' },
    ]
  }
  const top = cy + h / 2 - r
  const bot = cy - h / 2 + r
  const left = cx - w / 2
  const right = cx + w / 2
  return [
    { c: 'M', x: left, y: bot },
    { c: 'A', rx: r, ry: r, rot: 0, large: false, sweep: true, x: right, y: bot },
    { c: 'L', x: right, y: top },
    { c: 'A', rx: r, ry: r, rot: 0, large: false, sweep: true, x: left, y: top },
    { c: 'L', x: left, y: bot },
    { c: 'Z' },
  ]
}

/**
 * Yarım daire oyuk (başparmak çentiği). `center` çentiğin oturduğu kenar
 * üzerindeki orta nokta, `outward` oyuğun açıldığı yön.
 */
export function thumbNotch(center: Point, radius: number, outward: Point): PathCommand[] {
  const dir = normalize(outward)
  const along = { x: -dir.y, y: dir.x }
  const a = { x: center.x - along.x * radius, y: center.y - along.y * radius }
  const b = { x: center.x + along.x * radius, y: center.y + along.y * radius }
  const turn = along.x * dir.y - along.y * dir.x
  return [
    { c: 'M', x: a.x, y: a.y },
    { c: 'A', rx: radius, ry: radius, rot: 0, large: false, sweep: turn < 0, x: b.x, y: b.y },
  ]
}
