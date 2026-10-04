import { DielineBuilder, PathBuilder, circlePath, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical, girthLayout } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { bool, num, str, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * diecuttemplates.com etiket (F80.51 / F80.52) ve sargı etiket / kılıf grupları.
 *
 * Etiketler: dikdörtgen (euroslot veya yuvarlak delik), daire, oval ve katlanır
 * etiket. Sargılar: dil kilitli kılıf, bardak taşıyıcı sargısı ve kitap/tabla kılıfı.
 */

type Pt = Point

export type TagWrapKind = 'tag-rect' | 'tag-circle' | 'tag-oval' | 'tag-folded' | 'sleeve-lock' | 'cup-carrier' | 'board-wrap'

export interface TagWrapSpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  kind: TagWrapKind
  /** tag-rect: askı deliği biçimi. */
  hole?: 'euroslot' | 'round'
  dims?: { a: number; b: number; c: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })

const dctDims = (spec: TagWrapSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a) return { a: e.dims.a, b: e.dims.b ?? e.dims.a, c: e.dims.c ?? 0 }
  }
  return { a: 100, b: 60, c: 0 }
}

const meta = (spec: TagWrapSpec, caliper: number, glue: boolean) => ({
  name: spec.name,
  ...(spec.standard === 'ECMA' ? { ecma: spec.code } : spec.standard === 'FEFCO' ? { fefco: spec.code } : {}),
  caliper,
  glueFlapSide: glue ? ('right' as const) : ('none' as const),
})

const roundedRect = (x: number, y: number, w: number, h: number, r: number): PathBuilder => {
  const rr = Math.min(r, w / 2, h / 2)
  const pb = new PathBuilder()
  pb.moveTo({ x: x + rr, y })
  pb.lineTo({ x: x + w - rr, y })
  if (rr > 0) pb.filletTo({ x: x + w, y }, { x: x + w, y: y + h }, rr)
  pb.lineTo({ x: x + w, y: y + h - rr })
  if (rr > 0) pb.filletTo({ x: x + w, y: y + h }, { x, y: y + h }, rr)
  pb.lineTo({ x: x + rr, y: y + h })
  if (rr > 0) pb.filletTo({ x, y: y + h }, { x, y }, rr)
  pb.lineTo({ x, y: y + rr })
  if (rr > 0) pb.filletTo({ x, y }, { x: x + w, y }, rr)
  pb.close()
  return pb
}

const circlePts = (cx: number, cy: number, r: number, n = 36): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) out.push({ x: cx + r * Math.cos((i / n) * Math.PI * 2), y: cy + r * Math.sin((i / n) * Math.PI * 2) })
  return out
}

const SOMBRERO_CCW = true

const hangHole = (b: DielineBuilder, kind: 'euroslot' | 'round' | 'none', cx: number, cy: number, w: number): void => {
  if (kind === 'euroslot') {
    const slotW = Math.min(30, w * 0.55)
    if (slotW >= 12) {
      // Sombrero (euroslot): ortada yuvarlak, yanlarda yarık
      const pb = new PathBuilder()
      const r = 3.5
      const h = 2
      pb.moveTo({ x: cx - slotW / 2, y: cy - h })
      pb.lineTo({ x: cx + slotW / 2, y: cy - h })
      pb.lineTo({ x: cx + slotW / 2, y: cy + h })
      pb.lineTo({ x: cx + r, y: cy + h })
      pb.arcTo({ x: cx - r, y: cy + h }, r, SOMBRERO_CCW, true)
      pb.lineTo({ x: cx - slotW / 2, y: cy + h })
      pb.close()
      b.cut(pb.build(), 'euroslot askı deliği')
    }
  } else if (kind === 'round') {
    b.cut(circlePath({ x: cx, y: cy }, Math.min(3, w * 0.08)), 'askı deliği')
  }
}

// ---------------------------------------------------------------------------
// Etiketler
// ---------------------------------------------------------------------------

function buildTag(spec: TagWrapSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hParam = spec.kind === 'tag-circle' ? a : num(params, 'height')
  const caliper = num(params, 'caliper')
  const r = spec.kind === 'tag-rect' || spec.kind === 'tag-folded' ? num(params, 'cornerRadius') : 0
  const holeKind = str(params, 'hole') as 'euroslot' | 'round' | 'none'
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)

  if (spec.kind === 'tag-rect') {
    const h = hParam
    b.cut(roundedRect(0, 0, a, h, r).build(), 'etiket çevresi')
    b.panel({ id: 'face', name: 'face', label: T('Etiket', 'Tag'), outline: rectPoints(0, 0, a, h), role: 'wall', printable: true })
    b.root('face')
    hangHole(b, holeKind, a / 2, h - Math.max(8, Math.min(14, h * 0.12)), a)
    if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, a + 2 * bleed, h + 2 * bleed), 'taşma payı')
  } else if (spec.kind === 'tag-circle') {
    const R = a / 2
    b.cut(circlePath({ x: R, y: R }, R), 'etiket çevresi')
    b.panel({ id: 'face', name: 'face', label: T('Etiket', 'Tag'), outline: circlePts(R, R, R), role: 'wall', printable: true })
    b.root('face')
    hangHole(b, holeKind === 'euroslot' ? 'round' : holeKind, R, 2 * R - Math.max(6, R * 0.18), a)
    if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, a + 2 * bleed, a + 2 * bleed), 'taşma payı')
  } else if (spec.kind === 'tag-oval') {
    const h = hParam
    const pb = new PathBuilder()
    const n = 48
    const pts: Pt[] = []
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      pts.push({ x: a / 2 + (a / 2) * Math.cos(t), y: h / 2 + (h / 2) * Math.sin(t) })
    }
    pb.moveTo(pts[0] as Pt)
    for (let i = 1; i < n; i++) pb.lineTo(pts[i] as Pt)
    pb.close()
    b.cut(pb.build(), 'oval etiket çevresi')
    b.panel({ id: 'face', name: 'face', label: T('Etiket', 'Tag'), outline: pts, role: 'wall', printable: true })
    b.root('face')
    hangHole(b, holeKind === 'euroslot' ? 'round' : holeKind, a / 2, h - Math.max(6, h * 0.12), a)
    if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, a + 2 * bleed, h + 2 * bleed), 'taşma payı')
  } else {
    // Katlanır etiket F80.52: iki panel, ortada kırım; askı deliği her iki panelde hizalı
    const h = hParam
    b.cut(roundedRect(0, 0, a, 2 * h, r).build(), 'katlanır etiket çevresi')
    b.panel({ id: 'front', name: 'front', label: T('Ön yüz', 'Front'), outline: rectPoints(0, 0, a, h), role: 'wall', printable: true })
    b.root('front')
    b.panel({ id: 'back', name: 'back', label: T('Arka yüz', 'Back'), outline: rectPoints(0, h, a, h), role: 'wall', printable: true })
    b.fold({ parent: 'front', child: 'back', ...foldHorizontal(h, 0, a, 'above', 180) })
    const hy = Math.max(8, Math.min(14, h * 0.15))
    hangHole(b, holeKind, a / 2, h - hy, a)
    hangHole(b, holeKind, a / 2, h + hy, a)
    if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, a + 2 * bleed, 2 * h + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

// ---------------------------------------------------------------------------
// Dil kilitli kılıf — yapıştırmasız sargı (becf-12502)
// ---------------------------------------------------------------------------

function buildSleeveLock(spec: TagWrapSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const tab = Math.max(10, Math.min(bW * 0.8, 40))
  const g = Math.max(1, caliper)
  const [p0, p1, p2, p3] = girthLayout([a, bW, a, bW]) as [{ x1: number; x2: number; width: number }, { x1: number; x2: number; width: number }, { x1: number; x2: number; width: number }, { x1: number; x2: number; width: number }]
  const x4 = p3.x2
  const tw = Math.min(c * 0.6, 60)
  const ty1 = (c - tw) / 2
  const ty2 = ty1 + tw

  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  pb.lineTo({ x: x4, y: 0 })
  pb.lineTo({ x: x4, y: ty1 - 4 })
  pb.lineTo({ x: x4 + tab * 0.4, y: ty1 - 4 })
  pb.lineTo({ x: x4 + tab, y: ty1 + g + 3 })
  pb.lineTo({ x: x4 + tab, y: ty2 - g - 3 })
  pb.lineTo({ x: x4 + tab * 0.4, y: ty2 + 4 })
  pb.lineTo({ x: x4, y: ty2 + 4 })
  pb.lineTo({ x: x4, y: c })
  pb.lineTo({ x: 0, y: c })
  pb.close()
  b.cut(pb.build(), 'kılıf çevresi')

  const walls: [string, { x1: number; width: number }, I18nText][] = [
    ['front', p0, T('Ön', 'Front')],
    ['right', p1, T('Sağ yan', 'Right side')],
    ['back', p2, T('Arka', 'Back')],
    ['left', p3, T('Sol yan', 'Left side')],
  ]
  for (const [id, seg, label] of walls) b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, c), role: 'wall', printable: true })
  b.root('front')
  b.fold({ parent: 'front', child: 'right', ...foldVertical(p1.x1, 0, c, 'right') })
  b.fold({ parent: 'right', child: 'back', ...foldVertical(p2.x1, 0, c, 'right') })
  b.fold({ parent: 'back', child: 'left', ...foldVertical(p3.x1, 0, c, 'right') })
  b.panel({ id: 'lock-tab', name: 'lock-tab', label: T('Kilit dili', 'Lock tab'), outline: [{ x: x4, y: ty1 - 4 }, { x: x4 + tab * 0.4, y: ty1 - 4 }, { x: x4 + tab, y: ty1 + g + 3 }, { x: x4 + tab, y: ty2 - g - 3 }, { x: x4 + tab * 0.4, y: ty2 + 4 }, { x: x4, y: ty2 + 4 }], role: 'lock', printable: false })
  b.fold({ parent: 'left', child: 'lock-tab', ...foldVertical(x4, ty1 - 4, ty2 + 4, 'right') })
  // Ön panelin sol kenarına yakın kilit yarığı (dil buraya girer)
  const sx = Math.min(tab * 0.6, a * 0.3)
  b.cutLine({ x: sx, y: ty1 }, { x: sx, y: ty2 }, 'kilit yarığı')
  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, x4 + tab + 2 * bleed, c + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Bardak taşıyıcı sargısı — delikli platform + iki tutamak paneli (becf-12503)
// ---------------------------------------------------------------------------

function buildCupCarrier(spec: TagWrapSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = num(params, 'height')
  const cups = Math.max(1, Math.round(num(params, 'cups')))
  const cupDia = num(params, 'cupDiameter')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const handleH = Math.max(30, bW * 0.55 + 20)
  // Dikey dizilim: alt tutamak, alt duvar c, platform bW, üst duvar c, üst tutamak
  const y0 = 0
  const yWall1 = y0 + handleH
  const yPlat = yWall1 + c
  const yWall2 = yPlat + bW
  const yTop = yWall2 + c
  const yEnd = yTop + handleH
  const sh = Math.min(a * 0.12, handleH * 0.4)

  const pb = new PathBuilder()
  pb.moveTo({ x: sh, y: y0 })
  pb.lineTo({ x: a - sh, y: y0 })
  pb.lineTo({ x: a, y: yWall1 })
  pb.lineTo({ x: a, y: yTop })
  pb.lineTo({ x: a - sh, y: yEnd })
  pb.lineTo({ x: sh, y: yEnd })
  pb.lineTo({ x: 0, y: yTop })
  pb.lineTo({ x: 0, y: yWall1 })
  pb.close()
  b.cut(pb.build(), 'taşıyıcı çevresi')

  b.panel({ id: 'platform', name: 'platform', label: T('Bardak platformu', 'Cup platform'), outline: rectPoints(0, yPlat, a, bW), role: 'bottom' })
  b.root('platform')
  b.panel({ id: 'wall-front', name: 'wall-front', label: T('Ön duvar', 'Front wall'), outline: rectPoints(0, yWall1, a, c), role: 'wall' })
  b.fold({ parent: 'platform', child: 'wall-front', ...foldHorizontal(yPlat, 0, a, 'below') })
  b.panel({ id: 'wall-back', name: 'wall-back', label: T('Arka duvar', 'Back wall'), outline: rectPoints(0, yWall2, a, c), role: 'wall' })
  b.fold({ parent: 'platform', child: 'wall-back', ...foldHorizontal(yWall2, 0, a, 'above') })
  const strapAngle = 90 - (Math.atan2(bW / 2, handleH) * 180) / Math.PI
  b.panel({ id: 'handle-front', name: 'handle-front', label: T('Ön tutamak', 'Front handle'), outline: [{ x: 0, y: yWall1 }, { x: sh, y: y0 }, { x: a - sh, y: y0 }, { x: a, y: yWall1 }], role: 'lid', printable: true })
  b.fold({ parent: 'wall-front', child: 'handle-front', ...foldHorizontal(yWall1, 0, a, 'below', strapAngle) })
  b.panel({ id: 'handle-back', name: 'handle-back', label: T('Arka tutamak', 'Back handle'), outline: [{ x: 0, y: yTop }, { x: a, y: yTop }, { x: a - sh, y: yEnd }, { x: sh, y: yEnd }], role: 'lid', printable: true })
  b.fold({ parent: 'wall-back', child: 'handle-back', ...foldHorizontal(yTop, 0, a, 'above', strapAngle) })
  const holeW = Math.min(a * 0.5, 90)
  const holeH = Math.min(handleH * 0.3, 24)
  if (holeW >= 30 && holeH >= 8) {
    b.cut(stadiumPath({ x: a / 2, y: y0 + handleH * 0.4 }, holeW, holeH), 'el deliği')
    b.cut(stadiumPath({ x: a / 2, y: yEnd - handleH * 0.4 }, holeW, holeH), 'el deliği')
  }
  // Bardak delikleri: tek sıra
  const pitch = a / cups
  const dia = cupDia > 0 ? cupDia : Math.min(pitch * 0.8, bW * 0.8)
  if (dia >= 10) for (let i = 0; i < cups; i++) b.cut(circlePath({ x: pitch * (i + 0.5), y: yPlat + bW / 2 }, dia / 2), 'bardak deliği')
  else b.warn('cup-hole-small', 'warning', 'Bardak deliği çok küçük; delik atlandı.', 'Cup hole too small; skipped.')
  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, a + 2 * bleed, yEnd + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Tabla / kitap kılıfı — iki kapak, sırt, içe dönen kanatlar (becf-12504)
// ---------------------------------------------------------------------------

function buildBoardWrap(spec: TagWrapSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const spine = num(params, 'spine')
  const wing = num(params, 'wing')
  const r = num(params, 'cornerRadius')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const xs = [0, wing, wing + a, wing + a + spine, wing + 2 * a + spine, 2 * wing + 2 * a + spine]
  const total = xs[5] as number
  b.cut(roundedRect(0, 0, total, bW, r).build(), 'kılıf çevresi')
  const names: [string, I18nText, 'wall' | 'flap'][] = [
    ['wing-left', T('Sol iç kanat', 'Left inner wing'), 'flap'],
    ['cover-front', T('Ön kapak', 'Front cover'), 'wall'],
    ['spine', T('Sırt', 'Spine'), 'wall'],
    ['cover-back', T('Arka kapak', 'Back cover'), 'wall'],
    ['wing-right', T('Sağ iç kanat', 'Right inner wing'), 'flap'],
  ]
  names.forEach(([id, label, role], i) => {
    b.panel({ id, name: id, label, outline: rectPoints(xs[i] as number, 0, (xs[i + 1] as number) - (xs[i] as number), bW), role, printable: role === 'wall' })
  })
  b.root('cover-front')
  b.fold({ parent: 'cover-front', child: 'wing-left', ...foldVertical(xs[1] as number, 0, bW, 'left', 180) })
  b.fold({ parent: 'cover-front', child: 'spine', ...foldVertical(xs[2] as number, 0, bW, 'right') })
  b.fold({ parent: 'spine', child: 'cover-back', ...foldVertical(xs[3] as number, 0, bW, 'right') })
  b.fold({ parent: 'cover-back', child: 'wing-right', ...foldVertical(xs[4] as number, 0, bW, 'right', 180) })
  if (bool(params, 'thumbNotch')) {
    const nr = Math.min(12, bW * 0.1)
    b.cut(stadiumPath({ x: (xs[1] as number) + a * 0.5, y: bW / 2 }, nr * 2.4, nr), 'tutma oyuğu')
  }
  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, total + 2 * bleed, bW + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Parametreler + spec tablosu
// ---------------------------------------------------------------------------

const P = (key: string, tr: string, en: string, def: number, min: number, max: number, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ kind: 'number', key, label: { tr, en }, unit: 'mm', min, max, step: 0.5, default: def, group: 'dimensions', ...extra }) as ParamDef
const caliperP = (c: number): ParamDef => ({ kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: c, group: 'material' })
const bleedP: ParamDef = { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 2, advanced: true, group: 'prepress' }
const holeP = (def: 'euroslot' | 'round' | 'none'): ParamDef => ({
  kind: 'enum',
  key: 'hole',
  label: { tr: 'Askı deliği', en: 'Hang hole' },
  default: def,
  group: 'options',
  options: [
    { value: 'euroslot', label: { tr: 'Euroslot', en: 'Euroslot' } },
    { value: 'round', label: { tr: 'Yuvarlak', en: 'Round' } },
    { value: 'none', label: { tr: 'Yok', en: 'None' } },
  ],
})

const paramsFor = (spec: TagWrapSpec): ParamDef[] => {
  const d = dctDims(spec)
  const cal = spec.materials.includes('corrugated') ? 1.5 : 0.5
  switch (spec.kind) {
    case 'tag-rect':
      return [P('length', 'Genişlik (a)', 'Width (a)', d.a, 20, 400), P('height', 'Yükseklik (b)', 'Height (b)', d.b, 20, 500), caliperP(cal), holeP(spec.hole ?? 'euroslot'), P('cornerRadius', 'Köşe yarıçapı (r)', 'Corner radius (r)', 5, 0, 40, { advanced: true, group: 'construction' } as Partial<ParamDef>), bleedP]
    case 'tag-circle':
      return [P('length', 'Çap (a)', 'Diameter (a)', d.a, 20, 400), caliperP(cal), holeP('round'), bleedP]
    case 'tag-oval':
      return [P('length', 'Genişlik (a)', 'Width (a)', d.a, 20, 400), P('height', 'Yükseklik (b)', 'Height (b)', d.b > 0 ? d.b : d.a * 1.6, 20, 500), caliperP(cal), holeP('round'), bleedP]
    case 'tag-folded':
      return [P('length', 'Genişlik (a)', 'Width (a)', d.a, 20, 400), P('height', 'Panel yüksekliği (b)', 'Panel height (b)', d.b, 20, 400), caliperP(cal), holeP('euroslot'), P('cornerRadius', 'Köşe yarıçapı (r)', 'Corner radius (r)', 5, 0, 40, { advanced: true, group: 'construction' } as Partial<ParamDef>), bleedP]
    case 'sleeve-lock':
      return [P('length', 'Uzunluk (a)', 'Length (a)', d.a, 30, 800), P('width', 'Derinlik (b)', 'Depth (b)', d.b, 8, 400), P('height', 'Yükseklik (c)', 'Height (c)', d.c, 15, 600), caliperP(cal), bleedP]
    case 'cup-carrier':
      return [
        P('length', 'Uzunluk (a)', 'Length (a)', d.a * 3, 60, 800),
        P('width', 'Genişlik (b)', 'Width (b)', d.b, 30, 400),
        P('height', 'Duvar yüksekliği (c)', 'Wall height (c)', d.c, 10, 300),
        { kind: 'number', key: 'cups', label: { tr: 'Bardak sayısı', en: 'Cup count' }, min: 1, max: 6, step: 1, default: 3, group: 'dimensions' },
        P('cupDiameter', 'Bardak delik çapı', 'Cup hole diameter', 0, 0, 200, { autoWhenZero: true, advanced: true, group: 'construction' } as Partial<ParamDef>),
        caliperP(cal),
        bleedP,
      ]
    case 'board-wrap':
      return [
        P('length', 'Kapak genişliği (a)', 'Cover width (a)', Math.round(d.a / 2.4), 40, 800),
        P('width', 'Yükseklik (b)', 'Height (b)', d.b, 40, 800),
        P('spine', 'Sırt (c)', 'Spine (c)', 20, 2, 200),
        P('wing', 'İç kanat (x1)', 'Inner wing (x1)', Math.round(d.a / 6), 0, 400),
        caliperP(cal),
        { kind: 'boolean', key: 'thumbNotch', label: { tr: 'Tutma oyuğu', en: 'Thumb notch' }, default: false, group: 'options' },
        P('cornerRadius', 'Köşe yarıçapı (r)', 'Corner radius (r)', 6, 0, 40, { advanced: true, group: 'construction' } as Partial<ParamDef>),
        bleedP,
      ]
  }
}

const build = (spec: TagWrapSpec, params: Record<string, ParamValue>): Dieline => {
  switch (spec.kind) {
    case 'sleeve-lock':
      return buildSleeveLock(spec, params)
    case 'cup-carrier':
      return buildCupCarrier(spec, params)
    case 'board-wrap':
      return buildBoardWrap(spec, params)
    default:
      return buildTag(spec, params)
  }
}

export const tagWrapTemplate = (spec: TagWrapSpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: spec.standard,
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, spec.code.toLowerCase(), ...spec.dct].filter(Boolean),
  params: paramsFor(spec),
  build: (params) => build(spec, params),
})

export const TAG_WRAP_SPECS: readonly TagWrapSpec[] = [
  {
    id: 'ecma-f80-51-euroslot',
    code: 'F80.51.00.00',
    standard: 'ECMA',
    dct: ['becf-12701'],
    name: T('Askılı etiket, euroslot', 'Hang tag with euroslot'),
    description: T('Yuvarlatılmış köşeli dikdörtgen etiket; sombrero (euroslot) askı deliği.', 'Rounded rectangle tag with a sombrero (euroslot) hang hole.'),
    keywords: ['etiket', 'tag', 'euroslot', 'askı', 'f80.51'],
    category: 'tags',
    materials: ['carton'],
    kind: 'tag-rect',
    hole: 'euroslot',
  },
  {
    id: 'ecma-f80-51-hole',
    code: 'F80.51.00.00',
    standard: 'ECMA',
    dct: ['becf-12702'],
    name: T('Askılı etiket, yuvarlak delik', 'Hang tag with round hole'),
    description: T('Yuvarlatılmış köşeli dikdörtgen etiket; ip için yuvarlak delik.', 'Rounded rectangle tag with a round string hole.'),
    keywords: ['etiket', 'tag', 'ip', 'string', 'f80.51'],
    category: 'tags',
    materials: ['carton'],
    kind: 'tag-rect',
    hole: 'round',
  },
  {
    id: 'tag-circle',
    code: 'F80.51.00.00',
    standard: 'ECMA',
    dct: ['becf-12704'],
    name: T('Yuvarlak etiket', 'Round tag'),
    description: T('Daire etiket; üstte ip deliği.', 'Circular tag with a string hole at the top.'),
    keywords: ['etiket', 'tag', 'yuvarlak', 'round', 'daire'],
    category: 'tags',
    materials: ['carton'],
    kind: 'tag-circle',
  },
  {
    id: 'tag-oval',
    code: 'F80.51.00.00',
    standard: 'ECMA',
    dct: ['becf-12705'],
    name: T('Oval etiket', 'Oval tag'),
    description: T('Elips etiket; üstte ip deliği.', 'Elliptical tag with a string hole at the top.'),
    keywords: ['etiket', 'tag', 'oval', 'elips'],
    category: 'tags',
    materials: ['carton'],
    kind: 'tag-oval',
  },
  {
    id: 'ecma-f80-52',
    code: 'F80.52.00.00',
    standard: 'ECMA',
    dct: ['becf-12706'],
    name: T('Katlanır etiket', 'Folded tag'),
    description: T('İki panel ortadan katlanır; askı delikleri katlanınca hizalanır. Header kartı / fiyat etiketi.', 'Two panels folded at the middle; hang holes align when folded. Header card / price tag.'),
    keywords: ['etiket', 'tag', 'katlanır', 'folded', 'header', 'f80.52'],
    category: 'tags',
    materials: ['carton'],
    kind: 'tag-folded',
  },
  {
    id: 'sleeve-tuck-lock',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12502'],
    name: T('Dil kilitli kılıf', 'Tuck-lock sleeve'),
    description: T('Dört panelli sargı kılıf; yapıştırma yerine kilit dili ön paneldeki yarığa girer.', 'Four-panel wrap sleeve closed by a lock tab into a slit on the front panel instead of glue.'),
    keywords: ['kılıf', 'sleeve', 'sargı', 'kilit dili', 'yapıştırmasız'],
    category: 'wrap-around-labels',
    materials: ['carton'],
    kind: 'sleeve-lock',
  },
  {
    id: 'cup-carrier-wrap',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12503'],
    name: T('Bardak taşıyıcı sargısı', 'Cup carrier wrap'),
    description: T('Delikli platform, iki kısa duvar ve el delikli tutamak panelleri; tek parça bardak taşıyıcı.', 'Perforated platform, two short walls and hand-hole handle panels; one-piece cup carrier.'),
    keywords: ['bardak', 'cup', 'taşıyıcı', 'carrier', 'kahve', 'sargı'],
    category: 'wrap-around-labels',
    materials: ['carton'],
    kind: 'cup-carrier',
  },
  {
    id: 'board-wrap-cover',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12504'],
    name: T('Tabla / kitap kılıfı', 'Board wrap cover'),
    description: T('Ön-arka kapak, sırt ve içe dönen kanatlar; yuvarlatılmış köşeler. Menü, tabla ve kitap sargısı.', 'Front and back covers, spine and inward wings with rounded corners. Menu, board and book wraps.'),
    keywords: ['kılıf', 'wrap', 'kapak', 'cover', 'sırt', 'menü'],
    category: 'wrap-around-labels',
    materials: ['carton'],
    kind: 'board-wrap',
  },
]

export const tagWrapTemplates: TemplateDefinition[] = TAG_WRAP_SPECS.map(tagWrapTemplate)
