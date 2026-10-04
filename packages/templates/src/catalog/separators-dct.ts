import { DielineBuilder, PathBuilder, circlePath, rectPath, rectPoints, segment, type Dieline, type PathCommand, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Ayırıcılar ve iç parçalar (DCT separators): platform iç parça (taban + dört
 * duvar, isteğe bağlı dönüş kanadı ve delik dizisi), taraklı bölme şeridi,
 * akordeon bölme, U / L köşe koruyucu pedler.
 */

type Pt = Point
type HoleKind = 'none' | 'circle' | 'cross' | 'rect'

export interface SeparatorSpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  kind: 'platform' | 'comb' | 'accordion' | 'u-pad' | 'l-pad'
  /** platform: dönüş kanadı (F80.03.B), pahlı duvar uçları, delik türü ve sayısı. */
  platform?: { returns?: boolean; chamfer?: boolean; holes: HoleKind; nx?: number; ny?: number }
  /** comb: şerit sayısı (FEFCO 0930 iki şerit). */
  pieces?: number
  dims?: { a: number; b: number; c: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })

const poly = (pts: Pt[]): PathCommand[] => {
  const pb = new PathBuilder()
  pb.moveTo(pts[0] as Pt)
  for (let i = 1; i < pts.length; i++) pb.lineTo(pts[i] as Pt)
  pb.close()
  return pb.build()
}

const meta = (spec: SeparatorSpec, caliper: number) => ({
  name: spec.name,
  ...(spec.standard === 'ECMA' ? { ecma: spec.code } : spec.standard === 'FEFCO' ? { fefco: spec.code } : {}),
  caliper,
  glueFlapSide: 'none' as const,
})

const bleedRect = (b: DielineBuilder, x: number, y: number, w: number, h: number, bleed: number): void => {
  if (bleed > 0) b.guide('bleed', rectPath(x - bleed, y - bleed, w + 2 * bleed, h + 2 * bleed), 'taşma payı')
}

// ---------------------------------------------------------------------------
// 1) Platform iç parça — taban + dört duvar (+ dönüş kanadı) + delikler
// ---------------------------------------------------------------------------

function buildPlatform(spec: SeparatorSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const w = num(params, 'width')
  const h = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const o = spec.platform ?? { holes: 'none' as HoleKind }
  const ret = o.returns ? num(params, 'returnFlap') : 0
  const nx = Math.max(1, Math.round(num(params, 'holesX')))
  const ny = Math.max(1, Math.round(num(params, 'holesY')))
  const holeSize = num(params, 'holeSize')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const g = Math.max(1, caliper)
  const total = h + ret
  // Pahlı duvar ucu: uç kenar duvar yüksekliği kadar içe kaçar (45°)
  const ch = o.chamfer ? Math.min(total, Math.min(a, w) * 0.2) : 0

  const outline = poly([
    { x: g, y: 0 },
    { x: g + ch, y: -total },
    { x: a - g - ch, y: -total },
    { x: a - g, y: 0 },
    { x: a, y: 0 },
    { x: a, y: g },
    { x: a + total, y: g + ch },
    { x: a + total, y: w - g - ch },
    { x: a, y: w - g },
    { x: a, y: w },
    { x: a - g, y: w },
    { x: a - g - ch, y: w + total },
    { x: g + ch, y: w + total },
    { x: g, y: w },
    { x: 0, y: w },
    { x: 0, y: w - g },
    { x: -total, y: w - g - ch },
    { x: -total, y: g + ch },
    { x: 0, y: g },
    { x: 0, y: 0 },
  ])
  b.cut(outline, 'iç parça çevresi')
  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, w), role: 'bottom' })
  b.root('base')

  type Side = 'bottom' | 'right' | 'top' | 'left'
  const wall = (side: Side) => {
    const wid = `wall-${side}`
    const rid = `return-${side}`
    const slope = (t: number) => (total > 0 ? (ch * t) / total : 0)
    let wallPts: Pt[]
    let retPts: Pt[]
    let fold: ReturnType<typeof foldHorizontal>
    let retFold: ReturnType<typeof foldHorizontal>
    switch (side) {
      case 'bottom':
        wallPts = [{ x: g, y: 0 }, { x: g + slope(h), y: -h }, { x: a - g - slope(h), y: -h }, { x: a - g, y: 0 }]
        retPts = [{ x: g + slope(h), y: -h }, { x: g + ch, y: -total }, { x: a - g - ch, y: -total }, { x: a - g - slope(h), y: -h }]
        fold = foldHorizontal(0, g, a - g, 'below')
        retFold = foldHorizontal(-h, g + slope(h), a - g - slope(h), 'below')
        break
      case 'top':
        wallPts = [{ x: g, y: w }, { x: a - g, y: w }, { x: a - g - slope(h), y: w + h }, { x: g + slope(h), y: w + h }]
        retPts = [{ x: g + slope(h), y: w + h }, { x: a - g - slope(h), y: w + h }, { x: a - g - ch, y: w + total }, { x: g + ch, y: w + total }]
        fold = foldHorizontal(w, g, a - g, 'above')
        retFold = foldHorizontal(w + h, g + slope(h), a - g - slope(h), 'above')
        break
      case 'right':
        wallPts = [{ x: a, y: g }, { x: a + h, y: g + slope(h) }, { x: a + h, y: w - g - slope(h) }, { x: a, y: w - g }]
        retPts = [{ x: a + h, y: g + slope(h) }, { x: a + total, y: g + ch }, { x: a + total, y: w - g - ch }, { x: a + h, y: w - g - slope(h) }]
        fold = foldVertical(a, g, w - g, 'right')
        retFold = foldVertical(a + h, g + slope(h), w - g - slope(h), 'right')
        break
      default:
        wallPts = [{ x: 0, y: g }, { x: 0, y: w - g }, { x: -h, y: w - g - slope(h) }, { x: -h, y: g + slope(h) }]
        retPts = [{ x: -h, y: g + slope(h) }, { x: -h, y: w - g - slope(h) }, { x: -total, y: w - g - ch }, { x: -total, y: g + ch }]
        fold = foldVertical(0, g, w - g, 'left')
        retFold = foldVertical(-h, g + slope(h), w - g - slope(h), 'left')
    }
    b.panel({ id: wid, name: wid, label: T('Duvar', 'Wall'), outline: wallPts, role: 'wall' })
    b.fold({ parent: 'base', child: wid, ...fold })
    if (ret > 0) {
      b.panel({ id: rid, name: rid, label: T('Dönüş kanadı', 'Return flap'), outline: retPts, role: 'flap', printable: false })
      b.fold({ parent: wid, child: rid, ...retFold })
    }
  }
  for (const s of ['bottom', 'right', 'top', 'left'] as Side[]) wall(s)

  // Delik dizisi
  if (o.holes !== 'none') {
    const pitchX = a / nx
    const pitchY = w / ny
    const size = Math.min(holeSize, pitchX - 6, pitchY - 6)
    if (size > 4) {
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const cx = pitchX * (i + 0.5)
          const cy = pitchY * (j + 0.5)
          if (o.holes === 'circle') b.cut(circlePath({ x: cx, y: cy }, size / 2), 'delik')
          else if (o.holes === 'rect') b.cut(rectPath(cx - size / 2, cy - size * 0.35, size, size * 0.7), 'dikdörtgen delik')
          else {
            // Çapraz kesim: kare kırım çerçevesi + X kesimi; dört üçgen içe bükülür (şişe boynu)
            const hs = size / 2
            b.creaseLine({ x: cx - hs, y: cy - hs }, { x: cx + hs, y: cy - hs }, 'delik çerçevesi')
            b.creaseLine({ x: cx + hs, y: cy - hs }, { x: cx + hs, y: cy + hs }, 'delik çerçevesi')
            b.creaseLine({ x: cx + hs, y: cy + hs }, { x: cx - hs, y: cy + hs }, 'delik çerçevesi')
            b.creaseLine({ x: cx - hs, y: cy + hs }, { x: cx - hs, y: cy - hs }, 'delik çerçevesi')
            b.cut(segment({ x: cx - hs, y: cy - hs }, { x: cx + hs, y: cy + hs }), 'çapraz kesim')
            b.cut(segment({ x: cx + hs, y: cy - hs }, { x: cx - hs, y: cy + hs }), 'çapraz kesim')
          }
        }
      }
    } else b.warn('holes-too-dense', 'warning', 'Delik dizisi taban ölçüsüne sığmıyor; delikler atlandı.', 'Hole grid does not fit the base; holes were skipped.')
  }
  bleedRect(b, -total, -total, a + 2 * total, w + 2 * total, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 2) Taraklı bölme şeridi (F80.31 / FEFCO 0930)
// ---------------------------------------------------------------------------

function buildComb(spec: SeparatorSpec, params: Record<string, ParamValue>): Dieline {
  const cell = num(params, 'length')
  const cells = Math.max(2, Math.round(num(params, 'cells')))
  const h = num(params, 'height')
  const slotD = num(params, 'slotDepth')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const pieces = spec.pieces ?? 1
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  // Yarık, karşı şeridin kalınlığından biraz geniş; doğrulayıcının dar parça eşiği (1.5 × kalınlık) altına düşmesin
  const slotW = Math.max(1.2, caliper * 1.6)
  const L = cell * cells
  const gap = 8
  const ids: string[] = []
  for (let p = 0; p < pieces; p++) {
    const y0 = p * (h + gap)
    const pts: Pt[] = [{ x: 0, y: y0 }, { x: L, y: y0 }]
    // Yarıklar üst kenarda; ikinci şeritte alt kenarda (birbirine geçer)
    const fromTop = p % 2 === 0
    if (fromTop) {
      pts.push({ x: L, y: y0 + h })
      for (let k = cells - 1; k >= 1; k--) {
        const sx = k * cell
        pts.push({ x: sx + slotW / 2, y: y0 + h }, { x: sx + slotW / 2, y: y0 + h - slotD }, { x: sx - slotW / 2, y: y0 + h - slotD }, { x: sx - slotW / 2, y: y0 + h })
      }
      pts.push({ x: 0, y: y0 + h })
    } else {
      pts.length = 0
      pts.push({ x: 0, y: y0 })
      for (let k = 1; k < cells; k++) {
        const sx = k * cell
        pts.push({ x: sx - slotW / 2, y: y0 }, { x: sx - slotW / 2, y: y0 + slotD }, { x: sx + slotW / 2, y: y0 + slotD }, { x: sx + slotW / 2, y: y0 })
      }
      pts.push({ x: L, y: y0 }, { x: L, y: y0 + h }, { x: 0, y: y0 + h })
    }
    const id = `strip-${p + 1}`
    b.cut(poly(pts), `şerit ${p + 1}`)
    b.panel({ id, name: id, label: T('Bölme şeridi', 'Divider strip'), outline: pts, role: 'wall' })
    ids.push(id)
  }
  b.root(ids[0] as string)
  for (const id of ids.slice(1)) b.fold({ parent: ids[0] as string, child: id, axis: [{ x: 0, y: 0 }, { x: 1, y: 0 }], angle: 0, draw: false })
  bleedRect(b, 0, 0, L, pieces * h + (pieces - 1) * gap, bleed)
  if (slotD > h * 0.75) b.warn('slot-too-deep', 'warning', 'Yarık derinliği şerit yüksekliğinin %75’ini aşıyor.', 'Slot depth exceeds 75% of the strip height.')
  return b.build()
}

// ---------------------------------------------------------------------------
// 3) Akordeon bölme — zikzak katlanan şerit
// ---------------------------------------------------------------------------

function buildAccordion(spec: SeparatorSpec, params: Record<string, ParamValue>): Dieline {
  const cell = num(params, 'length')
  const n = Math.max(2, Math.round(num(params, 'cells')))
  const h = num(params, 'width')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const L = cell * n
  b.cut(rectPath(0, 0, L, h), 'akordeon çevresi')
  for (let i = 0; i < n; i++) {
    const id = `fold-${i + 1}`
    b.panel({ id, name: id, label: T('Akordeon paneli', 'Accordion panel'), outline: rectPoints(i * cell, 0, cell, h), role: 'wall' })
    if (i === 0) b.root(id)
    else b.fold({ parent: `fold-${i}`, child: id, ...foldVertical(i * cell, 0, h, 'right', 120), reverse: i % 2 === 0 })
  }
  bleedRect(b, 0, 0, L, h, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 4) U ped — yuvarlak köşeli iki panel (kenar koruyucu)
// ---------------------------------------------------------------------------

function buildUPad(spec: SeparatorSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const p1 = num(params, 'width')
  const p2 = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const r = Math.min(a, p1, p2) * 0.2
  const H = p1 + p2
  const pb = new PathBuilder()
  pb.moveTo({ x: r, y: 0 })
  pb.filletTo({ x: a, y: 0 }, { x: a, y: H }, r)
  pb.filletTo({ x: a, y: H }, { x: 0, y: H }, r)
  pb.filletTo({ x: 0, y: H }, { x: 0, y: 0 }, r)
  pb.filletTo({ x: 0, y: 0 }, { x: a, y: 0 }, r)
  pb.close()
  b.cut(pb.build(), 'ped çevresi')
  b.panel({ id: 'main', name: 'main', label: T('Ana panel', 'Main panel'), outline: rectPoints(0, 0, a, p1), role: 'wall' })
  b.root('main')
  b.panel({ id: 'wing', name: 'wing', label: T('Kanat', 'Wing'), outline: rectPoints(0, p1, a, p2), role: 'flap' })
  b.fold({ parent: 'main', child: 'wing', ...foldHorizontal(p1, 0, a, 'above') })
  bleedRect(b, 0, 0, a, H, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 5) L köşe koruyucu — iki dik panel + taban kanatları
// ---------------------------------------------------------------------------

function buildLPad(spec: SeparatorSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const w = num(params, 'width')
  const h = num(params, 'height')
  const base = num(params, 'baseFlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const g = Math.max(1, caliper)
  const r = Math.min(a, w, h) * 0.12
  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  if (base > 0) {
    pb.lineTo({ x: 0, y: -base }).lineTo({ x: a - g, y: -base }).lineTo({ x: a - g, y: 0 }).lineTo({ x: a + g, y: 0 }).lineTo({ x: a + g, y: -base }).lineTo({ x: a + w, y: -base })
  }
  pb.lineTo({ x: a + w, y: 0 })
  pb.filletTo({ x: a + w, y: h }, { x: 0, y: h }, r)
  pb.filletTo({ x: 0, y: h }, { x: 0, y: 0 }, r)
  pb.close()
  b.cut(pb.build(), 'köşe koruyucu çevresi')
  b.panel({ id: 'side-a', name: 'side-a', label: T('Yan A', 'Side A'), outline: rectPoints(0, 0, a, h), role: 'wall' })
  b.root('side-a')
  b.panel({ id: 'side-b', name: 'side-b', label: T('Yan B', 'Side B'), outline: rectPoints(a, 0, w, h), role: 'wall' })
  b.fold({ parent: 'side-a', child: 'side-b', ...foldVertical(a, 0, h, 'right') })
  if (base > 0) {
    b.panel({ id: 'base-a', name: 'base-a', label: T('Taban kanadı', 'Base flap'), outline: rectPoints(0, -base, a - g, base), role: 'flap' })
    b.fold({ parent: 'side-a', child: 'base-a', ...foldHorizontal(0, 0, a - g, 'below') })
    b.panel({ id: 'base-b', name: 'base-b', label: T('Taban kanadı', 'Base flap'), outline: rectPoints(a + g, -base, w - g, base), role: 'flap' })
    b.fold({ parent: 'side-b', child: 'base-b', ...foldHorizontal(0, a + g, a + w, 'below') })
  }
  bleedRect(b, 0, -base, a + w, h + base, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// Parametreler + tanımlar
// ---------------------------------------------------------------------------

const dctDims = (spec: SeparatorSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b && e.dims.c) return { a: e.dims.a, b: e.dims.b, c: e.dims.c }
  }
  return { a: 200, b: 150, c: 50 }
}

const N = (key: string, tr: string, en: string, def: number, min: number, max: number, group: ParamDef['group'] = 'dimensions', advanced = false, unit: 'mm' | undefined = 'mm', step = 0.5): ParamDef => ({
  kind: 'number',
  key,
  label: { tr, en },
  ...(unit ? { unit } : {}),
  min,
  max,
  step,
  default: def,
  group,
  ...(advanced ? { advanced: true } : {}),
})
const caliperP = (def: number): ParamDef => ({ kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 12, step: 0.1, default: def, group: 'material' })
const bleedP = (): ParamDef => ({ kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' })

function paramsFor(spec: SeparatorSpec): ParamDef[] {
  const d = dctDims(spec)
  const cal = spec.materials.includes('corrugated') && !spec.materials.includes('carton') ? 3 : 0.6
  switch (spec.kind) {
    case 'platform': {
      const o = spec.platform ?? { holes: 'none' as HoleKind }
      const out: ParamDef[] = [N('length', 'Taban uzunluğu (a)', 'Base length (a)', d.a, 30, 1200), N('width', 'Taban genişliği (b)', 'Base width (b)', d.b, 30, 1200), N('height', 'Duvar yüksekliği (c)', 'Wall height (c)', d.c, 5, 400)]
      if (o.returns) out.push(N('returnFlap', 'Dönüş kanadı (d)', 'Return flap (d)', Math.round(d.c * 0.6), 3, 300, 'construction'))
      const hasHoles = o.holes !== 'none'
      out.push(
        N('holesX', 'Delik sayısı (uzunluk)', 'Holes along length', o.nx ?? 1, 1, 12, 'options', !hasHoles, undefined, 1),
        N('holesY', 'Delik sayısı (genişlik)', 'Holes along width', o.ny ?? 1, 1, 12, 'options', !hasHoles, undefined, 1),
        N('holeSize', 'Delik ölçüsü', 'Hole size', Math.round(Math.min(d.a / (o.nx ?? 1), d.b / (o.ny ?? 1)) * 0.5), 4, 400, 'options', !hasHoles),
      )
      out.push(caliperP(cal), bleedP())
      return out
    }
    case 'comb':
      return [N('length', 'Hücre adımı (a)', 'Cell pitch (a)', d.a, 10, 400), N('cells', 'Hücre sayısı', 'Cells', 5, 2, 30, 'construction', false, undefined, 1), N('height', 'Şerit yüksekliği (c)', 'Strip height (c)', d.c, 10, 600), N('slotDepth', 'Yarık derinliği (e)', 'Slot depth (e)', Math.round(d.c / 2), 3, 400, 'construction'), caliperP(cal), bleedP()]
    case 'accordion':
      return [N('length', 'Panel genişliği (c)', 'Panel width (c)', Math.max(d.c, 15), 8, 400), N('cells', 'Panel sayısı', 'Panels', 8, 2, 40, 'construction', false, undefined, 1), N('width', 'Yükseklik (b)', 'Height (b)', d.b, 10, 800), caliperP(cal), bleedP()]
    case 'u-pad':
      return [N('length', 'Uzunluk (a)', 'Length (a)', d.a, 20, 1200), N('width', 'Ana panel (b)', 'Main panel (b)', d.b, 10, 800), N('height', 'Kanat (c)', 'Wing (c)', d.c, 10, 800), caliperP(cal), bleedP()]
    case 'l-pad':
      return [N('length', 'Yan A (a)', 'Side A (a)', d.a, 20, 1200), N('width', 'Yan B (b)', 'Side B (b)', d.b, 20, 1200), N('height', 'Yükseklik (c)', 'Height (c)', d.c, 20, 1200), N('baseFlap', 'Taban kanadı', 'Base flap', Math.round(Math.min(d.a, d.b) * 0.25), 0, 400, 'construction'), caliperP(cal), bleedP()]
  }
}

function build(spec: SeparatorSpec, params: Record<string, ParamValue>): Dieline {
  switch (spec.kind) {
    case 'platform':
      return buildPlatform(spec, params)
    case 'comb':
      return buildComb(spec, params)
    case 'accordion':
      return buildAccordion(spec, params)
    case 'u-pad':
      return buildUPad(spec, params)
    case 'l-pad':
      return buildLPad(spec, params)
  }
}

export const separatorTemplate = (spec: SeparatorSpec): TemplateDefinition => ({
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

const SEP: TemplateCategory = 'separators'

export const SEPARATOR_SPECS: readonly SeparatorSpec[] = [
  {
    id: 'ecma-f80-03',
    code: 'F80.03.00.00',
    standard: 'ECMA',
    dct: ['becf-11f01'],
    name: T('Platform iç parça', 'Platform insert'),
    description: T('Taban + dört duvar; kutu içinde ürünü yükselten / sabitleyen yapıştırmasız iç parça.', 'Base with four walls; glue-free insert that raises and locates the product inside a box.'),
    keywords: ['iç parça', 'insert', 'platform', 'fitment', 'f80.03'],
    category: SEP,
    materials: ['carton'],
    kind: 'platform',
    platform: { holes: 'none' },
  },
  {
    id: 'ecma-f80-03-b',
    code: 'F80.03.00.00.B',
    standard: 'ECMA',
    dct: ['becf-11f02'],
    name: T('Platform iç parça, dönüş kanatlı', 'Platform insert with return flaps'),
    description: T('Taban + dört duvar + tabanın altına dönen kanatlar; çift katlı, daha rijit platform.', 'Base, four walls and flaps returning under the base — a double-wall, stiffer platform.'),
    keywords: ['iç parça', 'insert', 'platform', 'dönüş kanadı', 'f80.03'],
    category: SEP,
    materials: ['carton'],
    kind: 'platform',
    platform: { holes: 'none', returns: true },
  },
  {
    id: 'ecma-f80-31',
    code: 'F80.31.00.00',
    standard: 'ECMA',
    dct: ['becf-11f03'],
    name: T('Taraklı bölme şeridi', 'Slotted divider strip'),
    description: T('Eşit adımlı yarıklı tek şerit; çapraz şeritlerle hücre ızgarası kurar.', 'Single strip with evenly pitched slots; forms a cell grid with cross strips.'),
    keywords: ['bölme', 'divider', 'tarak', 'comb', 'yarık', 'f80.31'],
    category: SEP,
    materials: ['carton'],
    kind: 'comb',
    pieces: 1,
  },
  {
    id: 'separator-accordion',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11f04'],
    name: T('Akordeon bölme', 'Accordion divider'),
    description: T('Zikzak katlanan şerit; küçük ürünleri (kalem, tüp, ampul) ayıran esnek bölme.', 'Zig-zag folded strip; flexible divider for small items (pens, tubes, vials).'),
    keywords: ['akordeon', 'accordion', 'zikzak', 'bölme', 'divider'],
    category: SEP,
    materials: ['carton'],
    kind: 'accordion',
    dims: { a: 0, b: 150, c: 20 },
  },
  {
    id: 'separator-insert-rect',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11f07'],
    name: T('Platform iç parça, dikdörtgen kesimli', 'Platform insert with rectangular cut-outs'),
    description: T('Taban + dört duvar; ürün yuvaları için dikdörtgen kesim dizisi.', 'Base with four walls and a grid of rectangular cut-outs for product pockets.'),
    keywords: ['iç parça', 'insert', 'yuva', 'cut-out', 'dikdörtgen'],
    category: SEP,
    materials: ['carton'],
    kind: 'platform',
    platform: { holes: 'rect', nx: 3, ny: 1 },
  },
  {
    id: 'bottle-cell-platform',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21e22'],
    name: T('Şişe hücreli platform (3×2)', 'Bottle cell platform (3×2)'),
    description: T('Taban + dört duvar; 3×2 yuvarlak şişe boynu deliği. Şarap/içecek kolisi iç parçası.', 'Base with four walls and a 3×2 grid of round bottle-neck holes. Wine and beverage case insert.'),
    keywords: ['şişe', 'bottle', 'hücre', 'cell', 'platform', 'iç parça'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'platform',
    platform: { holes: 'circle', nx: 3, ny: 2 },
    dims: { a: 260, b: 175, c: 60 },
  },
  {
    id: 'separator-insert-circle',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11f08'],
    name: T('Platform iç parça, yuvarlak delikli', 'Platform insert with round hole'),
    description: T('Taban + dört duvar; ortada yuvarlak delik (şişe / kavanoz boynu).', 'Base with four walls and a central round hole (bottle / jar neck).'),
    keywords: ['iç parça', 'insert', 'delik', 'hole', 'şişe'],
    category: SEP,
    materials: ['carton'],
    kind: 'platform',
    platform: { holes: 'circle', nx: 1, ny: 1 },
  },
  {
    id: 'separator-insert-circle-chamfer',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11f09'],
    name: T('Platform iç parça, pahlı duvar, yuvarlak delikli', 'Platform insert, chamfered walls, round hole'),
    description: T('Taban + uçları pahlı dört duvar; ortada yuvarlak delik. Duvar uçları köşede çakışmaz.', 'Base with four chamfered walls and a central round hole; wall ends clear each other at the corners.'),
    keywords: ['iç parça', 'insert', 'pahlı', 'chamfer', 'delik'],
    category: SEP,
    materials: ['carton'],
    kind: 'platform',
    platform: { holes: 'circle', chamfer: true, nx: 1, ny: 1 },
  },
  // --- Oluklu ---
  {
    id: 'fefco-0930',
    code: '0930',
    standard: 'FEFCO',
    dct: ['becf-21f01'],
    name: T('Bölme şeritleri (FEFCO 0930)', 'Divider strips (FEFCO 0930)'),
    description: T('Birbirine geçen iki yarıklı şerit; oluklu şişe / cam ayırıcı.', 'Two interlocking slotted strips; corrugated bottle / glass divider.'),
    keywords: ['0930', 'bölme', 'divider', 'şerit', 'oluklu'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'comb',
    pieces: 2,
  },
  {
    id: 'separator-insert-cross-2',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21f02'],
    name: T('Platform iç parça, iki çapraz kesimli yuva', 'Platform insert with two cross-cut pockets'),
    description: T('Oluklu taban + dört duvar; iki kare kırım çerçevesi ve X kesimi — üçgenler içe bükülüp şişe boynunu tutar.', 'Corrugated base with four walls; two square creased frames with X cuts — the triangles fold in to grip a bottle neck.'),
    keywords: ['iç parça', 'insert', 'çapraz kesim', 'cross cut', 'şişe'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'platform',
    platform: { holes: 'cross', nx: 2, ny: 1 },
  },
  {
    id: 'fefco-0458',
    code: '0458',
    standard: 'FEFCO',
    dct: ['becf-21f03'],
    name: T('Platform ped (FEFCO 0458)', 'Platform pad (FEFCO 0458)'),
    description: T('Oluklu taban + dört duvar; yapıştırmasız yükseltme pedi.', 'Corrugated base with four walls; glue-free raising pad.'),
    keywords: ['0458', 'ped', 'pad', 'platform', 'iç parça'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'platform',
    platform: { holes: 'none' },
  },
  {
    id: 'separator-insert-cross-1',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21f04'],
    name: T('Platform iç parça, tek çapraz kesimli yuva', 'Platform insert with one cross-cut pocket'),
    description: T('Oluklu taban + dört duvar; ortada kare kırım çerçevesi ve X kesimi.', 'Corrugated base with four walls; a central square creased frame with X cut.'),
    keywords: ['iç parça', 'insert', 'çapraz kesim', 'cross cut'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'platform',
    platform: { holes: 'cross', nx: 1, ny: 1 },
  },
  {
    id: 'separator-u-pad',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21f05'],
    name: T('U kenar pedi', 'U edge pad'),
    description: T('Yuvarlak köşeli iki panel; kutu kenarını / ürün kenarını saran koruyucu ped.', 'Two rounded panels; protective pad wrapping a box or product edge.'),
    keywords: ['ped', 'pad', 'kenar koruyucu', 'edge protector'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'u-pad',
  },
  {
    id: 'separator-l-pad',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21f06'],
    name: T('L köşe koruyucu', 'L corner protector'),
    description: T('Dik açıyla katlanan iki yan panel + taban kanatları; köşe koruyucu iç parça.', 'Two side panels folding at a right angle plus base flaps; corner-protecting insert.'),
    keywords: ['köşe koruyucu', 'corner protector', 'L ped', 'iç parça'],
    category: SEP,
    materials: ['corrugated'],
    kind: 'l-pad',
  },
]

export const separatorTemplates: TemplateDefinition[] = SEPARATOR_SPECS.map(separatorTemplate)
