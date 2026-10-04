import { DielineBuilder, PathBuilder, boundsOfPoints, rectPath, rectPoints, segment, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical, glueFlapProfile } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Çokgen ve açılı kutular (DCT polygonal-boxes / angled-boxes): altıgen prizma
 * kutular (dilli çokgen kapak, petal / twist kapak, çokgen crash-lock taban),
 * üçgen prizma kutu, iki parçalı altıgen / sekizgen tepsi + kapak, konik
 * (kesik piramit) dört yüzlü kutular ve altıgen piramit külah.
 *
 * Yüzler eğik kenarlarla zincirlendiğinde (konik / piramit) her yüz yerel
 * koordinatta kurulur ve katı dönüşümle bir önceki yüzün kenarına oturtulur.
 */

type Pt = Point
type Kind = 'prism' | 'tri-prism' | 'poly-tray-set' | 'frustum' | 'pyramid'
type PrismEnd = 'tuck' | 'petal' | 'crash' | 'none'

export interface PolySpec {
  id: string
  code: string
  standard: 'ECMA' | 'CUSTOM'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  kind: Kind
  sides?: number
  top?: PrismEnd | 'flaps'
  bottom?: PrismEnd | 'flaps'
  dims?: { a: number; b?: number; c?: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })

interface Xf {
  c: number
  s: number
  tx: number
  ty: number
}
const ID: Xf = { c: 1, s: 0, tx: 0, ty: 0 }
const apply = (t: Xf, p: Pt): Pt => ({ x: t.c * p.x - t.s * p.y + t.tx, y: t.s * p.x + t.c * p.y + t.ty })
const applyAll = (t: Xf, pts: Pt[]): Pt[] => pts.map((p) => apply(t, p))
/** Yerel (la→lb) kenarını dünya (wa→wb) kenarına oturtan katı dönüşüm. */
function xfFromEdge(la: Pt, lb: Pt, wa: Pt, wb: Pt): Xf {
  const th = Math.atan2(wb.y - wa.y, wb.x - wa.x) - Math.atan2(lb.y - la.y, lb.x - la.x)
  const c = Math.cos(th)
  const s = Math.sin(th)
  return { c, s, tx: wa.x - (c * la.x - s * la.y), ty: wa.y - (s * la.x + c * la.y) }
}

const meta = (spec: PolySpec, caliper: number, glue: boolean) => ({
  name: spec.name,
  ...(spec.standard === 'ECMA' ? { ecma: spec.code } : {}),
  caliper,
  glueFlapSide: glue ? ('right' as const) : ('none' as const),
})

const bleedGuide = (b: DielineBuilder, pts: Pt[], bleed: number): void => {
  if (bleed <= 0) return
  const r = boundsOfPoints(pts)
  b.guide('bleed', rectPath(r.x - bleed, r.y - bleed, r.width + 2 * bleed, r.height + 2 * bleed), 'taşma payı')
}

/** Kenar (a→b) üzerinde, kenarın "dış" tarafına (ref noktasından uzağa) düzgün n-gen. */
function regularPolygonOnEdge(a: Pt, bb: Pt, n: number, awayFrom: Pt): Pt[] {
  const s = Math.hypot(bb.x - a.x, bb.y - a.y)
  const R = s / (2 * Math.sin(Math.PI / n))
  const ap = s / (2 * Math.tan(Math.PI / n))
  const mid = { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 }
  const t = { x: (bb.x - a.x) / s, y: (bb.y - a.y) / s }
  let nrm = { x: -t.y, y: t.x }
  if ((mid.x - awayFrom.x) * nrm.x + (mid.y - awayFrom.y) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y }
  const center = { x: mid.x + nrm.x * ap, y: mid.y + nrm.y * ap }
  const a0 = Math.atan2(a.y - center.y, a.x - center.x)
  const a1 = Math.atan2(bb.y - center.y, bb.x - center.x)
  let d = a1 - a0
  while (d <= -Math.PI) d += 2 * Math.PI
  while (d > Math.PI) d -= 2 * Math.PI
  const dir = d > 0 ? 1 : -1
  const out: Pt[] = [a]
  for (let k = 1; k < n; k++) {
    const ang = a0 + dir * (2 * Math.PI * k) / n
    out.push({ x: center.x + R * Math.cos(ang), y: center.y + R * Math.sin(ang) })
  }
  // out[0]=a, out[1]=b, ..., dolaşım: kenardan başlayıp çokgeni turlar
  return out
}

/** Yerel dil profili (kenar x1→x2, y'de, dir yönünde) — dönüşüm uygulanabilir nokta listesi. */
const tuckPts = (x1: number, x2: number, y: number, dir: 1 | -1, depth: number, cl: number): Pt[] => [
  { x: x1, y },
  { x: x1 + cl, y: y + dir * Math.min(3, depth * 0.3) },
  { x: x1 + cl + 2, y: y + dir * depth },
  { x: x2 - cl - 2, y: y + dir * depth },
  { x: x2 - cl, y: y + dir * Math.min(3, depth * 0.3) },
  { x: x2, y },
]
const dustPts = (x1: number, x2: number, y: number, dir: 1 | -1, depth: number, g: number): Pt[] => [
  { x: x1 + g, y },
  { x: x1 + g + depth * 0.6, y: y + dir * depth },
  { x: x2 - g - depth * 0.6, y: y + dir * depth },
  { x: x2 - g, y },
]

// ---------------------------------------------------------------------------
// 1) Çokgen prizma kutu (altıgen): girth + yapıştırma; uçlar dilli kapak /
//    petal / crash-lock
// ---------------------------------------------------------------------------

function buildPrism(spec: PolySpec, params: Record<string, ParamValue>): Dieline {
  const n = spec.sides ?? 6
  const s = num(params, 'length')
  const H = num(params, 'height')
  const glueW = num(params, 'glueFlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, glueW > 0), params)
  const g = Math.max(0.8, caliper)
  const ap = s / (2 * Math.tan(Math.PI / n)) // apotem
  const tuckDepth = Math.min(16, s * 0.4)
  const dustDepth = Math.min(20, s * 0.4)
  const petalDepth = Math.min(s * 0.8, ap * 1.1)
  const foldDeg = 360 / n
  const lidPanel = 1
  const oppPanel = (lidPanel + n / 2) % n
  const x1 = (i: number) => i * s
  const x2 = (i: number) => (i + 1) * s
  const xEnd = n * s

  const endShape = (i: number, style: PrismEnd | 'flaps' | undefined, y: number, dir: 1 | -1): Pt[] => {
    const mid = { x: (x1(i) + x2(i)) / 2, y: y - dir * H }
    if (style === 'tuck') {
      if (i === lidPanel) {
        const hex = regularPolygonOnEdge({ x: x1(i), y }, { x: x2(i), y }, n, mid)
        // hex[0]=x1 kenarı, hex[1]=x2. Karşı kenar: hex[n/2] → hex[n/2+1] (n çift)
        return hex
      }
      if (i === oppPanel) return dustPts(x1(i), x2(i), y, dir, dustDepth, g)
      return []
    }
    if (style === 'petal') {
      const pts: Pt[] = []
      const w = s - 2 * g
      for (let k = 0; k <= 10; k++) {
        const t = k / 10
        const xx = x1(i) + g + w * t
        const yy = y + dir * petalDepth * Math.sin(Math.PI * t) ** 0.7
        pts.push({ x: xx, y: yy })
      }
      return pts
    }
    if (style === 'crash') {
      if (i % 2 === 0) return [{ x: x1(i) + g, y }, { x: x1(i) + g + s * 0.22, y: y + dir * ap }, { x: x2(i) - g - s * 0.22, y: y + dir * ap }, { x: x2(i) - g, y }]
      return [{ x: x1(i) + g, y }, { x: x1(i) + s * 0.35, y: y + dir * ap * 0.62 }, { x: x1(i) + s * 0.5, y: y + dir * ap * 0.5 }, { x: x1(i) + s * 0.65, y: y + dir * ap * 0.62 }, { x: x2(i) - g, y }]
    }
    return []
  }

  const hex0 = (hex: Pt[]): Pt => hex[0] as Pt
  /** Çokgen kapağı verilen köşe sırasıyla dolaş; karşı kenarda dil profilini araya sok. */
  const walkLid = (path: PathBuilder, seq: Pt[], hex: Pt[], sides: number, dir: 1 | -1) => {
    const ea = hex[sides / 2] as Pt
    const eb = hex[(sides / 2 + 1) % sides] as Pt
    for (let k = 1; k < seq.length; k++) {
      const p = seq[k] as Pt
      const prev = seq[k - 1] as Pt
      if ((prev === ea && p === eb) || (prev === eb && p === ea)) {
        const tp = tuckPts(Math.min(ea.x, eb.x), Math.max(ea.x, eb.x), ea.y, dir, tuckDepth, g)
        for (const q of (prev.x < p.x ? tp : [...tp].reverse()).slice(1)) path.lineTo(q)
      } else path.lineTo(p)
    }
  }

  // Dış hat
  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  // Alt kenar soldan sağa
  for (let i = 0; i < n; i++) {
    const shape = endShape(i, spec.bottom, 0, -1)
    if (spec.bottom === 'tuck' && i === lidPanel) {
      // x1 köşesinden (hex[0]) çokgeni ters yönde turlayıp x2 köşesine (hex[1]) gel
      walkLid(pb, [hex0(shape), ...shape.slice(1).reverse()], shape, n, -1)
    } else for (const p of shape) pb.lineTo(p)
    pb.lineTo({ x: x2(i), y: 0 })
  }
  // Yapıştırma payı
  const glue = glueW > 0 ? glueFlapProfile(xEnd, xEnd + glueW, 0, H, Math.min(6, glueW * 0.6)) : [{ x: xEnd, y: 0 }, { x: xEnd, y: H }]
  for (const p of glue) pb.lineTo(p)
  // Üst kenar sağdan sola
  for (let i = n - 1; i >= 0; i--) {
    const shape = endShape(i, spec.top, H, 1)
    if (spec.top === 'tuck' && i === lidPanel) {
      // x2 köşesinden (hex[1]) çokgen üzerinden x1 köşesine (hex[0])
      walkLid(pb, [...shape.slice(1), hex0(shape)], shape, n, 1)
    } else for (const p of [...shape].reverse()) pb.lineTo(p)
    pb.lineTo({ x: x1(i), y: H })
  }
  pb.close()
  b.cut(pb.build(), 'kutu çevresi')

  // Paneller
  for (let i = 0; i < n; i++) {
    const id = `wall-${i + 1}`
    b.panel({ id, name: id, label: T(`Yüz ${i + 1}`, `Face ${i + 1}`), outline: rectPoints(x1(i), 0, s, H), role: 'wall' })
    if (i === 0) b.root(id)
    else b.fold({ parent: `wall-${i}`, child: id, ...foldVertical(x1(i), 0, H, 'right', foldDeg) })
  }
  if (glueW > 0) {
    b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma payı', 'Glue flap'), outline: glue, role: 'glue', printable: false })
    b.fold({ parent: `wall-${n}`, child: 'glue', ...foldVertical(xEnd, 0, H, 'right', foldDeg) })
    b.guide('glue', rectPath(0, 0, Math.min(glueW, s * 0.4), H), 'yapıştırma alanı')
  }
  const endPanels = (style: PrismEnd | 'flaps' | undefined, y: number, dir: 1 | -1, tag: string) => {
    const side: 'above' | 'below' = dir === 1 ? 'above' : 'below'
    for (let i = 0; i < n; i++) {
      const shape = endShape(i, style, y, dir)
      if (shape.length === 0) continue
      const id = `${tag}-${i + 1}`
      if (style === 'tuck' && i === lidPanel) {
        b.panel({ id, name: id, label: T('Çokgen kapak', 'Polygon lid'), outline: shape, role: 'lid' })
        b.fold({ parent: `wall-${i + 1}`, child: id, ...foldHorizontal(y, x1(i), x2(i), side) })
        const ea = shape[n / 2] as Pt
        const eb = shape[(n / 2 + 1) % n] as Pt
        const tp = tuckPts(Math.min(ea.x, eb.x), Math.max(ea.x, eb.x), ea.y, dir, tuckDepth, g)
        b.panel({ id: `${id}-tuck`, name: `${id}-tuck`, label: T('Dil', 'Tuck'), outline: tp, role: 'lock', printable: false })
        b.fold({ parent: id, child: `${id}-tuck`, ...foldHorizontal(ea.y, Math.min(ea.x, eb.x), Math.max(ea.x, eb.x), side) })
        // Karşı yüzün üst/alt kenarında dil yarığı
        continue
      }
      const label = style === 'petal' ? T('Petal', 'Petal') : style === 'crash' ? T('Kilit kanadı', 'Lock flap') : T('Toz kapağı', 'Dust flap')
      const outline = style === 'petal' ? [{ x: x1(i) + g, y }, ...shape.slice(1, -1), { x: x2(i) - g, y }] : shape
      b.panel({ id, name: id, label, outline, role: style === 'crash' ? 'lock' : 'flap', printable: style === 'petal' })
      b.fold({ parent: `wall-${i + 1}`, child: id, ...foldHorizontal(y, x1(i) + g, x2(i) - g, side) })
      if (style === 'petal') {
        // Twist kapak: köşegen perforasyon — petal bükülerek komşusunun altına girer
        b.perf(segment({ x: x1(i) + g, y }, { x: x2(i) - g, y: y + dir * petalDepth * 0.75 }), 'twist perforasyonu')
      }
    }
  }
  endPanels(spec.top, H, 1, 'top')
  endPanels(spec.bottom, 0, -1, 'bottom')

  const all: Pt[] = [{ x: 0, y: 0 }, { x: xEnd + glueW, y: H }]
  for (const p of b.build().panels) all.push(...p.outline)
  bleedGuide(b, all, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 2) Üçgen prizma kutu — üç yüz + yapıştırma; iki uçta üçgen kapak + toz kanatları
// ---------------------------------------------------------------------------

function buildTriPrism(spec: PolySpec, params: Record<string, ParamValue>): Dieline {
  const s = num(params, 'width') // üçgen kenarı
  const L = num(params, 'length') // prizma boyu
  const glueW = num(params, 'glueFlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, glueW > 0), params)
  const g = Math.max(0.8, caliper)
  const hTri = (s * Math.sqrt(3)) / 2
  const dust = Math.min(hTri * 0.45, 22)
  const xEnd = 3 * s

  const triLid = (y: number, dir: 1 | -1): Pt[] => [{ x: s, y }, { x: 1.5 * s, y: y + dir * hTri }, { x: 2 * s, y }]
  const triDust = (i: number, y: number, dir: 1 | -1): Pt[] => {
    const xa = i * s + g
    const xb = (i + 1) * s - g
    // Kırpılmış üçgen: kenar ortasına doğru daralır
    const k = dust / hTri
    return [{ x: xa, y }, { x: xa + (s / 2) * k, y: y + dir * dust }, { x: xb - (s / 2) * k, y: y + dir * dust }, { x: xb, y }]
  }
  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  for (let i = 0; i < 3; i++) {
    const shape = i === 1 ? triLid(0, -1) : triDust(i, 0, -1)
    for (const p of shape) pb.lineTo(p)
    pb.lineTo({ x: (i + 1) * s, y: 0 })
  }
  const glue = glueW > 0 ? glueFlapProfile(xEnd, xEnd + glueW, 0, L, Math.min(6, glueW * 0.6)) : [{ x: xEnd, y: 0 }, { x: xEnd, y: L }]
  for (const p of glue) pb.lineTo(p)
  for (let i = 2; i >= 0; i--) {
    const shape = i === 1 ? triLid(L, 1) : triDust(i, L, 1)
    for (const p of [...shape].reverse()) pb.lineTo(p)
    pb.lineTo({ x: i * s, y: L })
  }
  pb.close()
  b.cut(pb.build(), 'kutu çevresi')
  for (let i = 0; i < 3; i++) {
    const id = `wall-${i + 1}`
    b.panel({ id, name: id, label: T(`Yüz ${i + 1}`, `Face ${i + 1}`), outline: rectPoints(i * s, 0, s, L), role: 'wall' })
    if (i === 0) b.root(id)
    else b.fold({ parent: `wall-${i}`, child: id, ...foldVertical(i * s, 0, L, 'right', 120) })
    for (const [y, dir, tag] of [[0, -1, 'bottom'], [L, 1, 'top']] as [number, 1 | -1, string][]) {
      const side: 'above' | 'below' = dir === 1 ? 'above' : 'below'
      const fid = `${tag}-${i + 1}`
      if (i === 1) {
        b.panel({ id: fid, name: fid, label: T('Üçgen kapak', 'Triangular lid'), outline: triLid(y, dir), role: 'lid' })
        b.fold({ parent: id, child: fid, ...foldHorizontal(y, s, 2 * s, side) })
      } else {
        b.panel({ id: fid, name: fid, label: T('Toz kanadı', 'Dust flap'), outline: triDust(i, y, dir), role: 'flap', printable: false })
        b.fold({ parent: id, child: fid, ...foldHorizontal(y, i * s + g, (i + 1) * s - g, side) })
      }
    }
  }
  if (glueW > 0) {
    b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma payı', 'Glue flap'), outline: glue, role: 'glue', printable: false })
    b.fold({ parent: 'wall-3', child: 'glue', ...foldVertical(xEnd, 0, L, 'right', 120) })
  }
  bleedGuide(b, [{ x: 0, y: -hTri }, { x: xEnd + glueW, y: L + hTri }], bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 3) İki parçalı çokgen tepsi + kapak (altıgen / sekizgen)
// ---------------------------------------------------------------------------

function polyTrayInto(b: DielineBuilder, prefix: string, label: I18nText, n: number, F: number, H: number, cx: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const R = F / (2 * Math.cos(Math.PI / n)) // köşe yarıçapı (F = düzlemler arası)
  const verts: Pt[] = []
  for (let i = 0; i < n; i++) {
    // Köşeler π/2 ± π/n etrafında → üst ve alt kenar eksene paralel
    const a = Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n
    verts.push({ x: cx + R * Math.cos(a), y: R * Math.sin(a) })
  }
  const inset = H * Math.tan(Math.PI / n)
  const tabW = Math.min(H * 0.5, 12)
  const pb = new PathBuilder()
  pb.moveTo(verts[0] as Pt)
  const walls: { id: string; outline: Pt[]; axis: [Pt, Pt]; tab: Pt[]; tabAxis: [Pt, Pt] }[] = []
  for (let i = 0; i < n; i++) {
    const a = verts[i] as Pt
    const c = verts[(i + 1) % n] as Pt
    const len = Math.hypot(c.x - a.x, c.y - a.y)
    const t = { x: (c.x - a.x) / len, y: (c.y - a.y) / len }
    let nrm = { x: -t.y, y: t.x }
    const mid = { x: (a.x + c.x) / 2 - cx, y: (a.y + c.y) / 2 }
    if (nrm.x * mid.x + nrm.y * mid.y < 0) nrm = { x: -nrm.x, y: -nrm.y }
    const miter = Math.min(inset, len * 0.45)
    const outerA = { x: a.x + nrm.x * H + t.x * miter, y: a.y + nrm.y * H + t.y * miter }
    const outerB = { x: c.x + nrm.x * H - t.x * miter, y: c.y + nrm.y * H - t.y * miter }
    const p = { x: outerB.x + t.x * tabW, y: outerB.y + t.y * tabW }
    const m = { x: c.x + nrm.x * H * 0.45 + t.x * tabW * 0.5, y: c.y + nrm.y * H * 0.45 + t.y * tabW * 0.5 }
    pb.lineTo(outerA).lineTo(outerB).lineTo(p).lineTo(m).lineTo(c)
    walls.push({ id: `${prefix}wall-${i + 1}`, outline: [a, c, outerB, outerA], axis: [a, c], tab: [c, outerB, p, m], tabAxis: [c, outerB] })
  }
  pb.close()
  b.cut(pb.build(), `${label.tr} çevresi`)
  b.panel({ id: `${prefix}base`, name: `${prefix}base`, label, outline: verts, role: 'bottom' })
  for (const w of walls) {
    b.panel({ id: w.id, name: w.id, label: T('Duvar', 'Wall'), outline: w.outline, role: 'wall' })
    b.fold({ parent: `${prefix}base`, child: w.id, axis: w.axis, angle: 90 })
    b.panel({ id: `${w.id}-tab`, name: `${w.id}-tab`, label: T('Yapıştırma kulağı', 'Glue tab'), outline: w.tab, role: 'glue', printable: false })
    b.fold({ parent: w.id, child: `${w.id}-tab`, axis: w.tabAxis, angle: 90 })
  }
  return { minX: cx - R - H - tabW, maxX: cx + R + H + tabW, minY: -R - H - tabW, maxY: R + H + tabW }
}

function buildPolyTraySet(spec: PolySpec, params: Record<string, ParamValue>): Dieline {
  const n = spec.sides ?? 8
  const F = num(params, 'width')
  const Hb = num(params, 'height')
  const Hl = num(params, 'lidHeight')
  const clearance = num(params, 'fitClearance')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const Fl = F + 2 * caliper + 2 * clearance
  const Rb = F / (2 * Math.cos(Math.PI / n))
  const Rl = Fl / (2 * Math.cos(Math.PI / n))
  const gap = 10
  const cxLid = Rb + Hb + 12 + gap + Rl + Hl + 12
  const e1 = polyTrayInto(b, 'base-', T('Tepsi tabanı', 'Tray base'), n, F, Hb, 0)
  b.root('base-base')
  const e2 = polyTrayInto(b, 'lid-', T('Kapak tabanı', 'Lid top'), n, Fl, Hl, cxLid)
  b.fold({ parent: 'base-base', child: 'lid-base', axis: [{ x: 0, y: 0 }, { x: 1, y: 0 }], angle: 0, draw: false })
  bleedGuide(b, [{ x: e1.minX, y: Math.min(e1.minY, e2.minY) }, { x: e2.maxX, y: Math.max(e1.maxY, e2.maxY) }], bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 4) Kesik piramit (konik dört yüzlü) kutu — yüzler eğik kenarlardan zincirlenir
// ---------------------------------------------------------------------------

function buildFrustum(spec: PolySpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const w = num(params, 'width')
  const c = num(params, 'height')
  const h = Math.max(0.5, num(params, 'splay'))
  const glueW = num(params, 'glueFlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, glueW > 0), params)
  const g = Math.max(0.8, caliper)
  const L = Math.hypot(h, c) // yüzün düz yüksekliği
  const sinPhi = h / L
  const foldDeg = (Math.acos(sinPhi * sinPhi) * 180) / Math.PI
  const widths = [a, w, a, w]
  const tuckDepth = Math.min(16, Math.min(a, w) * 0.35)

  interface Face {
    xf: Xf
    wBot: number
    wTop: number
    bl: Pt
    br: Pt
    tl: Pt
    tr: Pt
  }
  const faces: Face[] = []
  for (let i = 0; i < 4; i++) {
    const wb = widths[i] as number
    const wt = wb + 2 * h
    const lbl = { x: -wb / 2, y: 0 }
    const ltl = { x: -wt / 2, y: L }
    let xf: Xf = ID
    if (i === 0) xf = { c: 1, s: 0, tx: wb / 2, ty: 0 }
    else {
      const prev = faces[i - 1] as Face
      xf = xfFromEdge(lbl, ltl, prev.br, prev.tr)
    }
    faces.push({ xf, wBot: wb, wTop: wt, bl: apply(xf, lbl), br: apply(xf, { x: wb / 2, y: 0 }), tl: apply(xf, ltl), tr: apply(xf, { x: wt / 2, y: L }) })
  }
  const local = (f: Face, pts: Pt[]) => applyAll(f.xf, pts)

  // Uç kanatları (yerel)
  const topStyle = spec.top ?? 'flaps'
  const botStyle = spec.bottom ?? 'flaps'
  const flapLocal = (f: Face, i: number, where: 'top' | 'bottom'): { pts: Pt[]; role: 'flap' | 'lid' | 'lock'; label: I18nText; tuck?: Pt[] } | null => {
    const y = where === 'top' ? L : 0
    const dir: 1 | -1 = where === 'top' ? 1 : -1
    const wEdge = where === 'top' ? f.wTop : f.wBot
    const oppW = (where === 'top' ? (widths[(i + 1) % 4] as number) + 2 * h : (widths[(i + 1) % 4] as number)) // komşu yüz genişliği = kapatılacak açıklığın diğer kenarı
    const x1 = -wEdge / 2
    const x2 = wEdge / 2
    const style = where === 'top' ? topStyle : botStyle
    if (style === 'flaps') {
      const d = oppW / 2 - g
      const ins = Math.min(6, d * 0.2) + h * 0.5
      return { pts: [{ x: x1 + g, y }, { x: x1 + g + ins, y: y + dir * d }, { x: x2 - g - ins, y: y + dir * d }, { x: x2 - g, y }], role: 'flap', label: T('Kapama kanadı', 'Closing flap') }
    }
    if (style === 'tuck') {
      if (i === 0) {
        const d = oppW
        return {
          pts: [{ x: x1, y }, { x: x1, y: y + dir * d }, { x: x2, y: y + dir * d }, { x: x2, y }],
          role: 'lid',
          label: T('Kapak', 'Lid'),
          tuck: tuckPts(x1 + g, x2 - g, y + dir * d, dir, tuckDepth, g),
        }
      }
      if (i === 1 || i === 3) {
        const d = Math.min(22, oppW * 0.4)
        return { pts: dustPts(x1, x2, y, dir, d, g), role: 'flap', label: T('Toz kapağı', 'Dust flap') }
      }
      return null
    }
    return null
  }

  // Dış hat: alt kenarlar (sol→sağ), yapıştırma, üst kenarlar (sağ→sol), sol kenar
  const pb = new PathBuilder()
  pb.moveTo((faces[0] as Face).bl)
  for (let i = 0; i < 4; i++) {
    const f = faces[i] as Face
    const fl = flapLocal(f, i, 'bottom')
    if (fl) {
      const pts = local(f, fl.pts)
      const seq = fl.tuck ? [pts[0] as Pt, pts[1] as Pt, ...local(f, fl.tuck.slice(1, -1)), pts[2] as Pt, pts[3] as Pt] : pts
      for (const p of seq) pb.lineTo(p)
    }
    pb.lineTo(f.br)
  }
  const last = faces[3] as Face
  // Yapıştırma payı: son yüzün sağ eğik kenarı dışına
  const ex = last.tr.x - last.br.x
  const ey = last.tr.y - last.br.y
  const el = Math.hypot(ex, ey)
  let u = { x: ey / el, y: -ex / el }
  const fc = { x: (last.bl.x + last.br.x + last.tl.x + last.tr.x) / 4, y: (last.bl.y + last.br.y + last.tl.y + last.tr.y) / 4 }
  if ((last.br.x - fc.x) * u.x + (last.br.y - fc.y) * u.y < 0) u = { x: -u.x, y: -u.y }
  const gluePts: Pt[] = glueW > 0 ? [last.br, { x: last.br.x + u.x * glueW + (ex / el) * 3, y: last.br.y + u.y * glueW + (ey / el) * 3 }, { x: last.tr.x + u.x * glueW - (ex / el) * 3, y: last.tr.y + u.y * glueW - (ey / el) * 3 }, last.tr] : [last.br, last.tr]
  for (const p of gluePts.slice(1)) pb.lineTo(p)
  for (let i = 3; i >= 0; i--) {
    const f = faces[i] as Face
    const fl = flapLocal(f, i, 'top')
    if (fl) {
      const pts = local(f, fl.pts)
      const seq = fl.tuck ? [pts[0] as Pt, pts[1] as Pt, ...local(f, fl.tuck.slice(1, -1)), pts[2] as Pt, pts[3] as Pt] : pts
      for (const p of [...seq].reverse()) pb.lineTo(p)
    }
    pb.lineTo(f.tl)
  }
  pb.close()
  b.cut(pb.build(), 'kutu çevresi')

  // Paneller
  faces.forEach((f, i) => {
    const id = `face-${i + 1}`
    b.panel({ id, name: id, label: T(`Yüz ${i + 1}`, `Face ${i + 1}`), outline: [f.bl, f.br, f.tr, f.tl], role: 'wall' })
    if (i === 0) b.root(id)
    else b.fold({ parent: `face-${i}`, child: id, axis: [f.bl, f.tl], angle: foldDeg })
    for (const where of ['top', 'bottom'] as const) {
      const fl = flapLocal(f, i, where)
      if (!fl) continue
      const fid = `${where}-${i + 1}`
      const pts = local(f, fl.pts)
      b.panel({ id: fid, name: fid, label: fl.label, outline: pts, role: fl.role, printable: fl.role !== 'flap' })
      b.fold({ parent: id, child: fid, axis: [pts[0] as Pt, pts[pts.length - 1] as Pt], angle: 90 })
      if (fl.tuck) {
        const tp = local(f, fl.tuck)
        b.panel({ id: `${fid}-tuck`, name: `${fid}-tuck`, label: T('Dil', 'Tuck'), outline: tp, role: 'lock', printable: false })
        b.fold({ parent: fid, child: `${fid}-tuck`, axis: [tp[0] as Pt, tp[tp.length - 1] as Pt], angle: 90 })
      }
    }
  })
  if (glueW > 0) {
    b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma payı', 'Glue flap'), outline: gluePts, role: 'glue', printable: false })
    b.fold({ parent: 'face-4', child: 'glue', axis: [last.br, last.tr], angle: foldDeg })
  }
  const all: Pt[] = []
  for (const p of b.build().panels) all.push(...p.outline)
  bleedGuide(b, all, bleed)
  if (h > Math.min(a, w) * 0.5) b.warn('splay-too-large', 'warning', 'Konik açılma taban ölçüsüne göre çok büyük; kapaklar örtüşmez.', 'Splay is too large for the base; the flaps will not overlap.')
  return b.build()
}

// ---------------------------------------------------------------------------
// 5) Altıgen piramit külah — tepe noktasında birleşen üçgen yüzler, altıgen dilli kapak
// ---------------------------------------------------------------------------

function buildPyramid(spec: PolySpec, params: Record<string, ParamValue>): Dieline {
  const n = spec.sides ?? 6
  const F = num(params, 'length') // ağız düzlemler arası
  const slant = num(params, 'width') // eğik kenar (tepe → ağız)
  const glueW = num(params, 'glueFlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, glueW > 0), params)
  const g = Math.max(0.8, caliper)
  const s = F * Math.tan(Math.PI / n) // ağız kenarı
  const R = s / (2 * Math.sin(Math.PI / n))
  if (slant <= R * 1.02) {
    b.warn('slant-too-short', 'error', 'Eğik kenar ağız yarıçapından kısa; piramit kapanmaz.', 'Slant is shorter than the opening radius; the pyramid cannot close.')
  }
  const hh = Math.sqrt(Math.max(1e-6, slant * slant - R * R))
  // 3B yüz normalleri → komşu yüzler arası kırım açısı
  const v3 = (k: number) => ({ x: R * Math.cos((2 * Math.PI * k) / n), y: R * Math.sin((2 * Math.PI * k) / n), z: 0 })
  const normal = (k: number) => {
    const p = v3(k)
    const q = v3(k + 1)
    const ax = p.x
    const ay = p.y
    const az = -hh
    const bx = q.x
    const by = q.y
    const bz = -hh
    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx
    const l = Math.hypot(nx, ny, nz)
    return { x: nx / l, y: ny / l, z: nz / l }
  }
  const n0 = normal(0)
  const n1 = normal(1)
  const foldDeg = (Math.acos(Math.max(-1, Math.min(1, n0.x * n1.x + n0.y * n1.y + n0.z * n1.z))) * 180) / Math.PI

  const delta = 2 * Math.asin(Math.min(0.999, s / (2 * slant)))
  const O = { x: 0, y: 0 }
  const P = (k: number): Pt => ({ x: slant * Math.cos(Math.PI / 2 - (n / 2) * delta + k * delta), y: slant * Math.sin(Math.PI / 2 - (n / 2) * delta + k * delta) })
  const lidFace = Math.floor(n / 2) - 1
  const dustDepth = Math.min(16, s * 0.35)
  const tuckDepth = Math.min(16, s * 0.4)

  // Kapak altıgeni: lidFace ağız kenarında dışa doğru
  const lidA = P(lidFace)
  const lidB = P(lidFace + 1)
  const hex = regularPolygonOnEdge(lidA, lidB, n, O)
  const ea = hex[n / 2] as Pt
  const eb = hex[(n / 2 + 1) % n] as Pt
  const tuckXf = xfFromEdge({ x: 0, y: 0 }, { x: s, y: 0 }, ea, eb)
  // Dil: kenarın dış tarafına (O'dan uzağa). Yerel +y yönü, dış mı kontrol et
  const probe = apply(tuckXf, { x: s / 2, y: 1 })
  const emid = { x: (ea.x + eb.x) / 2, y: (ea.y + eb.y) / 2 }
  const dirOut: 1 | -1 = Math.hypot(probe.x - O.x, probe.y - O.y) > Math.hypot(emid.x - O.x, emid.y - O.y) ? 1 : -1
  const tuck = applyAll(tuckXf, tuckPts(g, s - g, 0, dirOut, tuckDepth, g))

  const dustOn = (k: number): Pt[] => {
    const a = P(k)
    const c = P(k + 1)
    const xf = xfFromEdge({ x: 0, y: 0 }, { x: s, y: 0 }, a, c)
    const pr = apply(xf, { x: s / 2, y: 1 })
    const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }
    const d: 1 | -1 = Math.hypot(pr.x, pr.y) > Math.hypot(mid.x, mid.y) ? 1 : -1
    return applyAll(xf, dustPts(0, s, 0, d, dustDepth, g))
  }

  // Dış hat: O → P0 → ağız kenarları (kapak / toz kanatları) → Pn → yapıştırma → O
  const pb = new PathBuilder()
  pb.moveTo(O)
  pb.lineTo(P(0))
  for (let k = 0; k < n; k++) {
    if (k === lidFace) {
      // hex[0]=lidA, hex[1]=lidB; ters yönde (lidA → ... → lidB) dolaş: hex[0], hex[n-1], ..., hex[1]
      const seq = [hex[0] as Pt, ...hex.slice(1).reverse()]
      for (let i = 1; i < seq.length; i++) {
        const prev = seq[i - 1] as Pt
        const p = seq[i] as Pt
        if ((prev === ea && p === eb) || (prev === eb && p === ea)) {
          const tp = prev === ea ? tuck : [...tuck].reverse()
          for (const q of tp.slice(1)) pb.lineTo(q)
        } else pb.lineTo(p)
      }
    } else if (k === lidFace - 1 || k === lidFace + 1) {
      for (const q of dustOn(k)) pb.lineTo(q)
      pb.lineTo(P(k + 1))
    } else pb.lineTo(P(k + 1))
  }
  const Pn = P(n)
  const el = Math.hypot(Pn.x, Pn.y)
  let u = { x: Pn.y / el, y: -Pn.x / el }
  const mid = { x: (P(n - 1).x + Pn.x) / 2, y: (P(n - 1).y + Pn.y) / 2 }
  if ((Pn.x - mid.x) * u.x + (Pn.y - mid.y) * u.y < 0) u = { x: -u.x, y: -u.y }
  const glue: Pt[] = glueW > 0 ? [Pn, { x: Pn.x + u.x * glueW - (Pn.x / el) * 3, y: Pn.y + u.y * glueW - (Pn.y / el) * 3 }, { x: u.x * glueW * 0.3 + (Pn.x / el) * glueW * 0.8, y: u.y * glueW * 0.3 + (Pn.y / el) * glueW * 0.8 }, O] : [Pn, O]
  for (const p of glue.slice(1, -1)) pb.lineTo(p)
  pb.close()
  b.cut(pb.build(), 'külah çevresi')

  for (let k = 0; k < n; k++) {
    const id = `face-${k + 1}`
    b.panel({ id, name: id, label: T(`Yüz ${k + 1}`, `Face ${k + 1}`), outline: [O, P(k), P(k + 1)], role: 'wall' })
    if (k === 0) b.root(id)
    else b.fold({ parent: `face-${k}`, child: id, axis: [O, P(k)], angle: foldDeg })
  }
  b.panel({ id: 'lid', name: 'lid', label: T('Altıgen kapak', 'Hexagonal lid'), outline: hex, role: 'lid' })
  b.fold({ parent: `face-${lidFace + 1}`, child: 'lid', axis: [lidA, lidB], angle: 90 })
  b.panel({ id: 'lid-tuck', name: 'lid-tuck', label: T('Dil', 'Tuck'), outline: tuck, role: 'lock', printable: false })
  b.fold({ parent: 'lid', child: 'lid-tuck', axis: [ea, eb], angle: 90 })
  for (const k of [lidFace - 1, lidFace + 1]) {
    const d = dustOn(k)
    const id = `dust-${k + 1}`
    b.panel({ id, name: id, label: T('Toz kanadı', 'Dust flap'), outline: d, role: 'flap', printable: false })
    b.fold({ parent: `face-${k + 1}`, child: id, axis: [d[0] as Pt, d[d.length - 1] as Pt], angle: 90 })
  }
  if (glueW > 0) {
    b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma payı', 'Glue flap'), outline: glue, role: 'glue', printable: false })
    b.fold({ parent: `face-${n}`, child: 'glue', axis: [O, Pn], angle: foldDeg })
  }
  const all: Pt[] = []
  for (const p of b.build().panels) all.push(...p.outline)
  bleedGuide(b, all, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// Parametreler + tanımlar
// ---------------------------------------------------------------------------

const dctDims = (spec: PolySpec): { a: number; b: number; c: number } => {
  if (spec.dims) return { a: spec.dims.a, b: spec.dims.b ?? 0, c: spec.dims.c ?? 0 }
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a) return { a: e.dims.a, b: e.dims.b ?? 0, c: e.dims.c ?? 0 }
  }
  return { a: 100, b: 100, c: 150 }
}

const N = (key: string, tr: string, en: string, def: number, min: number, max: number, group: ParamDef['group'] = 'dimensions', advanced = false): ParamDef => ({
  kind: 'number',
  key,
  label: { tr, en },
  unit: 'mm',
  min,
  max,
  step: 0.5,
  default: Math.round(def * 2) / 2,
  group,
  ...(advanced ? { advanced: true } : {}),
})
const caliperP = (def: number): ParamDef => ({ kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 4, step: 0.05, default: def, group: 'material' })
const glueP = (def = 15): ParamDef => N('glueFlap', 'Yapıştırma payı', 'Glue flap', def, 0, 40, 'construction')
const bleedP = (): ParamDef => ({ kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' })

function paramsFor(spec: PolySpec): ParamDef[] {
  const d = dctDims(spec)
  switch (spec.kind) {
    case 'prism':
      return [N('length', 'Yüz genişliği (a)', 'Face width (a)', d.a, 15, 400), N('height', 'Yükseklik (c)', 'Height (c)', d.c || 150, 20, 900), glueP(), caliperP(0.5), bleedP()]
    case 'tri-prism':
      return [N('length', 'Uzunluk (a)', 'Length (a)', d.a, 30, 900), N('width', 'Üçgen kenarı (b)', 'Triangle side (b)', d.b || 110, 20, 400), glueP(), caliperP(0.5), bleedP()]
    case 'poly-tray-set':
      return [
        N('width', 'Ağız ölçüsü, düzlemler arası (a)', 'Across flats (a)', d.a || 200, 30, 800),
        N('height', 'Tepsi yüksekliği (b)', 'Tray height (b)', d.b || 60, 8, 400),
        N('lidHeight', 'Kapak yüksekliği (c)', 'Lid height (c)', d.c || 40, 5, 400),
        N('fitClearance', 'Kapak boşluğu', 'Lid clearance', 1, 0, 6, 'construction', true),
        caliperP(0.6),
        bleedP(),
      ]
    case 'frustum':
      return [
        N('length', 'Taban uzunluğu (a)', 'Base length (a)', d.a, 20, 600),
        N('width', 'Taban genişliği (b)', 'Base width (b)', d.b || d.a, 20, 600),
        N('height', 'Yükseklik (c)', 'Height (c)', d.c || 50, 10, 600),
        N('splay', 'Konik açılma (h)', 'Splay (h)', Math.round(Math.min(d.a, d.b || d.a) * 0.12), 0.5, 200, 'construction'),
        glueP(),
        caliperP(0.5),
        bleedP(),
      ]
    case 'pyramid':
      return [N('length', 'Ağız ölçüsü, düzlemler arası (a)', 'Opening across flats (a)', d.a, 20, 400), N('width', 'Eğik kenar (b)', 'Slant (b)', d.b || d.a * 1.6, 20, 900), glueP(12), caliperP(0.5), bleedP()]
  }
}

function build(spec: PolySpec, params: Record<string, ParamValue>): Dieline {
  switch (spec.kind) {
    case 'prism':
      return buildPrism(spec, params)
    case 'tri-prism':
      return buildTriPrism(spec, params)
    case 'poly-tray-set':
      return buildPolyTraySet(spec, params)
    case 'frustum':
      return buildFrustum(spec, params)
    case 'pyramid':
      return buildPyramid(spec, params)
  }
}

export const polyTemplate = (spec: PolySpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: spec.standard,
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, ...spec.dct],
  params: paramsFor(spec),
  build: (params) => build(spec, params),
})

const POLY: TemplateCategory = 'polygonal-boxes'
const ANGLED: TemplateCategory = 'angled-boxes'
const CARTON: MaterialKind[] = ['carton']

export const POLY_SPECS: readonly PolySpec[] = [
  {
    id: 'ecma-c10-40-55-20',
    code: 'C10.40.55.20',
    standard: 'ECMA',
    dct: ['becf-12801'],
    name: T('Altıgen kutu, dilli kapak + kilit taban', 'Hexagonal box, tuck lid + lock bottom'),
    description: T('Altı yüz + yapıştırma; üstte altıgen dilli kapak ve toz kanadı, altta çokgen crash-lock kanatları.', 'Six faces plus glue flap; hexagonal tuck lid with dust flap on top, polygonal crash-lock flaps at the bottom.'),
    keywords: ['altıgen', 'hexagonal', 'çokgen', 'polygonal', 'c10.40'],
    category: POLY,
    materials: CARTON,
    kind: 'prism',
    sides: 6,
    top: 'tuck',
    bottom: 'crash',
  },
  {
    id: 'ecma-c10-40-20-20',
    code: 'C10.40.20.20',
    standard: 'ECMA',
    dct: ['becf-12802'],
    name: T('Altıgen kutu, iki uçta dilli kapak', 'Hexagonal box, tuck lids both ends'),
    description: T('Altı yüz + yapıştırma; her iki uçta altıgen dilli kapak ve toz kanadı.', 'Six faces plus glue flap; hexagonal tuck lid with dust flap at both ends.'),
    keywords: ['altıgen', 'hexagonal', 'çokgen', 'dilli', 'c10.40'],
    category: POLY,
    materials: CARTON,
    kind: 'prism',
    sides: 6,
    top: 'tuck',
    bottom: 'tuck',
  },
  {
    id: 'ecma-c10-40-55-90',
    code: 'C10.40.55.90',
    standard: 'ECMA',
    dct: ['becf-12803'],
    name: T('Altıgen kutu, petal (twist) kapak + kilit taban', 'Hexagonal box, petal (twist) top + lock bottom'),
    description: T('Altı yüz; üstte köşegen perforasyonlu petal kanatlar birbirinin altına bükülür, altta crash-lock.', 'Six faces; petal flaps with diagonal perforations twist under each other on top, crash-lock bottom.'),
    keywords: ['altıgen', 'hexagonal', 'petal', 'twist', 'c10.40'],
    category: POLY,
    materials: CARTON,
    kind: 'prism',
    sides: 6,
    top: 'petal',
    bottom: 'crash',
  },
  {
    id: 'ecma-c10-10-20-20',
    code: 'C10.10.20.20',
    standard: 'ECMA',
    dct: ['becf-12804'],
    name: T('Üçgen prizma kutu', 'Triangular prism box'),
    description: T('Üç yüz + yapıştırma; iki uçta üçgen kapak ve kırpılmış toz kanatları (Toblerone tipi).', 'Three faces plus glue flap; triangular lid and trimmed dust flaps at both ends (Toblerone style).'),
    keywords: ['üçgen', 'triangular', 'prizma', 'prism', 'c10.10'],
    category: POLY,
    materials: CARTON,
    kind: 'tri-prism',
  },
  {
    id: 'ecma-d10-51-oct',
    code: 'D10.51.04.62',
    standard: 'ECMA',
    dct: ['becf-12805'],
    name: T('Sekizgen tepsi + kapak (iki parça)', 'Octagonal tray + lid (two piece)'),
    description: T('Sekizgen taban, pahlı sekiz duvar ve komşuya yapışan kulaklar; kapak aynı yapıda, boşluk payıyla büyük.', 'Octagonal base with eight mitred walls and glue tabs; lid built the same way, sized up by the clearance.'),
    keywords: ['sekizgen', 'octagonal', 'tepsi', 'tray', 'kapak', 'd10.51'],
    category: POLY,
    materials: CARTON,
    kind: 'poly-tray-set',
    sides: 8,
  },
  {
    id: 'ecma-d10-51-hex',
    code: 'D10.51.04.62',
    standard: 'ECMA',
    dct: ['becf-12806'],
    name: T('Altıgen tepsi + kapak (iki parça)', 'Hexagonal tray + lid (two piece)'),
    description: T('Altıgen taban, pahlı altı duvar ve yapıştırma kulakları; kapak aynı yapıda.', 'Hexagonal base with six mitred walls and glue tabs; lid built the same way.'),
    keywords: ['altıgen', 'hexagonal', 'tepsi', 'tray', 'kapak', 'd10.51'],
    category: POLY,
    materials: CARTON,
    kind: 'poly-tray-set',
    sides: 6,
    dims: { a: 150, b: 50, c: 30 },
  },
  // --- Açılı kutular ---
  {
    id: 'ecma-c20-20-10-10',
    code: 'C20.20.10.10',
    standard: 'ECMA',
    dct: ['becf-12901'],
    name: T('Konik kutu, dört kapama kanadı', 'Tapered box, four closing flaps'),
    description: T('Kesik piramit: dört yamuk yüz eğik kenarlardan zincirlenir; iki uçta karşılıklı kapanan kanatlar.', 'Truncated pyramid: four trapezoid faces chained along the slanted edges; opposing closing flaps at both ends.'),
    keywords: ['konik', 'tapered', 'açılı', 'angled', 'kesik piramit', 'c20.20'],
    category: ANGLED,
    materials: CARTON,
    kind: 'frustum',
    top: 'flaps',
    bottom: 'flaps',
  },
  {
    id: 'ecma-c30-40-01-20',
    code: 'C30.40.01.20',
    standard: 'ECMA',
    dct: ['becf-12902'],
    name: T('Altıgen külah, dilli kapak', 'Hexagonal cone, tuck lid'),
    description: T('Tepe noktasında birleşen altı üçgen yüz + yapıştırma; ağızda altıgen dilli kapak ve toz kanatları.', 'Six triangular faces meeting at the apex plus glue flap; hexagonal tuck lid with dust flaps at the opening.'),
    keywords: ['külah', 'cone', 'piramit', 'pyramid', 'altıgen', 'c30.40'],
    category: ANGLED,
    materials: CARTON,
    kind: 'pyramid',
    sides: 6,
  },
  {
    id: 'angled-tuck-box',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12903'],
    name: T('Konik kutu, dilli kapak', 'Tapered box, tuck lid'),
    description: T('Kesik piramit; üstte dilli kapak ve toz kanatları, altta kapama kanatları.', 'Truncated pyramid; tuck lid with dust flaps on top, closing flaps at the bottom.'),
    keywords: ['konik', 'tapered', 'açılı', 'angled', 'dilli kapak'],
    category: ANGLED,
    materials: CARTON,
    kind: 'frustum',
    top: 'tuck',
    bottom: 'flaps',
  },
]

export const polyTemplates: TemplateDefinition[] = POLY_SPECS.map(polyTemplate)
