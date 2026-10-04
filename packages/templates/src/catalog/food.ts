import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { emitProfile, foldDiagonal, foldHorizontal, foldVertical, girthLayout, glueFlapProfile, profileToPolygon, reverseProfile, tuckFlapProfile } from '../features.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Gıda kutuları — tepsi ailesine sığmayan özel formlar (DCT food-boxes):
 * konik kutu, bardak sargısı, körüklü uçlu taşıma kutusu, patates kızartması
 * külahı ve sandviç kaması.
 */

type Pt = Point
const T = (tr: string, en: string): I18nText => ({ tr, en })
const CARTON: MaterialKind[] = ['carton']

interface FoodSpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  params: ParamDef[]
  build: (params: Record<string, ParamValue>, spec: FoodSpec) => Dieline
}

const P = {
  n: (key: string, tr: string, en: string, def: number, min: number, max: number, group: ParamDef['group'] = 'dimensions', advanced = false): ParamDef => ({
    kind: 'number',
    key,
    label: { tr, en },
    unit: 'mm',
    min,
    max,
    step: 0.5,
    default: def,
    group,
    ...(advanced ? { advanced: true } : {}),
  }),
  caliper: (def = 0.5): ParamDef => ({ kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: def, group: 'material' }),
  bleed: (): ParamDef => ({ kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' }),
}

const poly = (b: PathBuilder, pts: Pt[]): void => {
  b.moveTo(pts[0] as Pt)
  for (let i = 1; i < pts.length; i++) b.lineTo(pts[i] as Pt)
}

const bezierPts = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, n = 10): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    })
  }
  return out
}

const bounds = (pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } => ({
  minX: Math.min(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxX: Math.max(...pts.map((p) => p.x)),
  maxY: Math.max(...pts.map((p) => p.y)),
})

const bleedGuide = (b: DielineBuilder, pts: Pt[], bleed: number): void => {
  if (bleed <= 0) return
  const r = bounds(pts)
  b.guide('bleed', rectPath(r.minX - bleed, r.minY - bleed, r.maxX - r.minX + 2 * bleed, r.maxY - r.minY + 2 * bleed), 'taşma payı')
}

const meta = (spec: FoodSpec, caliper: number) => ({
  name: spec.name,
  ...(spec.standard === 'ECMA' ? { ecma: spec.code } : spec.standard === 'FEFCO' ? { fefco: spec.code } : {}),
  caliper,
  glueFlapSide: 'none' as const,
})

// ---------------------------------------------------------------------------
// 1) Konik kutu (D10.20) — üst ağız tabandan geniş, köşe yapıştırma kulakları,
//    arka duvardan dilli kapak.
// ---------------------------------------------------------------------------

function buildTapered(params: Record<string, ParamValue>, spec: FoodSpec): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const S = Math.max(0, num(params, 'splay'))
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const withLid = spec.id !== 'food-tapered-open'
  const lidFront = withLid ? Math.max(8, Math.min(H * 0.35, 30)) : 0
  const tuckDepth = withLid ? Math.max(10, Math.min(lidFront * 1.2, 30)) : 0

  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(0.8, caliper)
  const len = Math.hypot(S, H)
  const wallDeg = 90 - (Math.atan2(S, H) * 180) / Math.PI
  // Kulak genişliği ve dış uçta daralma (yan duvarın eğik kenarını kesmesin)
  const f = Math.min(H * 0.6, 20)
  const wedge = Math.PI / 2 - 2 * Math.atan2(S, H)
  const wTip = Math.max(0.6, Math.min(f * 0.5, gap * 2 * Math.tan(Math.max(0.05, wedge)) * 0.9))

  // Ön/arka duvarın eğik kenarına kulak: kenar (a→b), dışa normal n
  const flap = (a: Pt, bb: Pt, outward: 1 | -1): Pt[] => {
    const dx = (bb.x - a.x) / len
    const dy = (bb.y - a.y) / len
    const n = { x: -dy * outward, y: dx * outward }
    // n, taban dışına (±x) bakmalı
    const sx = Math.sign(bb.x - a.x) || 1
    if (Math.sign(n.x) !== sx) {
      n.x = -n.x
      n.y = -n.y
    }
    const p0 = { x: a.x + dx * gap * 2, y: a.y + dy * gap * 2 }
    return [p0, bb, { x: bb.x + n.x * f, y: bb.y + n.y * f }, { x: p0.x + n.x * wTip, y: p0.y + n.y * wTip }]
  }
  const fFR = flap({ x: L, y: 0 }, { x: L + S, y: -H }, 1)
  const fFL = flap({ x: 0, y: 0 }, { x: -S, y: -H }, -1)
  const fBR = flap({ x: L, y: W }, { x: L + S, y: W + H }, 1)
  const fBL = flap({ x: 0, y: W }, { x: -S, y: W + H }, -1)

  // Dış hat (saat yönünün tersi, önden başlar)
  const pts: Pt[] = []
  pts.push(fFL[3] as Pt, fFL[2] as Pt, { x: -S, y: -H }, { x: L + S, y: -H }, fFR[2] as Pt, fFR[3] as Pt, { x: L, y: 0 })
  pts.push({ x: L + H, y: -S }, { x: L + H, y: W + S }, { x: L, y: W })
  pts.push(fBR[3] as Pt, fBR[2] as Pt)
  const lidY0 = W + H
  const lidW = W + 2 * S
  const lidY1 = lidY0 + lidW
  const lidFrontY = lidY1 + lidFront
  let tuck: ReturnType<typeof tuckFlapProfile> | null = null
  const outline = new PathBuilder()
  if (withLid) {
    pts.push({ x: L + S, y: lidY0 }, { x: L + S, y: lidFrontY })
    poly(outline, pts)
    tuck = tuckFlapProfile({ x1: -S, x2: L + S, y: lidFrontY, direction: 1, depth: tuckDepth, clearance: Math.max(0.5, caliper), cornerRadius: 4 })
    emitProfile(outline, reverseProfile(tuck))
    outline.lineTo({ x: -S, y: lidY0 })
  } else {
    pts.push({ x: L + S, y: lidY0 }, { x: -S, y: lidY0 })
    poly(outline, pts)
  }
  const rest: Pt[] = [fBL[2] as Pt, fBL[3] as Pt, { x: 0, y: W }, { x: -H, y: W + S }, { x: -H, y: -S }, { x: 0, y: 0 }]
  for (const p of rest) outline.lineTo(p)
  outline.close()
  b.cut(outline.build(), 'konik kutu çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: T('Ön duvar', 'Front wall'), outline: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L + S, y: -H }, { x: -S, y: -H }], role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below', wallDeg) })
  b.panel({ id: 'back', name: 'back', label: T('Arka duvar', 'Back wall'), outline: [{ x: 0, y: W }, { x: L, y: W }, { x: L + S, y: W + H }, { x: -S, y: W + H }], role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above', wallDeg) })
  b.panel({ id: 'left', name: 'left', label: T('Sol duvar', 'Left wall'), outline: [{ x: 0, y: 0 }, { x: 0, y: W }, { x: -H, y: W + S }, { x: -H, y: -S }], role: 'wall' })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left', wallDeg) })
  b.panel({ id: 'right', name: 'right', label: T('Sağ duvar', 'Right wall'), outline: [{ x: L, y: 0 }, { x: L, y: W }, { x: L + H, y: W + S }, { x: L + H, y: -S }], role: 'wall' })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right', wallDeg) })

  const corners: [string, string, Pt[]][] = [
    ['corner-fr', 'front', fFR],
    ['corner-fl', 'front', fFL],
    ['corner-br', 'back', fBR],
    ['corner-bl', 'back', fBL],
  ]
  for (const [id, parent, o] of corners) {
    b.panel({ id, name: id, label: T('Köşe kulağı', 'Corner flap'), outline: o, role: 'glue', printable: false })
    b.fold({ parent, child: id, ...foldDiagonal(o[0] as Pt, o[1] as Pt, 90) })
  }

  if (withLid && tuck) {
    b.panel({ id: 'lid', name: 'lid', label: T('Kapak', 'Lid'), outline: rectPoints(-S, lidY0, L + 2 * S, lidW), role: 'lid' })
    b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(lidY0, -S, L + S, 'above', 180 - wallDeg) })
    b.panel({ id: 'lid-front', name: 'lid-front', label: T('Kapak önü', 'Lid front'), outline: rectPoints(-S, lidY1, L + 2 * S, lidFront), role: 'wall' })
    b.fold({ parent: 'lid', child: 'lid-front', ...foldHorizontal(lidY1, -S, L + S, 'above') })
    b.panel({ id: 'lid-tuck', name: 'lid-tuck', label: T('Kapak dili', 'Lid tuck'), outline: profileToPolygon(tuck), role: 'flap', printable: false })
    b.fold({ parent: 'lid-front', child: 'lid-tuck', ...foldHorizontal(lidFrontY, -S, L + S, 'above') })
  }

  bleedGuide(b, [...pts, ...rest, { x: 0, y: withLid ? lidFrontY + tuckDepth : lidY0 }], bleed)
  if (S > H * 0.6) b.warn('splay-too-wide', 'warning', 'Açılma duvar yüksekliğine göre çok büyük; köşe kulakları daralır.', 'Splay is large relative to the wall height; corner flaps get very narrow.')
  return b.build()
}

// ---------------------------------------------------------------------------
// 2) Bardak sargısı — kesik koni açınımı (yay şerit), yapıştırma dili ve
//    üstte içe katlanan taç yaprakları.
// ---------------------------------------------------------------------------

function buildCupWrap(params: Record<string, ParamValue>, spec: FoodSpec): Dieline {
  const top = num(params, 'topDiameter')
  const bottom = num(params, 'bottomDiameter')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const petalH = num(params, 'petalHeight')
  const petals = Math.max(0, Math.round(num(params, 'petals')))
  const glue = num(params, 'glueTab')

  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const big = Math.max(top, bottom)
  const small = Math.min(top, bottom)
  const diff = Math.max(0.5, big - small)
  const slant = Math.hypot(H, diff / 2)
  const R1 = (slant * small) / diff
  const R2 = R1 + slant
  const theta = (Math.PI * small) / R1
  const a0 = Math.PI / 2 - theta / 2
  const a1 = Math.PI / 2 + theta / 2
  const at = (r: number, a: number): Pt => ({ x: r * Math.cos(a), y: r * Math.sin(a) })
  const n = 48

  const pts: Pt[] = []
  // İç yay (taban ağzı) soldan sağa
  for (let i = 0; i <= n; i++) pts.push(at(R1, a1 - (theta * i) / n))
  // Yapıştırma dili (sağ radyal kenar boyunca dışarı)
  const tanR = { x: Math.cos(a0 - Math.PI / 2), y: Math.sin(a0 - Math.PI / 2) }
  const g = Math.max(4, glue)
  const inset = Math.min(3, g * 0.4)
  pts.push({ x: R1 * Math.cos(a0) + tanR.x * g + inset * Math.cos(a0), y: R1 * Math.sin(a0) + tanR.y * g + inset * Math.sin(a0) })
  pts.push({ x: R2 * Math.cos(a0) + tanR.x * g - inset * Math.cos(a0), y: R2 * Math.sin(a0) + tanR.y * g - inset * Math.sin(a0) })
  // Dış yay sağdan sola — yapraklı
  const petalPts: Pt[][] = []
  if (petals > 0 && petalH > 0) {
    const slot = theta / petals
    const notch = Math.min(slot * 0.08, 2 / R2)
    for (let k = 0; k < petals; k++) {
      const s0 = a0 + slot * k + notch / 2
      const s1 = a0 + slot * (k + 1) - notch / 2
      const one: Pt[] = []
      const m = 10
      for (let i = 0; i <= m; i++) {
        const a = s0 + ((s1 - s0) * i) / m
        const bump = Math.sin((Math.PI * i) / m)
        one.push(at(R2 + petalH * bump, a))
      }
      petalPts.push(one)
      pts.push(at(R2, s0), ...one, at(R2, s1))
    }
    pts.push(at(R2, a1))
  } else {
    for (let i = 0; i <= n; i++) pts.push(at(R2, a0 + (theta * i) / n))
  }
  const outline = new PathBuilder()
  poly(outline, pts)
  outline.close()
  b.cut(outline.build(), 'sargı çevresi')

  // Gövde paneli (yay şerit): iç yay + dış yay
  const body: Pt[] = []
  for (let i = 0; i <= n; i++) body.push(at(R1, a1 - (theta * i) / n))
  for (let i = 0; i <= n; i++) body.push(at(R2, a0 + (theta * i) / n))
  b.panel({ id: 'body', name: 'body', label: T('Gövde (koni açınımı)', 'Body (cone development)'), outline: body, role: 'wall' })
  b.root('body')
  const tab: Pt[] = [at(R1, a0), pts[n + 1] as Pt, pts[n + 2] as Pt, at(R2, a0)]
  b.panel({ id: 'glue-tab', name: 'glue-tab', label: T('Yapıştırma dili', 'Glue tab'), outline: tab, role: 'glue', printable: false })
  b.fold({ parent: 'body', child: 'glue-tab', ...foldDiagonal(at(R1, a0), at(R2, a0), 0) })
  b.guide('glue', [...new PathBuilder().moveTo(tab[0] as Pt).lineTo(tab[1] as Pt).lineTo(tab[2] as Pt).lineTo(tab[3] as Pt).close().build()], 'yapıştırma alanı')
  petalPts.forEach((one, k) => {
    const id = `petal-${k + 1}`
    const base0 = at(R2, a0 + (theta / petals) * k)
    const base1 = at(R2, a0 + (theta / petals) * (k + 1))
    b.panel({ id, name: id, label: T('Taç yaprağı', 'Petal'), outline: [base0, ...one, base1], role: 'flap', printable: false })
    b.fold({ parent: 'body', child: id, ...foldDiagonal(base0, base1, 100) })
  })
  b.creaseLine(at(R1, a0), at(R2, a0), 'yapıştırma dili kırımı')

  bleedGuide(b, pts, bleed)
  if (top === bottom) b.warn('cylinder', 'info', 'Üst ve alt çap eşit; sargı düz şerittir.', 'Top and bottom diameters are equal; the wrap is a straight band.')
  return b.build()
}

// ---------------------------------------------------------------------------
// 3) Körüklü uçlu taşıma kutusu — dört gövde paneli, dar panellerde 45°
//    körüklü uç kanatları, geniş panellerde dilli kapak kanatları.
// ---------------------------------------------------------------------------

function buildGussetCarton(params: Record<string, ParamValue>, spec: FoodSpec): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const glueW = num(params, 'glueFlap')
  const tuckIn = num(params, 'tuckDepth')

  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(0.8, caliper)
  const D = W / 2 // uç kanat derinliği
  const tuck = tuckIn > 0 ? tuckIn : Math.max(8, Math.min(D * 0.7, 25))
  const cols = girthLayout([L, W, L, W])
  const [c0, c1, c2, c3] = cols as [typeof cols[0], typeof cols[0], typeof cols[0], typeof cols[0]]
  const xEnd = c3.x2

  const outline = new PathBuilder()
  // Alt kenar (y = -D … 0) soldan sağa: ön kanat (dilli), körük, arka kanat, körük
  const majorDown = (c: { x1: number; x2: number }, withTuck: boolean): void => {
    if (withTuck) {
      const prof = tuckFlapProfile({ x1: c.x1 + gap, x2: c.x2 - gap, y: -D, direction: -1, depth: tuck, clearance: Math.max(0.5, caliper), cornerRadius: 4 })
      outline.lineTo({ x: c.x1 + gap, y: 0 })
      emitProfile(outline, prof)
      outline.lineTo({ x: c.x2 - gap, y: 0 })
    } else {
      outline.lineTo({ x: c.x1 + gap, y: 0 }).lineTo({ x: c.x1 + gap, y: -D }).lineTo({ x: c.x2 - gap, y: -D }).lineTo({ x: c.x2 - gap, y: 0 })
    }
  }
  const majorUp = (c: { x1: number; x2: number }, withTuck: boolean): void => {
    if (withTuck) {
      const prof = tuckFlapProfile({ x1: c.x1 + gap, x2: c.x2 - gap, y: H + D, direction: 1, depth: tuck, clearance: Math.max(0.5, caliper), cornerRadius: 4 })
      outline.lineTo({ x: c.x2 - gap, y: H })
      emitProfile(outline, reverseProfile(prof))
      outline.lineTo({ x: c.x1 + gap, y: H })
    } else {
      outline.lineTo({ x: c.x2 - gap, y: H }).lineTo({ x: c.x2 - gap, y: H + D }).lineTo({ x: c.x1 + gap, y: H + D }).lineTo({ x: c.x1 + gap, y: H })
    }
  }
  outline.moveTo({ x: 0, y: 0 })
  majorDown(c0, true)
  outline.lineTo({ x: c1.x1, y: 0 }).lineTo({ x: c1.x1, y: -D }).lineTo({ x: c1.x2, y: -D }).lineTo({ x: c1.x2, y: 0 })
  majorDown(c2, false)
  outline.lineTo({ x: c3.x1, y: 0 }).lineTo({ x: c3.x1, y: -D }).lineTo({ x: c3.x2, y: -D }).lineTo({ x: c3.x2, y: 0 })
  // Yapıştırma payı
  const gl = glueFlapProfile(xEnd, xEnd + glueW, 0, H, Math.min(6, glueW * 0.6))
  for (const p of gl) outline.lineTo(p)
  // Üst kenar sağdan sola
  outline.lineTo({ x: c3.x2, y: H }).lineTo({ x: c3.x2, y: H + D }).lineTo({ x: c3.x1, y: H + D }).lineTo({ x: c3.x1, y: H })
  majorUp(c2, false)
  outline.lineTo({ x: c1.x2, y: H }).lineTo({ x: c1.x2, y: H + D }).lineTo({ x: c1.x1, y: H + D }).lineTo({ x: c1.x1, y: H })
  majorUp(c0, true)
  outline.lineTo({ x: 0, y: H })
  outline.close()
  b.cut(outline.build(), 'kutu çevresi')

  // Gövde
  const names: [string, I18nText][] = [
    ['front', T('Ön', 'Front')],
    ['right', T('Sağ yan', 'Right side')],
    ['back', T('Arka', 'Back')],
    ['left', T('Sol yan', 'Left side')],
  ]
  cols.forEach((c, i) => {
    const [id, label] = names[i] as [string, I18nText]
    b.panel({ id, name: id, label, outline: rectPoints(c.x1, 0, c.width, H), role: 'wall' })
    if (i === 0) b.root(id)
    else b.fold({ parent: (names[i - 1] as [string, I18nText])[0], child: id, ...foldVertical(c.x1, 0, H, 'right') })
  })
  b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma payı', 'Glue flap'), outline: gl, role: 'glue', printable: false })
  b.fold({ parent: 'left', child: 'glue', ...foldVertical(xEnd, 0, H, 'right') })
  b.guide('glue', rectPath(0, 0, Math.min(glueW, L * 0.3), H), 'yapıştırma alanı')

  // Geniş panel kanatları
  const major = (c: { x1: number; x2: number; width: number }, parent: string, side: 'top' | 'bottom', withTuck: boolean): void => {
    const id = `${parent}-${side}`
    const y0 = side === 'top' ? H : -D
    b.panel({ id, name: id, label: T(side === 'top' ? 'Üst kanat' : 'Alt kanat', side === 'top' ? 'Top flap' : 'Bottom flap'), outline: rectPoints(c.x1 + gap, y0, c.width - 2 * gap, D), role: 'flap' })
    b.fold({ parent, child: id, ...foldHorizontal(side === 'top' ? H : 0, c.x1 + gap, c.x2 - gap, side === 'top' ? 'above' : 'below') })
    if (withTuck) {
      const y = side === 'top' ? H + D : -D
      const prof = tuckFlapProfile({ x1: c.x1 + gap, x2: c.x2 - gap, y, direction: side === 'top' ? 1 : -1, depth: tuck, clearance: Math.max(0.5, caliper), cornerRadius: 4 })
      b.panel({ id: `${id}-tuck`, name: `${id}-tuck`, label: T('Dil', 'Tuck'), outline: profileToPolygon(prof), role: 'flap', printable: false })
      b.fold({ parent: id, child: `${id}-tuck`, ...foldHorizontal(y, c.x1 + gap, c.x2 - gap, side === 'top' ? 'above' : 'below') })
    }
  }
  major(c0, 'front', 'top', true)
  major(c0, 'front', 'bottom', true)
  major(c2, 'back', 'top', false)
  major(c2, 'back', 'bottom', false)

  // Dar panel körükleri: orta üçgen + iki yan üçgen (180° geri katlanır)
  const gusset = (c: { x1: number; x2: number }, parent: string, side: 'top' | 'bottom'): void => {
    const yBase = side === 'top' ? H : 0
    const yFar = side === 'top' ? H + D : -D
    const mid = { x: (c.x1 + c.x2) / 2, y: yFar }
    const a = { x: c.x1, y: yBase }
    const bb = { x: c.x2, y: yBase }
    const center = `${parent}-${side}-gusset`
    b.panel({ id: center, name: center, label: T('Uç körüğü', 'End gusset'), outline: [a, bb, mid], role: 'gusset', printable: false })
    b.fold({ parent, child: center, ...foldHorizontal(yBase, c.x1, c.x2, side === 'top' ? 'above' : 'below') })
    const wingL = `${center}-l`
    const wingR = `${center}-r`
    b.panel({ id: wingL, name: wingL, label: T('Körük kanadı', 'Gusset wing'), outline: [a, mid, { x: c.x1, y: yFar }], role: 'glue', printable: false })
    b.fold({ parent: center, child: wingL, ...foldDiagonal(a, mid, 180) })
    b.panel({ id: wingR, name: wingR, label: T('Körük kanadı', 'Gusset wing'), outline: [bb, { x: c.x2, y: yFar }, mid], role: 'glue', printable: false })
    b.fold({ parent: center, child: wingR, ...foldDiagonal(bb, mid, -180) })
    b.creaseLine(a, mid, 'körük çaprazı')
    b.creaseLine(bb, mid, 'körük çaprazı')
  }
  gusset(c1, 'right', 'top')
  gusset(c1, 'right', 'bottom')
  gusset(c3, 'left', 'top')
  gusset(c3, 'left', 'bottom')

  bleedGuide(b, [{ x: 0, y: -D - tuck }, { x: xEnd + glueW, y: H + D + tuck }], bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 4) Patates kızartması külahı — taban, kavisli üstlü ön/arka duvar, yanlarda
//    çapraz bölünmüş iki üçgenden oluşan yan duvarlar.
// ---------------------------------------------------------------------------

function buildFryScoop(params: Record<string, ParamValue>, spec: FoodSpec): Dieline {
  const A = num(params, 'length')
  const B = num(params, 'width')
  const C = num(params, 'height')
  const frontRatio = num(params, 'frontRatio') / 100
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const h2 = C
  const h1 = Math.max(10, Math.min(C - 5, C * frontRatio))
  const bulge = Math.min(A * 0.18, 18)

  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  // Kavis köşelerden küçük bir düz parçayla başlar; yan üçgen kenarına oyuk açmasın.
  const e = Math.min(8, A * 0.1)
  const frontCurve = [{ x: 0, y: -h1 }, ...bezierPts({ x: e, y: -h1 }, { x: A * 0.3, y: -h1 - bulge * 1.33 }, { x: A * 0.7, y: -h1 - bulge * 1.33 }, { x: A - e, y: -h1 }), { x: A, y: -h1 }]
  const backCurve = [{ x: A, y: B + h2 }, ...bezierPts({ x: A - e, y: B + h2 }, { x: A * 0.7, y: B + h2 + bulge * 1.33 }, { x: A * 0.3, y: B + h2 + bulge * 1.33 }, { x: e, y: B + h2 }), { x: 0, y: B + h2 }]

  // Ön yan üçgenlerin sivri ucu köreltilir (bıçak ömrü + kenar oyuğu önlenir)
  const blunt = (tip: Pt, a: Pt, c: Pt, d = 9): Pt[] => {
    const to = (q: Pt): Pt => {
      const l = Math.hypot(q.x - tip.x, q.y - tip.y)
      const k = Math.min(0.45, d / Math.max(l, 1e-6))
      return { x: tip.x + (q.x - tip.x) * k, y: tip.y + (q.y - tip.y) * k }
    }
    return [to(a), to(c)]
  }
  const tipL = blunt({ x: -B, y: -h2 }, { x: 0, y: 0 }, { x: 0, y: -h1 })
  const tipR = blunt({ x: A + B, y: -h2 }, { x: A, y: -h1 }, { x: A, y: 0 })
  const pts: Pt[] = [
    { x: 0, y: 0 },
    ...tipL,
    ...frontCurve,
    ...tipR,
    { x: A, y: 0 },
    { x: A, y: B },
    { x: A + B, y: B },
    ...backCurve,
    { x: -B, y: B },
    { x: 0, y: B },
  ]
  const outline = new PathBuilder()
  poly(outline, pts)
  outline.close()
  b.cut(outline.build(), 'külah çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, A, B), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: T('Ön duvar', 'Front wall'), outline: [{ x: 0, y: 0 }, { x: A, y: 0 }, ...[...frontCurve].reverse()], role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, A, 'below', 82) })
  b.panel({ id: 'back', name: 'back', label: T('Arka duvar', 'Back wall'), outline: [{ x: 0, y: B }, { x: A, y: B }, ...backCurve], role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(B, 0, A, 'above', 82) })

  // Yan üçgenler: ön duvara bağlı (alt-ön, üst-ön, üst-arka) ve arka duvara bağlı (alt-arka, üst-arka, alt-ön)
  const sides: [string, string, Pt[], ReturnType<typeof foldVertical>][] = [
    ['side-fl', 'front', [{ x: 0, y: 0 }, { x: 0, y: -h1 }, tipL[1] as Pt, tipL[0] as Pt], foldVertical(0, -h1, 0, 'left')],
    ['side-fr', 'front', [{ x: A, y: 0 }, tipR[1] as Pt, tipR[0] as Pt, { x: A, y: -h1 }], foldVertical(A, -h1, 0, 'right')],
    ['side-bl', 'back', [{ x: 0, y: B }, { x: -B, y: B }, { x: 0, y: B + h2 }], foldVertical(0, B, B + h2, 'left')],
    ['side-br', 'back', [{ x: A, y: B }, { x: A, y: B + h2 }, { x: A + B, y: B }], foldVertical(A, B, B + h2, 'right')],
  ]
  for (const [id, parent, o, fold] of sides) {
    b.panel({ id, name: id, label: T('Yan duvar üçgeni', 'Side triangle'), outline: o, role: id.startsWith('side-b') ? 'glue' : 'wall', printable: id.startsWith('side-f') })
    b.fold({ parent, child: id, ...fold })
  }
  bleedGuide(b, pts, bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 5) Sandviç kaması — dik yamuk kesitli kutu: alçak ön, yüksek arka, eğik kapak.
// ---------------------------------------------------------------------------

function buildWedge(params: Record<string, ParamValue>, spec: FoodSpec): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const h1 = num(params, 'frontHeight')
  const h2 = num(params, 'backHeight')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const Hb = Math.max(h2, h1 + 5)
  const slope = Math.hypot(W, Hb - h1)
  const tuckDepth = Math.max(8, Math.min(h1 * 0.8, 22))
  const f = Math.max(6, Math.min(14, h1 * 0.6))

  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(0.8, caliper)
  const lidY0 = W + Hb
  const lidY1 = lidY0 + slope
  const tuck = tuckFlapProfile({ x1: 0, x2: L, y: lidY1, direction: 1, depth: tuckDepth, clearance: Math.max(0.5, caliper), cornerRadius: 4 })

  // Uç panelleri (dik yamuk) + ön/arka kenarlarına yapıştırma kulakları
  const endL: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: W }, { x: -Hb, y: W }, { x: -h1, y: 0 }]
  const endR: Pt[] = [{ x: L, y: 0 }, { x: L + h1, y: 0 }, { x: L + Hb, y: W }, { x: L, y: W }]
  const flapFL: Pt[] = [{ x: -gap, y: 0 }, { x: -h1 + gap, y: 0 }, { x: -h1 + gap, y: -f + 2 }, { x: -h1 + gap + 2, y: -f }, { x: -gap - 2, y: -f }, { x: -gap, y: -f + 2 }]
  const flapFR: Pt[] = [{ x: L + gap, y: 0 }, { x: L + gap, y: -f + 2 }, { x: L + gap + 2, y: -f }, { x: L + h1 - gap - 2, y: -f }, { x: L + h1 - gap, y: -f + 2 }, { x: L + h1 - gap, y: 0 }]
  const flapBL: Pt[] = [{ x: -gap, y: W }, { x: -gap, y: W + f - 2 }, { x: -gap - 2, y: W + f }, { x: -Hb + gap + 2, y: W + f }, { x: -Hb + gap, y: W + f - 2 }, { x: -Hb + gap, y: W }]
  const flapBR: Pt[] = [{ x: L + gap, y: W }, { x: L + Hb - gap, y: W }, { x: L + Hb - gap, y: W + f - 2 }, { x: L + Hb - gap - 2, y: W + f }, { x: L + gap + 2, y: W + f }, { x: L + gap, y: W + f - 2 }]

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: -h1 }).lineTo({ x: L, y: -h1 }).lineTo({ x: L, y: 0 })
  for (const p of [flapFR[1], flapFR[2], flapFR[3], flapFR[4], flapFR[5]] as Pt[]) outline.lineTo(p)
  outline.lineTo({ x: L + h1, y: 0 }).lineTo({ x: L + Hb, y: W })
  for (const p of [flapBR[2], flapBR[3], flapBR[4], flapBR[5]] as Pt[]) outline.lineTo(p)
  outline.lineTo({ x: L, y: W }).lineTo({ x: L, y: lidY1 })
  emitProfile(outline, reverseProfile(tuck))
  outline.lineTo({ x: 0, y: W })
  for (const p of [flapBL[1], flapBL[2], flapBL[3], flapBL[4], flapBL[5]] as Pt[]) outline.lineTo(p)
  outline.lineTo({ x: -Hb, y: W }).lineTo({ x: -h1, y: 0 })
  for (const p of [flapFL[2], flapFL[3], flapFL[4], flapFL[5]] as Pt[]) outline.lineTo(p)
  outline.lineTo({ x: 0, y: 0 })
  outline.close()
  b.cut(outline.build(), 'kama çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: T('Ön duvar', 'Front wall'), outline: rectPoints(0, -h1, L, h1), role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.panel({ id: 'back', name: 'back', label: T('Arka duvar', 'Back wall'), outline: rectPoints(0, W, L, Hb), role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  const lidDeg = 90 + (Math.atan2(Hb - h1, W) * 180) / Math.PI
  b.panel({ id: 'lid', name: 'lid', label: T('Eğik kapak', 'Sloped lid'), outline: rectPoints(0, lidY0, L, slope), role: 'lid' })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(lidY0, 0, L, 'above', lidDeg) })
  b.panel({ id: 'lid-tuck', name: 'lid-tuck', label: T('Kapak dili', 'Lid tuck'), outline: profileToPolygon(tuck), role: 'flap', printable: false })
  b.fold({ parent: 'lid', child: 'lid-tuck', ...foldHorizontal(lidY1, 0, L, 'above', 180 - lidDeg) })
  b.panel({ id: 'end-left', name: 'end-left', label: T('Sol uç', 'Left end'), outline: endL, role: 'wall' })
  b.fold({ parent: 'base', child: 'end-left', ...foldVertical(0, 0, W, 'left') })
  b.panel({ id: 'end-right', name: 'end-right', label: T('Sağ uç', 'Right end'), outline: endR, role: 'wall' })
  b.fold({ parent: 'base', child: 'end-right', ...foldVertical(L, 0, W, 'right') })
  const flaps: [string, string, Pt[], ReturnType<typeof foldHorizontal>][] = [
    ['end-left-front', 'end-left', flapFL, foldHorizontal(0, -h1 + gap, -gap, 'below')],
    ['end-right-front', 'end-right', flapFR, foldHorizontal(0, L + gap, L + h1 - gap, 'below')],
    ['end-left-back', 'end-left', flapBL, foldHorizontal(W, -Hb + gap, -gap, 'above')],
    ['end-right-back', 'end-right', flapBR, foldHorizontal(W, L + gap, L + Hb - gap, 'above')],
  ]
  for (const [id, parent, o, fold] of flaps) {
    b.panel({ id, name: id, label: T('Yapıştırma kulağı', 'Glue flap'), outline: o, role: 'glue', printable: false })
    b.fold({ parent, child: id, ...fold })
  }
  bleedGuide(b, [{ x: -Hb, y: -h1 }, { x: L + Hb, y: lidY1 + tuckDepth }], bleed)
  return b.build()
}

// ---------------------------------------------------------------------------

export const FOOD_SPECS: readonly FoodSpec[] = [
  {
    id: 'food-tapered-lid',
    code: 'D10.20.05.53',
    standard: 'ECMA',
    dct: ['becf-1200b', 'becf-12012'],
    name: T('Konik kutu, dilli kapak', 'Tapered box with tuck lid'),
    description: T('Üst ağzı geniş konik gövde; köşe yapıştırma kulakları ve arka duvardan dilli kapak (patlamış mısır / atıştırmalık).', 'Flared body with corner glue flaps and a tuck lid hinged from the back wall (popcorn / snack box).'),
    keywords: ['konik', 'tapered', 'popcorn', 'bucket', 'kova'],
    category: 'food-boxes',
    materials: CARTON,
    params: [
      P.n('length', 'Taban uzunluğu (a)', 'Base length (a)', 160, 30, 800),
      P.n('width', 'Taban genişliği (b)', 'Base width (b)', 70, 30, 800),
      P.n('height', 'Yükseklik (c)', 'Height (c)', 190, 15, 600),
      P.n('splay', 'Açılma (yan başına)', 'Splay per side', 15, 0, 120),
      P.caliper(),
      P.bleed(),
    ],
    build: buildTapered,
  },
  {
    id: 'food-cup-wrap',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-1200c'],
    name: T('Bardak sargısı (taç kapaklı)', 'Cup wrap with petal lid'),
    description: T('Kesik koni açınımı: yay şerit, yapıştırma dili ve üstte içe katlanan taç yaprakları.', 'Truncated-cone development: arc band, glue tab and inward-folding petal lid.'),
    keywords: ['bardak', 'cup', 'sleeve', 'sargı', 'koni'],
    category: 'food-boxes',
    materials: CARTON,
    params: [
      P.n('topDiameter', 'Üst çap (a)', 'Top diameter (a)', 100, 20, 600),
      P.n('bottomDiameter', 'Alt çap (b)', 'Bottom diameter (b)', 90, 20, 600),
      P.n('height', 'Yükseklik (c)', 'Height (c)', 100, 10, 600),
      P.n('petals', 'Taç yaprağı sayısı', 'Petal count', 5, 0, 12, 'construction'),
      P.n('petalHeight', 'Yaprak yüksekliği', 'Petal height', 30, 0, 200, 'construction'),
      P.n('glueTab', 'Yapıştırma dili', 'Glue tab', 10, 4, 40, 'construction', true),
      P.caliper(),
      P.bleed(),
    ],
    build: buildCupWrap,
  },
  {
    id: 'food-gusset-carton',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-1200e'],
    name: T('Körüklü uçlu taşıma kutusu', 'Gusseted-end carry box'),
    description: T('Dört gövde paneli; dar panellerde 45° körüklü uç kanatları, ön panelde dilli üst/alt kapak kanatları.', 'Four body panels; 45° gusseted end flaps on the narrow panels, tuck flaps on the front panel top and bottom.'),
    keywords: ['körük', 'gusset', 'lunch box', 'carry box', 'taşıma'],
    category: 'food-boxes',
    materials: CARTON,
    params: [
      P.n('length', 'Uzunluk (a)', 'Length (a)', 100, 30, 800),
      P.n('width', 'Genişlik (b)', 'Width (b)', 100, 30, 800),
      P.n('height', 'Yükseklik (c)', 'Height (c)', 150, 20, 800),
      P.n('glueFlap', 'Yapıştırma payı', 'Glue flap', 15, 6, 40, 'construction', true),
      { kind: 'number', key: 'tuckDepth', label: { tr: 'Dil derinliği', en: 'Tuck depth' }, unit: 'mm', min: 0, max: 200, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
      P.caliper(),
      P.bleed(),
    ],
    build: buildGussetCarton,
  },
  {
    id: 'food-fry-scoop',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12013'],
    name: T('Patates kızartması külahı', 'French fry scoop'),
    description: T('Taban, kavisli üstlü alçak ön ve yüksek arka duvar; yanlar çapraz bölünmüş iki üçgenle kapanır.', 'Base, curved-top low front and tall back wall; sides close with two diagonal triangles.'),
    keywords: ['fries', 'scoop', 'külah', 'patates'],
    category: 'food-boxes',
    materials: CARTON,
    params: [
      P.n('length', 'Genişlik (a)', 'Width (a)', 100, 30, 400),
      P.n('width', 'Derinlik (b)', 'Depth (b)', 50, 15, 300),
      P.n('height', 'Arka yükseklik (c)', 'Back height (c)', 100, 20, 400),
      P.n('frontRatio', 'Ön yükseklik (% arka)', 'Front height (% of back)', 60, 20, 95, 'construction'),
      P.caliper(),
      P.bleed(),
    ],
    build: buildFryScoop,
  },
  {
    id: 'food-sandwich-wedge',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12018'],
    name: T('Sandviç kaması', 'Sandwich wedge'),
    description: T('Dik yamuk kesit: alçak ön, yüksek arka, eğik dilli kapak; uçlar yapıştırma kulaklı yamuk panellerle kapanır.', 'Right-trapezoid section: low front, tall back, sloped tuck lid; trapezoid end panels with glue flaps.'),
    keywords: ['sandwich', 'wedge', 'kama', 'sandviç'],
    category: 'food-boxes',
    materials: CARTON,
    params: [
      P.n('length', 'Uzunluk (a)', 'Length (a)', 120, 30, 600),
      P.n('width', 'Derinlik (b)', 'Depth (b)', 70, 20, 400),
      P.n('frontHeight', 'Ön yükseklik', 'Front height', 40, 10, 300),
      P.n('backHeight', 'Arka yükseklik', 'Back height', 110, 15, 500),
      P.caliper(),
      P.bleed(),
    ],
    build: buildWedge,
  },
]

export const foodTemplate = (spec: FoodSpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: spec.standard,
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, ...(spec.code ? [spec.code.toLowerCase()] : []), ...spec.dct],
  params: spec.params,
  build: (params) => spec.build(params, spec),
})

export const foodTemplates: TemplateDefinition[] = FOOD_SPECS.map(foodTemplate)
export type { FoodSpec }
