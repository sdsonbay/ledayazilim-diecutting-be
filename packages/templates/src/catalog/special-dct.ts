import { DielineBuilder, PathBuilder, circlePath, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { bool, num, str, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * diecuttemplates.com "özel kutular" grubu — karton ve oluklu.
 *
 * Kapaklı hediye tepsisi, katlanır küp, cüzdan kutu, piramit, yuvarlak yastık,
 * tutamaklı taşıyıcı ve yırtma şeritli e-ticaret kutuları. Her biri taban
 * merkezli çapraz (cross) yerleşimle kurulur; kapak arka duvardan menteşelidir.
 */

type Pt = Point

export type SpecialKind = 'cube' | 'wallet' | 'gift-tray' | 'pyramid' | 'round-pillow' | 'handle-carrier' | 'ecom-mailer'

export interface SpecialSpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  kind: SpecialKind
  /** gift-tray: dil/toz kapağı köşeleri yuvarlak; yanlar kavisli; duvar eğimi (mm). */
  tray?: { rounded?: boolean; arched?: boolean; splay?: number }
  /** ecom-mailer: yan duvar tipi, yırtma şeridi konumu, ön kilit kanatları. */
  mailer?: { sides: 'single' | 'roll-over'; zipperOn: 'lip' | 'front'; frontLocks?: boolean; sideTabs?: boolean }
  dims?: { a: number; b: number; c: number }
  caliper?: number
}

const T = (tr: string, en: string): I18nText => ({ tr, en })

const dctDims = (spec: SpecialSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b) return { a: e.dims.a, b: e.dims.b, c: e.dims.c ?? e.dims.b }
  }
  return { a: 100, b: 80, c: 50 }
}

const meta = (spec: SpecialSpec, caliper: number, glue: boolean) => ({
  name: spec.name,
  ...(spec.standard === 'ECMA' ? { ecma: spec.code } : spec.standard === 'FEFCO' ? { fefco: spec.code } : {}),
  caliper,
  glueFlapSide: glue ? ('right' as const) : ('none' as const),
})

const poly = (pb: PathBuilder, pts: Pt[]): void => {
  pb.moveTo(pts[0] as Pt)
  for (let i = 1; i < pts.length; i++) pb.lineTo(pts[i] as Pt)
  pb.close()
}

/** Yuvarlatılmış köşeli kapak profili: (x1,y)→(x2,y) tabanlı, d yönünde depth derin. */
const roundedFlap = (x1: number, x2: number, y: number, d: 1 | -1, depth: number, r: number, inset = 0): Pt[] => {
  const rr = Math.min(r, depth * 0.9, (x2 - x1) / 2 - inset)
  const tip = y + d * depth
  const pts: Pt[] = [{ x: x1, y }, { x: x1 + inset, y: tip - d * rr }]
  const n = rr < 5 ? 2 : 6
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2)
    pts.push({ x: x1 + inset + rr - rr * Math.cos(t), y: tip - d * rr + d * rr * Math.sin(t) })
  }
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2)
    pts.push({ x: x2 - inset - rr + rr * Math.sin(t), y: tip - d * rr + d * rr * Math.cos(t) })
  }
  pts.push({ x: x2, y })
  return pts
}

// ---------------------------------------------------------------------------
// Katlanır küp — ECMA F60.81 (becf-11e01)
// ---------------------------------------------------------------------------

function buildCube(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const hParam = num(params, 'height')
  const h = hParam > 0 ? hParam : bW
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const f = Math.max(6, Math.min(a, bW) * 0.5 - caliper) // kilit kanadı derinliği
  const g = Math.max(0.8, caliper)

  // Taban (0,0)-(a,bW); duvarlar dört yanda; kanatlar duvar ucunda
  const pb = new PathBuilder()
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: 0, y: -h },
    { x: g, y: -h },
    { x: g, y: -h - f },
    { x: a - g, y: -h - f },
    { x: a - g, y: -h },
    { x: a, y: -h },
    { x: a, y: 0 },
    { x: a + h, y: 0 },
    { x: a + h, y: g },
    { x: a + h + f, y: g },
    { x: a + h + f, y: bW - g },
    { x: a + h, y: bW - g },
    { x: a + h, y: bW },
    { x: a, y: bW },
    { x: a, y: bW + h },
    { x: a - g, y: bW + h },
    { x: a - g, y: bW + h + f },
    { x: g, y: bW + h + f },
    { x: g, y: bW + h },
    { x: 0, y: bW + h },
    { x: 0, y: bW },
    { x: -h, y: bW },
    { x: -h, y: bW - g },
    { x: -h - f, y: bW - g },
    { x: -h - f, y: g },
    { x: -h, y: g },
    { x: -h, y: 0 },
  ]
  poly(pb, pts)
  b.cut(pb.build(), 'küp çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, bW), role: 'bottom' })
  b.root('base')
  const walls: [string, Pt[], I18nText, () => void][] = [
    ['wall-front', rectPoints(0, -h, a, h), T('Ön duvar', 'Front wall'), () => b.fold({ parent: 'base', child: 'wall-front', ...foldHorizontal(0, 0, a, 'below') })],
    ['wall-back', rectPoints(0, bW, a, h), T('Arka duvar', 'Back wall'), () => b.fold({ parent: 'base', child: 'wall-back', ...foldHorizontal(bW, 0, a, 'above') })],
    ['wall-left', rectPoints(-h, 0, h, bW), T('Sol duvar', 'Left wall'), () => b.fold({ parent: 'base', child: 'wall-left', ...foldVertical(0, 0, bW, 'left') })],
    ['wall-right', rectPoints(a, 0, h, bW), T('Sağ duvar', 'Right wall'), () => b.fold({ parent: 'base', child: 'wall-right', ...foldVertical(a, 0, bW, 'right') })],
  ]
  for (const [id, outline, label, fold] of walls) {
    b.panel({ id, name: id, label, outline, role: 'wall' })
    fold()
  }
  const flaps: [string, string, Pt[], Pt, Pt, Pt][] = [
    ['flap-front', 'wall-front', rectPoints(g, -h - f, a - 2 * g, f), { x: g, y: -h }, { x: a - g, y: -h }, { x: a / 2, y: -h - f }],
    ['flap-back', 'wall-back', rectPoints(g, bW + h, a - 2 * g, f), { x: g, y: bW + h }, { x: a - g, y: bW + h }, { x: a / 2, y: bW + h + f }],
    ['flap-left', 'wall-left', rectPoints(-h - f, g, f, bW - 2 * g), { x: -h, y: g }, { x: -h, y: bW - g }, { x: -h - f, y: bW / 2 }],
    ['flap-right', 'wall-right', rectPoints(a + h, g, f, bW - 2 * g), { x: a + h, y: g }, { x: a + h, y: bW - g }, { x: a + h + f, y: bW / 2 }],
  ]
  for (const [id, parent, outline, c1, c2, apex] of flaps) {
    b.panel({ id, name: id, label: T('Kilit kanadı', 'Lock flap'), outline, role: 'lid', printable: true })
    if (id === 'flap-front') b.fold({ parent, child: id, ...foldHorizontal(-h, g, a - g, 'below') })
    else if (id === 'flap-back') b.fold({ parent, child: id, ...foldHorizontal(bW + h, g, a - g, 'above') })
    else if (id === 'flap-left') b.fold({ parent, child: id, ...foldVertical(-h, g, bW - g, 'left') })
    else b.fold({ parent, child: id, ...foldVertical(a + h, g, bW - g, 'right') })
    // Kanat köşelerinden tepe noktasına çapraz kırımlar — kanatlar birbirine geçerek kilitlenir
    b.creaseLine(c1, apex, 'kilit kanadı çapraz kırımı')
    b.creaseLine(c2, apex, 'kilit kanadı çapraz kırımı')
  }
  if (bleed > 0) b.guide('bleed', rectPath(-h - f - bleed, -h - f - bleed, a + 2 * (h + f) + 2 * bleed, bW + 2 * (h + f) + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Cüzdan kutu — dikey dizilim, yuvarlak dilli kapak (becf-11e0e)
// ---------------------------------------------------------------------------

function buildWallet(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = num(params, 'height')
  const caliper = num(params, 'caliper')
  const tuckParam = num(params, 'tuckDepth')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const tuck = tuckParam > 0 ? tuckParam : Math.max(10, Math.min(c * 0.5, bW))
  const glueW = Math.max(6, Math.min(bW * 0.7, 18))
  const g = Math.max(0.8, caliper)
  const lipD = Math.max(6, Math.min(bW * 0.5, 20))

  // Dikey dizilim (y yukarı): ön(-c..0), taban(0..bW), arka(bW..bW+c), kapak(..+bW), dil
  const yBack = bW
  const yLid = bW + c
  const yTuck = yLid + bW
  const yFront = -c
  const tuckPts = roundedFlap(g, a - g, yTuck, 1, tuck, Math.min(tuck * 0.6, 12))
  const lipPts = roundedFlap(g, a - g, yFront, -1, lipD, Math.min(lipD * 0.6, 8))
  // Kapak toz kapakları önde dudak + dil kalınlığı kadar erken biter: dil ön duvarın içine geçebilsin.
  const dustInset = 3 * caliper + g

  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  pb.lineTo({ x: 0, y: yFront })
  for (const p of lipPts) pb.lineTo(p)
  pb.lineTo({ x: a, y: yFront })
  pb.lineTo({ x: a, y: 0 })
  // sağ yan duvar (tabandan; yükseklik c)
  pb.lineTo({ x: a + c, y: 0 })
  pb.lineTo({ x: a + c, y: bW })
  pb.lineTo({ x: a, y: bW })
  // arka panel sağ yapıştırma
  pb.lineTo({ x: a, y: yBack + g })
  pb.lineTo({ x: a + glueW, y: yBack + g + 2 })
  pb.lineTo({ x: a + glueW, y: yLid - 2 })
  pb.lineTo({ x: a, y: yLid })
  // kapak sağ toz kapağı
  pb.lineTo({ x: a, y: yLid + g })
  pb.lineTo({ x: a + tuck * 0.8, y: yLid + g + 2 })
  pb.lineTo({ x: a + tuck * 0.8, y: yTuck - dustInset - 3 })
  pb.lineTo({ x: a, y: yTuck - dustInset })
  pb.lineTo({ x: a, y: yTuck })
  for (let i = tuckPts.length - 1; i >= 0; i--) pb.lineTo(tuckPts[i] as Pt)
  pb.lineTo({ x: 0, y: yTuck })
  pb.lineTo({ x: 0, y: yTuck - dustInset })
  pb.lineTo({ x: -tuck * 0.8, y: yTuck - dustInset - 3 })
  pb.lineTo({ x: -tuck * 0.8, y: yLid + g + 2 })
  pb.lineTo({ x: 0, y: yLid + g })
  pb.lineTo({ x: 0, y: yLid })
  pb.lineTo({ x: -glueW, y: yLid - 2 })
  pb.lineTo({ x: -glueW, y: yBack + g + 2 })
  pb.lineTo({ x: 0, y: yBack + g })
  pb.lineTo({ x: 0, y: bW })
  pb.lineTo({ x: -c, y: bW })
  pb.lineTo({ x: -c, y: 0 })
  pb.close()
  b.cut(pb.build(), 'cüzdan kutu çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, bW), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: T('Ön', 'Front'), outline: rectPoints(0, yFront, a, c), role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, a, 'below') })
  b.panel({ id: 'front-lip', name: 'front-lip', label: T('Ön dudak', 'Front lip'), outline: lipPts, role: 'gusset' })
  b.fold({ parent: 'front', child: 'front-lip', ...foldHorizontal(yFront, g, a - g, 'below', 175) })
  b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, yBack, a, c), role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(bW, 0, a, 'above') })
  b.panel({ id: 'side-left', name: 'side-left', label: T('Sol yan', 'Left side'), outline: rectPoints(-c, 0, c, bW), role: 'wall' })
  b.fold({ parent: 'base', child: 'side-left', ...foldVertical(0, 0, bW, 'left') })
  b.panel({ id: 'side-right', name: 'side-right', label: T('Sağ yan', 'Right side'), outline: rectPoints(a, 0, c, bW), role: 'wall' })
  b.fold({ parent: 'base', child: 'side-right', ...foldVertical(a, 0, bW, 'right') })
  b.panel({ id: 'glue-left', name: 'glue-left', label: T('Yapıştırma payı', 'Glue tab'), outline: [{ x: 0, y: yBack + g }, { x: -glueW, y: yBack + g + 2 }, { x: -glueW, y: yLid - 2 }, { x: 0, y: yLid }], role: 'glue', printable: false })
  b.fold({ parent: 'back', child: 'glue-left', ...foldVertical(0, yBack + g, yLid, 'left') })
  b.panel({ id: 'glue-right', name: 'glue-right', label: T('Yapıştırma payı', 'Glue tab'), outline: [{ x: a, y: yBack + g }, { x: a + glueW, y: yBack + g + 2 }, { x: a + glueW, y: yLid - 2 }, { x: a, y: yLid }], role: 'glue', printable: false })
  b.fold({ parent: 'back', child: 'glue-right', ...foldVertical(a, yBack + g, yLid, 'right') })
  b.panel({ id: 'lid', name: 'lid', label: T('Kapak', 'Lid'), outline: rectPoints(0, yLid, a, bW), role: 'lid', printable: true })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(yLid, 0, a, 'above') })
  b.panel({ id: 'lid-tuck', name: 'lid-tuck', label: T('Kapak dili', 'Lid tuck'), outline: tuckPts, role: 'lock', printable: true })
  b.fold({ parent: 'lid', child: 'lid-tuck', ...foldHorizontal(yTuck, g, a - g, 'above') })
  b.panel({ id: 'lid-dust-left', name: 'lid-dust-left', label: T('Kapak sol toz kapağı', 'Lid left dust flap'), outline: [{ x: 0, y: yLid + g }, { x: -tuck * 0.8, y: yLid + g + 2 }, { x: -tuck * 0.8, y: yTuck - dustInset - 3 }, { x: 0, y: yTuck - dustInset }], role: 'dust' })
  b.fold({ parent: 'lid', child: 'lid-dust-left', ...foldVertical(0, yLid + g, yTuck - dustInset, 'left') })
  b.panel({ id: 'lid-dust-right', name: 'lid-dust-right', label: T('Kapak sağ toz kapağı', 'Lid right dust flap'), outline: [{ x: a, y: yLid + g }, { x: a + tuck * 0.8, y: yLid + g + 2 }, { x: a + tuck * 0.8, y: yTuck - dustInset - 3 }, { x: a, y: yTuck - dustInset }], role: 'dust' })
  b.fold({ parent: 'lid', child: 'lid-dust-right', ...foldVertical(a, yLid + g, yTuck - dustInset, 'right') })
  b.guide('glue', rectPath(-glueW + 1, yBack + g + 3, glueW - 2, c - 6), 'yapıştırma alanı')
  b.guide('glue', rectPath(a + 1, yBack + g + 3, glueW - 2, c - 6), 'yapıştırma alanı')
  const ext = Math.max(c, glueW, tuck * 0.8)
  if (bleed > 0) b.guide('bleed', rectPath(-ext - bleed, yFront - lipD - bleed, a + 2 * ext + 2 * bleed, yTuck + tuck - yFront + lipD + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Kapaklı hediye tepsisi — düz / yuvarlak / kavisli yanlı (becf-11e10, 11e14, 11e17)
// ---------------------------------------------------------------------------

function buildGiftTray(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = num(params, 'height')
  const caliper = num(params, 'caliper')
  const splayParam = num(params, 'splay')
  const bleed = num(params, 'bleed')
  const opts = spec.tray ?? {}
  const e = Math.max(0, Math.min(splayParam, c * 0.8))
  const rounded = opts.rounded === true
  const arched = opts.arched === true
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const g = Math.max(0.8, caliper)
  const tuck = Math.max(8, Math.min(c * 0.85, bW * 0.5))
  const dust = Math.max(6, c * 0.85)
  const r = rounded ? Math.min(tuck * 0.6, 14) : 2
  const tab = Math.max(6, Math.min(c * 0.8, 20))
  const arch = arched ? Math.min(c * 0.5, bW * 0.25) : 0

  // Duvarların dış kenarı e kadar dışa açılır (yamuk duvar); köşe üçgen körükleri yan duvarlarda
  const yLid = bW + c
  const yTuck = yLid + bW
  const tuckPts = roundedFlap(g, a - g, yTuck, 1, tuck, r)
  // Kapak toz kapakları önde dil kalınlığı kadar erken biter: dil ön duvarın içine geçebilsin.
  const dustInset = 2 * caliper + g

  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  // ön duvar (aşağı), yamuk
  pb.lineTo({ x: -e, y: -c })
  pb.lineTo({ x: a + e, y: -c })
  pb.lineTo({ x: a, y: 0 })
  // sağ duvar + köşe körükleri/kulaklar
  pb.lineTo({ x: a + c, y: -e })
  pb.lineTo({ x: a + c + tab, y: -e + 2 })
  pb.lineTo({ x: a + c + tab, y: bW / 2 - arch })
  if (arched) pb.arcTo({ x: a + c + tab, y: bW / 2 + arch }, arch * 1.2, false)
  else pb.lineTo({ x: a + c + tab, y: bW / 2 + arch })
  pb.lineTo({ x: a + c + tab, y: bW + e - 2 })
  pb.lineTo({ x: a + c, y: bW + e })
  pb.lineTo({ x: a, y: bW })
  // arka duvar (yukarı), kapak, dil, kapak toz kapakları
  pb.lineTo({ x: a, y: yLid })
  pb.lineTo({ x: a, y: yLid + g })
  pb.lineTo({ x: a + dust, y: yLid + g + 2 })
  pb.lineTo({ x: a + dust, y: yTuck - dustInset - (rounded ? r : 2) })
  pb.lineTo({ x: a, y: yTuck - dustInset })
  pb.lineTo({ x: a, y: yTuck })
  for (let i = tuckPts.length - 1; i >= 0; i--) pb.lineTo(tuckPts[i] as Pt)
  pb.lineTo({ x: 0, y: yTuck })
  pb.lineTo({ x: 0, y: yTuck - dustInset })
  pb.lineTo({ x: -dust, y: yTuck - dustInset - (rounded ? r : 2) })
  pb.lineTo({ x: -dust, y: yLid + g + 2 })
  pb.lineTo({ x: 0, y: yLid + g })
  pb.lineTo({ x: 0, y: yLid })
  pb.lineTo({ x: 0, y: bW })
  // sol duvar + kulaklar
  pb.lineTo({ x: -c, y: bW + e })
  pb.lineTo({ x: -c - tab, y: bW + e - 2 })
  pb.lineTo({ x: -c - tab, y: bW / 2 + arch })
  if (arched) pb.arcTo({ x: -c - tab, y: bW / 2 - arch }, arch * 1.2, false)
  else pb.lineTo({ x: -c - tab, y: bW / 2 - arch })
  pb.lineTo({ x: -c - tab, y: -e + 2 })
  pb.lineTo({ x: -c, y: -e })
  pb.close()
  b.cut(pb.build(), 'tepsi çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, bW), role: 'bottom' })
  b.root('base')
  const wallAngle = 90 - (Math.atan2(e, c) * 180) / Math.PI
  b.panel({ id: 'front', name: 'front', label: T('Ön duvar', 'Front wall'), outline: [{ x: 0, y: 0 }, { x: -e, y: -c }, { x: a + e, y: -c }, { x: a, y: 0 }], role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, a, 'below', wallAngle) })
  b.panel({ id: 'back', name: 'back', label: T('Arka duvar', 'Back wall'), outline: rectPoints(0, bW, a, c), role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(bW, 0, a, 'above') })
  b.panel({ id: 'left', name: 'left', label: T('Sol duvar', 'Left wall'), outline: [{ x: 0, y: 0 }, { x: 0, y: bW }, { x: -c, y: bW + e }, { x: -c, y: -e }], role: 'wall' })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, bW, 'left', wallAngle) })
  b.panel({ id: 'right', name: 'right', label: T('Sağ duvar', 'Right wall'), outline: [{ x: a, y: 0 }, { x: a + c, y: -e }, { x: a + c, y: bW + e }, { x: a, y: bW }], role: 'wall' })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(a, 0, bW, 'right', wallAngle) })
  b.panel({ id: 'tab-left', name: 'tab-left', label: T('Sol yapıştırma kulağı', 'Left glue tab'), outline: [{ x: -c, y: -e }, { x: -c - tab, y: -e + 2 }, { x: -c - tab, y: bW + e - 2 }, { x: -c, y: bW + e }], role: 'glue', printable: false })
  b.fold({ parent: 'left', child: 'tab-left', ...foldVertical(-c, -e, bW + e, 'left') })
  b.panel({ id: 'tab-right', name: 'tab-right', label: T('Sağ yapıştırma kulağı', 'Right glue tab'), outline: [{ x: a + c, y: -e }, { x: a + c + tab, y: -e + 2 }, { x: a + c + tab, y: bW + e - 2 }, { x: a + c, y: bW + e }], role: 'glue', printable: false })
  b.fold({ parent: 'right', child: 'tab-right', ...foldVertical(a + c, -e, bW + e, 'right') })
  b.panel({ id: 'lid', name: 'lid', label: T('Kapak', 'Lid'), outline: rectPoints(0, yLid, a, bW), role: 'lid', printable: true })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(yLid, 0, a, 'above') })
  b.panel({ id: 'lid-tuck', name: 'lid-tuck', label: T('Kapak dili', 'Lid tuck'), outline: tuckPts, role: 'lock', printable: true })
  b.fold({ parent: 'lid', child: 'lid-tuck', ...foldHorizontal(yTuck, g, a - g, 'above') })
  b.panel({ id: 'lid-dust-left', name: 'lid-dust-left', label: T('Kapak sol toz kapağı', 'Lid left dust flap'), outline: [{ x: 0, y: yLid + g }, { x: -dust, y: yLid + g + 2 }, { x: -dust, y: yTuck - dustInset - (rounded ? r : 2) }, { x: 0, y: yTuck - dustInset }], role: 'dust' })
  b.fold({ parent: 'lid', child: 'lid-dust-left', ...foldVertical(0, yLid + g, yTuck - dustInset, 'left') })
  b.panel({ id: 'lid-dust-right', name: 'lid-dust-right', label: T('Kapak sağ toz kapağı', 'Lid right dust flap'), outline: [{ x: a, y: yLid + g }, { x: a + dust, y: yLid + g + 2 }, { x: a + dust, y: yTuck - dustInset - (rounded ? r : 2) }, { x: a, y: yTuck - dustInset }], role: 'dust' })
  b.fold({ parent: 'lid', child: 'lid-dust-right', ...foldVertical(a, yLid + g, yTuck - dustInset, 'right') })
  // Köşe körük kırımları: yan duvar köşelerinden tabana çapraz
  if (e > 0) {
    b.creaseLine({ x: 0, y: 0 }, { x: -c, y: -e }, 'köşe körük kırımı')
    b.creaseLine({ x: a, y: 0 }, { x: a + c, y: -e }, 'köşe körük kırımı')
    b.creaseLine({ x: 0, y: bW }, { x: -c, y: bW + e }, 'köşe körük kırımı')
    b.creaseLine({ x: a, y: bW }, { x: a + c, y: bW + e }, 'köşe körük kırımı')
  }
  if (str(params, 'window') === 'rect') {
    const ww = Math.min(a * 0.6, a - 16)
    const wh = Math.min(bW * 0.5, bW - 16)
    if (ww >= 10 && wh >= 10) b.cut(rectPath(a / 2 - ww / 2, yLid + bW / 2 - wh / 2, ww, wh), 'kapak penceresi')
  }
  if (bleed > 0) b.guide('bleed', rectPath(-c - tab - bleed, -c - bleed, a + 2 * (c + tab) + 2 * bleed, yTuck + tuck + c + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Piramit hediye kutusu — kare taban, dört üçgen yüz, pencereli (becf-11e12)
// ---------------------------------------------------------------------------

function buildPyramid(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const h = num(params, 'height') // piramit yüksekliği (taban → tepe)
  const caliper = num(params, 'caliper')
  const rParam = num(params, 'tipRadius')
  const wantWindow = bool(params, 'window')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const half = a / 2
  const faceH = Math.hypot(h, half) // yüz (üçgen) yüksekliği = eğik yükseklik
  const r = Math.min(rParam, faceH * 0.3, half * 0.8)
  // Düz konumdan içe doğru: 90° + taban yarısı/yükseklik eğimi
  const angle = 90 + (Math.atan2(half, h) * 180) / Math.PI

  // Üçgen yüz (taban kenarı x1..x2 üzerinde, d yönünde) — ucu r yarıçaplı yay
  const face = (p1: Pt, p2: Pt, out: Pt): Pt[] => {
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const apex = { x: mid.x + out.x * faceH, y: mid.y + out.y * faceH }
    if (r < 1) return [p1, apex, p2]
    // Uç: kenarlar boyunca k kadar geri, arada dışa şişkin yay (sagitta ≈ k/3)
    const dirL = { x: p1.x - apex.x, y: p1.y - apex.y }
    const dirR = { x: p2.x - apex.x, y: p2.y - apex.y }
    const nl = Math.hypot(dirL.x, dirL.y)
    const nr = Math.hypot(dirR.x, dirR.y)
    const k = r * 1.6
    const l1 = { x: apex.x + (dirL.x / nl) * k, y: apex.y + (dirL.y / nl) * k }
    const r1 = { x: apex.x + (dirR.x / nr) * k, y: apex.y + (dirR.y / nr) * k }
    const arc: Pt[] = []
    const sag = k / 3
    for (let i = 1; i < 6; i++) {
      const t = i / 6
      const bx = l1.x + (r1.x - l1.x) * t
      const by = l1.y + (r1.y - l1.y) * t
      const bump = sag * 4 * t * (1 - t)
      arc.push({ x: bx + out.x * bump, y: by + out.y * bump })
    }
    return [p1, l1, ...arc, r1, p2]
  }
  const faces: [string, Pt[], I18nText][] = [
    ['face-front', face({ x: 0, y: 0 }, { x: a, y: 0 }, { x: 0, y: -1 }), T('Ön yüz', 'Front face')],
    ['face-right', face({ x: a, y: 0 }, { x: a, y: a }, { x: 1, y: 0 }), T('Sağ yüz', 'Right face')],
    ['face-back', face({ x: a, y: a }, { x: 0, y: a }, { x: 0, y: 1 }), T('Arka yüz', 'Back face')],
    ['face-left', face({ x: 0, y: a }, { x: 0, y: 0 }, { x: -1, y: 0 }), T('Sol yüz', 'Left face')],
  ]
  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  for (const [, pts] of faces) for (let i = 1; i < pts.length; i++) pb.lineTo(pts[i] as Pt)
  pb.close()
  b.cut(pb.build(), 'piramit çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, a), role: 'bottom' })
  b.root('base')
  for (const [id, pts, label] of faces) {
    b.panel({ id, name: id, label, outline: pts, role: 'wall', printable: true })
  }
  b.fold({ parent: 'base', child: 'face-front', ...foldHorizontal(0, 0, a, 'below', angle) })
  b.fold({ parent: 'base', child: 'face-back', ...foldHorizontal(a, 0, a, 'above', angle) })
  b.fold({ parent: 'base', child: 'face-left', ...foldVertical(0, 0, a, 'left', angle) })
  b.fold({ parent: 'base', child: 'face-right', ...foldVertical(a, 0, a, 'right', angle) })
  if (wantWindow) {
    const ww = Math.min(a * 0.45, 40)
    const wh = Math.min(faceH * 0.3, 30)
    if (ww >= 8 && wh >= 8) b.cut(rectPath(a / 2 - ww / 2, -faceH * 0.45 - wh / 2, ww, wh), 'pencere')
  }
  // Tepe bağlama: her yüz ucunda kurdele deliği (uçtan içeri)
  const holeR = Math.min(2.5, r * 0.4)
  if (holeR >= 1) {
    for (const [, , , out] of [
      ['f', 0, 0, { x: 0, y: -1 }],
      ['r', 0, 0, { x: 1, y: 0 }],
      ['b', 0, 0, { x: 0, y: 1 }],
      ['l', 0, 0, { x: -1, y: 0 }],
    ] as const) {
      const mid = { x: a / 2 + out.x * (a / 2), y: a / 2 + out.y * (a / 2) }
      const back = r * 1.6 + 4 + holeR
      b.cut(circlePath({ x: mid.x + out.x * (faceH - back), y: mid.y + out.y * (faceH - back) }, holeR), 'kurdele deliği')
    }
  }
  if (bleed > 0) b.guide('bleed', rectPath(-faceH - bleed, -faceH - bleed, a + 2 * faceH + 2 * bleed, a + 2 * faceH + 2 * bleed), 'taşma payı')
  return b.build()
}

const PILLOW_REVERSE = false

// ---------------------------------------------------------------------------
// Yuvarlak yastık kutu — iki disk, kavisli kırımlar, sırt şeridi (becf-11e15)
// ---------------------------------------------------------------------------

function buildRoundPillow(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const dia = num(params, 'length')
  const spine = num(params, 'width')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, true), params)
  const R = dia / 2
  const glueW = Math.max(6, Math.min(spine, 15))
  // Disk 1 merkezi (R, R); kirişler arası sırt şeridi `spine`; Disk 2 merkezi kirişin ötesinde
  const cx1 = R
  const chord = dia * 0.96
  const off = Math.sqrt(Math.max(0, R * R - (chord / 2) ** 2))
  const x1r = cx1 + off
  const x2l = x1r + spine
  const cx2 = x2l + off
  const yTop = R + chord / 2
  const yBot = R - chord / 2
  const pb = new PathBuilder()
  pb.moveTo({ x: x1r, y: yBot })
  pb.arcTo({ x: x1r, y: yTop }, R, false, true) // disk 1 büyük yay (sol taraf)
  pb.lineTo({ x: x2l, y: yTop })
  // disk 2 büyük yay (sağ taraf) — ortada yapıştırma kulağı
  const gx = cx2 + Math.sqrt(Math.max(0, R * R - glueW * glueW))
  pb.arcTo({ x: gx, y: R + glueW }, R, false, false)
  pb.lineTo({ x: gx + glueW, y: R + glueW * 0.7 })
  pb.lineTo({ x: gx + glueW, y: R - glueW * 0.7 })
  pb.lineTo({ x: gx, y: R - glueW })
  pb.arcTo({ x: x2l, y: yBot }, R, false, false)
  pb.close()
  b.cut(pb.build(), 'yuvarlak yastık çevresi')

  const disc = (cx: number): Pt[] => {
    const pts: Pt[] = []
    for (let i = 0; i < 36; i++) {
      const t = (i / 36) * Math.PI * 2
      pts.push({ x: cx + R * Math.cos(t), y: R + R * Math.sin(t) })
    }
    return pts
  }
  b.panel({ id: 'disc-a', name: 'disc-a', label: T('Ön disk', 'Front disc'), outline: disc(cx1), role: 'wall', printable: true })
  b.root('disc-a')
  b.panel({ id: 'spine', name: 'spine', label: T('Sırt', 'Spine'), outline: rectPoints(x1r, yBot, x2l - x1r, chord), role: 'wall' })
  b.fold({ parent: 'disc-a', child: 'spine', ...foldVertical(x1r, yBot, yTop, 'right') })
  b.panel({ id: 'disc-b', name: 'disc-b', label: T('Arka disk', 'Back disc'), outline: disc(cx2), role: 'wall', printable: true })
  b.fold({ parent: 'spine', child: 'disc-b', ...foldVertical(x2l, yBot, yTop, 'right'), reverse: PILLOW_REVERSE })
  b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma kulağı', 'Glue tab'), outline: [{ x: gx, y: R - glueW }, { x: gx + glueW, y: R - glueW * 0.7 }, { x: gx + glueW, y: R + glueW * 0.7 }, { x: gx, y: R + glueW }], role: 'glue', printable: false })
  b.fold({ parent: 'disc-b', child: 'glue', ...foldVertical(gx, R - glueW, R + glueW, 'right') })
  // Yastık kavisleri: her diskte sırta yakın iki kavisli kırım
  const bulge = R * 0.35
  const arcCrease = (cx: number, dir: 1 | -1) => {
    const x = cx + dir * R * 0.15
    const pb2 = new PathBuilder()
    pb2.moveTo({ x, y: R - R * 0.92 })
    pb2.arcTo({ x, y: R + R * 0.92 }, (R * 0.92 * R * 0.92) / (2 * bulge) + bulge / 2, dir === 1)
    b.crease(pb2.build(), 'yastık kavis kırımı')
  }
  arcCrease(cx1, -1)
  arcCrease(cx2, 1)
  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, gx + glueW + 2 * bleed, dia + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// Tutamaklı taşıyıcı kutu — ön/arka duvar uzantısı şerit tutamak (becf-11e18)
// ---------------------------------------------------------------------------

function buildHandleCarrier(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = num(params, 'height')
  const caliper = num(params, 'caliper')
  const handleParam = num(params, 'handleHeight')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const hh = handleParam > 0 ? handleParam : Math.max(30, bW * 0.5 + 25)
  const strapW = Math.max(20, Math.min(a * 0.55, 120))
  const tab = Math.max(6, Math.min(c * 0.8, 20))
  const g = Math.max(0.8, caliper)
  const sx1 = (a - strapW) / 2
  const sx2 = sx1 + strapW
  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  pb.lineTo({ x: 0, y: -c })
  pb.lineTo({ x: sx1, y: -c })
  pb.lineTo({ x: sx1 + 4, y: -c - hh })
  pb.lineTo({ x: sx2 - 4, y: -c - hh })
  pb.lineTo({ x: sx2, y: -c })
  pb.lineTo({ x: a, y: -c })
  pb.lineTo({ x: a, y: 0 })
  // sağ duvar + kulaklar
  pb.lineTo({ x: a + c, y: g })
  pb.lineTo({ x: a + c + tab, y: g + 2 })
  pb.lineTo({ x: a + c + tab, y: bW - g - 2 })
  pb.lineTo({ x: a + c, y: bW - g })
  pb.lineTo({ x: a, y: bW })
  pb.lineTo({ x: a, y: bW + c })
  pb.lineTo({ x: sx2, y: bW + c })
  pb.lineTo({ x: sx2 - 4, y: bW + c + hh })
  pb.lineTo({ x: sx1 + 4, y: bW + c + hh })
  pb.lineTo({ x: sx1, y: bW + c })
  pb.lineTo({ x: 0, y: bW + c })
  pb.lineTo({ x: 0, y: bW })
  pb.lineTo({ x: -c, y: bW - g })
  pb.lineTo({ x: -c - tab, y: bW - g - 2 })
  pb.lineTo({ x: -c - tab, y: g + 2 })
  pb.lineTo({ x: -c, y: g })
  pb.close()
  b.cut(pb.build(), 'taşıyıcı çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, bW), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: T('Ön duvar', 'Front wall'), outline: rectPoints(0, -c, a, c), role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, a, 'below') })
  b.panel({ id: 'back', name: 'back', label: T('Arka duvar', 'Back wall'), outline: rectPoints(0, bW, a, c), role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(bW, 0, a, 'above') })
  b.panel({ id: 'left', name: 'left', label: T('Sol duvar', 'Left wall'), outline: [{ x: 0, y: 0 }, { x: 0, y: bW }, { x: -c, y: bW - g }, { x: -c, y: g }], role: 'wall' })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, bW, 'left') })
  b.panel({ id: 'right', name: 'right', label: T('Sağ duvar', 'Right wall'), outline: [{ x: a, y: 0 }, { x: a + c, y: g }, { x: a + c, y: bW - g }, { x: a, y: bW }], role: 'wall' })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(a, 0, bW, 'right') })
  b.panel({ id: 'tab-left', name: 'tab-left', label: T('Sol yapıştırma kulağı', 'Left glue tab'), outline: [{ x: -c, y: g }, { x: -c - tab, y: g + 2 }, { x: -c - tab, y: bW - g - 2 }, { x: -c, y: bW - g }], role: 'glue', printable: false })
  b.fold({ parent: 'left', child: 'tab-left', ...foldVertical(-c, g, bW - g, 'left') })
  b.panel({ id: 'tab-right', name: 'tab-right', label: T('Sağ yapıştırma kulağı', 'Right glue tab'), outline: [{ x: a + c, y: g }, { x: a + c + tab, y: g + 2 }, { x: a + c + tab, y: bW - g - 2 }, { x: a + c, y: bW - g }], role: 'glue', printable: false })
  b.fold({ parent: 'right', child: 'tab-right', ...foldVertical(a + c, g, bW - g, 'right') })
  // Tutamak şeritleri — taşınırken düşey; kutu kapalıyken karşı karşıya gelir
  const strapAngle = 90 - (Math.atan2(bW / 2, hh) * 180) / Math.PI
  b.panel({ id: 'strap-front', name: 'strap-front', label: T('Ön tutamak', 'Front handle strap'), outline: [{ x: sx1, y: -c }, { x: sx1 + 4, y: -c - hh }, { x: sx2 - 4, y: -c - hh }, { x: sx2, y: -c }], role: 'lid', printable: true })
  b.fold({ parent: 'front', child: 'strap-front', ...foldHorizontal(-c, sx1, sx2, 'below', strapAngle) })
  b.panel({ id: 'strap-back', name: 'strap-back', label: T('Arka tutamak', 'Back handle strap'), outline: [{ x: sx1, y: bW + c }, { x: sx2, y: bW + c }, { x: sx2 - 4, y: bW + c + hh }, { x: sx1 + 4, y: bW + c + hh }], role: 'lid', printable: true })
  b.fold({ parent: 'back', child: 'strap-back', ...foldHorizontal(bW + c, sx1, sx2, 'above', strapAngle) })
  const holeW = Math.min(strapW * 0.6, 80)
  const holeH = Math.min(hh * 0.3, 24)
  if (holeW >= 25 && holeH >= 8) {
    b.cut(stadiumPath({ x: a / 2, y: -c - hh * 0.6 }, holeW, holeH), 'el deliği')
    b.cut(stadiumPath({ x: a / 2, y: bW + c + hh * 0.6 }, holeW, holeH), 'el deliği')
  } else b.warn('handle-small', 'warning', 'Tutamak el deliği için dar; delik atlandı.', 'Strap too narrow for a hand hole; skipped.')
  // Ön şeritte kilit yarığı, arka şeritte dil: şeritler birbirine geçer
  const slotW = Math.min(strapW * 0.5, 40)
  b.cutLine({ x: a / 2 - slotW / 2, y: -c - hh * 0.25 }, { x: a / 2 + slotW / 2, y: -c - hh * 0.25 }, 'tutamak kilit yarığı')
  if (bleed > 0) b.guide('bleed', rectPath(-c - tab - bleed, -c - hh - bleed, a + 2 * (c + tab) + 2 * bleed, bW + 2 * (c + hh) + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------
// E-ticaret kutusu — yırtma şeritli, kendinden yapışkanlı (becf-21e04/05/06/25/29)
// ---------------------------------------------------------------------------

function buildEcomMailer(spec: SpecialSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = num(params, 'height')
  const caliper = num(params, 'caliper')
  const lipParam = num(params, 'lipDepth')
  const bleed = num(params, 'bleed')
  const o = spec.mailer ?? { sides: 'single', zipperOn: 'lip' }
  const rollOver = o.sides === 'roll-over'
  // Çift cidarlı (roll-over) yanlarda iç genişlik daralır: dudak ön duvarın içine sığsın diye yanlardan kaçar.
  const lipInset = rollOver ? 4 * caliper + 1 : 0
  const b = new DielineBuilder(spec.id, meta(spec, caliper, false), params)
  const g = Math.max(1, caliper)
  const lip = lipParam > 0 ? lipParam : Math.max(20, Math.min(c * 0.9, 80))
  const stripH = Math.max(8, Math.min(14, c * 0.25))
  const dust = Math.max(8, c - 2 * g) // kapak yan toz kapakları
  const tab = Math.max(8, Math.min(c * 0.8, 30))

  const yLid = bW + c
  const yLip = yLid + bW
  const zipY0 = o.zipperOn === 'lip' ? yLip + Math.max(4, lip * 0.35) : -c + Math.max(4, c * 0.3)
  const notch = Math.min(8, stripH * 0.6)

  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 })
  // ön duvar (yırtma şeridi öndeyse sol kenarda çekme çentiği)
  if (o.zipperOn === 'front') {
    pb.lineTo({ x: 0, y: zipY0 + stripH })
    pb.lineTo({ x: notch, y: zipY0 + stripH / 2 })
    pb.lineTo({ x: 0, y: zipY0 })
  }
  pb.lineTo({ x: 0, y: -c })
  if (o.frontLocks) {
    // ön duvar üstünde iki kilit dili (yan roll-over iç duvarların yarıklarına)
    const tw = Math.min(a * 0.15, 30)
    pb.lineTo({ x: a * 0.2 - tw / 2, y: -c })
    pb.lineTo({ x: a * 0.2 - tw / 2 + g, y: -c - tab * 0.6 })
    pb.lineTo({ x: a * 0.2 + tw / 2 - g, y: -c - tab * 0.6 })
    pb.lineTo({ x: a * 0.2 + tw / 2, y: -c })
    pb.lineTo({ x: a * 0.8 - tw / 2, y: -c })
    pb.lineTo({ x: a * 0.8 - tw / 2 + g, y: -c - tab * 0.6 })
    pb.lineTo({ x: a * 0.8 + tw / 2 - g, y: -c - tab * 0.6 })
    pb.lineTo({ x: a * 0.8 + tw / 2, y: -c })
  }
  pb.lineTo({ x: a, y: -c })
  pb.lineTo({ x: a, y: 0 })
  // sağ yan blok
  if (rollOver) {
    pb.lineTo({ x: a + c, y: -g })
    pb.lineTo({ x: a + c, y: -c + g })
    pb.lineTo({ x: a + c + tab, y: -c + g + 2 })
    pb.lineTo({ x: a + c + tab, y: -2 })
    pb.lineTo({ x: a + c + tab, y: 0 })
    pb.lineTo({ x: a + c + c, y: 0 })
    pb.lineTo({ x: a + c + c + tab, y: 3 })
    pb.lineTo({ x: a + c + c + tab, y: bW - 3 })
    pb.lineTo({ x: a + c + c, y: bW })
    pb.lineTo({ x: a + c + tab, y: bW })
    pb.lineTo({ x: a + c + tab, y: bW + c - g - 2 })
    pb.lineTo({ x: a + c, y: bW + c - g })
    pb.lineTo({ x: a + c, y: bW + g })
  } else {
    if (o.sideTabs) {
      pb.lineTo({ x: a + g + 2, y: -tab })
      pb.lineTo({ x: a + c - 2, y: -tab })
      pb.lineTo({ x: a + c, y: 0 })
      pb.lineTo({ x: a + c, y: bW })
      pb.lineTo({ x: a + c - 2, y: bW + tab })
      pb.lineTo({ x: a + g + 2, y: bW + tab })
    } else {
      pb.lineTo({ x: a + c, y: g })
      pb.lineTo({ x: a + c, y: bW - g })
    }
  }
  pb.lineTo({ x: a, y: bW })
  // arka duvar, kapak, toz kapakları, dudak
  pb.lineTo({ x: a, y: yLid })
  pb.lineTo({ x: a + dust, y: yLid + g })
  pb.lineTo({ x: a + dust, y: yLip - g - 3 })
  pb.lineTo({ x: a, y: yLip })
  if (lipInset > 0) pb.lineTo({ x: a - lipInset, y: yLip })
  pb.lineTo({ x: a - lipInset, y: yLip + lip - 3 })
  pb.lineTo({ x: a - lipInset - 3, y: yLip + lip })
  pb.lineTo({ x: lipInset + 3, y: yLip + lip })
  pb.lineTo({ x: lipInset, y: yLip + lip - 3 })
  if (o.zipperOn === 'lip') {
    pb.lineTo({ x: lipInset, y: zipY0 + stripH })
    pb.lineTo({ x: lipInset + notch, y: zipY0 + stripH / 2 })
    pb.lineTo({ x: lipInset, y: zipY0 })
  }
  if (lipInset > 0) pb.lineTo({ x: lipInset, y: yLip })
  pb.lineTo({ x: 0, y: yLip })
  pb.lineTo({ x: -dust, y: yLip - g - 3 })
  pb.lineTo({ x: -dust, y: yLid + g })
  pb.lineTo({ x: 0, y: yLid })
  pb.lineTo({ x: 0, y: bW })
  // sol yan blok
  if (rollOver) {
    pb.lineTo({ x: -c, y: bW + c - g })
    pb.lineTo({ x: -c - tab, y: bW + c - g - 2 })
    pb.lineTo({ x: -c - tab, y: bW })
    pb.lineTo({ x: -c - c, y: bW })
    pb.lineTo({ x: -c - c - tab, y: bW - 3 })
    pb.lineTo({ x: -c - c - tab, y: 3 })
    pb.lineTo({ x: -c - c, y: 0 })
    pb.lineTo({ x: -c - tab, y: 0 })
    pb.lineTo({ x: -c - tab, y: -c + g + 2 })
    pb.lineTo({ x: -c, y: -c + g })
    pb.lineTo({ x: -c, y: -g })
  } else if (o.sideTabs) {
    pb.lineTo({ x: -g - 2, y: bW + tab })
    pb.lineTo({ x: -c + 2, y: bW + tab })
    pb.lineTo({ x: -c, y: bW })
    pb.lineTo({ x: -c, y: 0 })
    pb.lineTo({ x: -c + 2, y: -tab })
    pb.lineTo({ x: -g - 2, y: -tab })
  } else {
    pb.lineTo({ x: -c, y: bW - g })
    pb.lineTo({ x: -c, y: g })
  }
  pb.close()
  b.cut(pb.build(), 'e-ticaret kutusu çevresi')

  b.panel({ id: 'base', name: 'base', label: T('Taban', 'Base'), outline: rectPoints(0, 0, a, bW), role: 'bottom' })
  b.root('base')
  const notchPts = (): Pt[] => [{ x: 0, y: zipY0 + stripH }, { x: notch, y: zipY0 + stripH / 2 }, { x: 0, y: zipY0 }]
  const frontOutline: Pt[] = o.zipperOn === 'front' ? [{ x: 0, y: 0 }, ...notchPts(), { x: 0, y: -c }, { x: a, y: -c }, { x: a, y: 0 }] : rectPoints(0, -c, a, c)
  b.panel({ id: 'front', name: 'front', label: T('Ön duvar', 'Front wall'), outline: frontOutline, role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, a, 'below') })
  b.panel({ id: 'back', name: 'back', label: T('Arka duvar', 'Back wall'), outline: rectPoints(0, bW, a, c), role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(bW, 0, a, 'above') })
  const sideInset = o.sideTabs && !rollOver ? 0 : g
  b.panel({ id: 'left', name: 'left', label: T('Sol duvar', 'Left wall'), outline: [{ x: 0, y: 0 }, { x: 0, y: bW }, { x: -c, y: bW - sideInset }, { x: -c, y: sideInset }], role: 'wall' })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, bW, 'left') })
  b.panel({ id: 'right', name: 'right', label: T('Sağ duvar', 'Right wall'), outline: [{ x: a, y: 0 }, { x: a + c, y: sideInset }, { x: a + c, y: bW - sideInset }, { x: a, y: bW }], role: 'wall' })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(a, 0, bW, 'right') })
  if (rollOver) {
    for (const side of ['left', 'right'] as const) {
      const sgn = side === 'left' ? -1 : 1
      const x0 = side === 'left' ? 0 : a
      const xw = x0 + sgn * c
      const xi = x0 + sgn * 2 * c
      const inner = `${side}-inner`
      b.panel({ id: inner, name: inner, label: T('İç yan duvar', 'Inner side wall'), outline: [{ x: xw, y: 0 }, { x: xi, y: 0 }, { x: xi, y: bW }, { x: xw, y: bW }], role: 'wall' })
      b.fold({ parent: side, child: inner, ...foldVertical(xw, 0, bW, side, 180) })
      const lock = `${side}-lock`
      b.panel({ id: lock, name: lock, label: T('Taban kilit dili', 'Base lock tab'), outline: [{ x: xi, y: 0 }, { x: xi + sgn * tab, y: 3 }, { x: xi + sgn * tab, y: bW - 3 }, { x: xi, y: bW }], role: 'lock', printable: false })
      // Dil kutunun içine doğru katlanır ve tabana yatar (yarık yanında); dışa taşmaz.
      b.fold({ parent: inner, child: lock, ...foldVertical(xi, 0, bW, side, 90), reverse: true })
      for (const [yy, id2, hs] of [
        [-c + g, `${side}-front-flap`, 'front'],
        [bW + g, `${side}-back-flap`, 'back'],
      ] as const) {
        const y1 = hs === 'front' ? -c + g : bW + g
        const y2 = hs === 'front' ? -g : bW + c - g
        void yy
        b.panel({ id: id2, name: id2, label: T('Köşe kanadı', 'Corner flap'), outline: [{ x: xw, y: y1 }, { x: xw + sgn * tab, y: y1 + (hs === 'front' ? 2 : 0) }, { x: xw + sgn * tab, y: y2 - (hs === 'front' ? 0 : 2) }, { x: xw, y: y2 }], role: 'gusset', printable: false })
        b.fold({ parent: hs, child: id2, ...foldVertical(x0, y1, y2, side) })
      }
      // Taban yarıkları: kilit dilleri buraya oturur
      b.cutLine({ x: x0 + sgn * (g + 1), y: bW * 0.2 }, { x: x0 + sgn * (g + 1), y: bW * 0.8 }, 'taban kilit yarığı')
    }
  } else if (o.sideTabs) {
    for (const side of ['left', 'right'] as const) {
      const sgn = side === 'left' ? -1 : 1
      const x0 = side === 'left' ? 0 : a
      const xi = x0 + sgn * (g + 2)
      const xo = x0 + sgn * (c - 2)
      const xw = x0 + sgn * c
      const fr = `${side}-front-tab`
      b.panel({ id: fr, name: fr, label: T('Yan yapıştırma kulağı', 'Side glue tab'), outline: [{ x: x0, y: 0 }, { x: xi, y: -tab }, { x: xo, y: -tab }, { x: xw, y: 0 }], role: 'glue', printable: false })
      b.fold({ parent: side, child: fr, ...foldHorizontal(0, Math.min(x0, xw), Math.max(x0, xw), 'below') })
      const bk = `${side}-back-tab`
      b.panel({ id: bk, name: bk, label: T('Yan yapıştırma kulağı', 'Side glue tab'), outline: [{ x: x0, y: bW }, { x: xw, y: bW }, { x: xo, y: bW + tab }, { x: xi, y: bW + tab }], role: 'glue', printable: false })
      b.fold({ parent: side, child: bk, ...foldHorizontal(bW, Math.min(x0, xw), Math.max(x0, xw), 'above') })
    }
  }
  if (o.frontLocks) {
    const tw = Math.min(a * 0.15, 30)
    for (const cx of [a * 0.2, a * 0.8]) {
      const id = `front-lock-${Math.round(cx)}`
      b.panel({ id, name: id, label: T('Ön kilit dili', 'Front lock tab'), outline: [{ x: cx - tw / 2, y: -c }, { x: cx - tw / 2 + g, y: -c - tab * 0.6 }, { x: cx + tw / 2 - g, y: -c - tab * 0.6 }, { x: cx + tw / 2, y: -c }], role: 'lock', printable: false })
      b.fold({ parent: 'front', child: id, ...foldHorizontal(-c, cx - tw / 2, cx + tw / 2, 'below', 180) })
      // taban yarıkları
      b.cutLine({ x: cx - tw / 2 - g, y: g + 1 }, { x: cx + tw / 2 + g, y: g + 1 }, 'ön kilit yarığı')
    }
  }
  b.panel({ id: 'lid', name: 'lid', label: T('Kapak', 'Lid'), outline: rectPoints(0, yLid, a, bW), role: 'lid', printable: true })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(yLid, 0, a, 'above') })
  b.panel({ id: 'lid-dust-left', name: 'lid-dust-left', label: T('Kapak sol toz kapağı', 'Lid left dust flap'), outline: [{ x: 0, y: yLid }, { x: -dust, y: yLid + g }, { x: -dust, y: yLip - g - 3 }, { x: 0, y: yLip }], role: 'dust' })
  b.fold({ parent: 'lid', child: 'lid-dust-left', ...foldVertical(0, yLid, yLip, 'left') })
  b.panel({ id: 'lid-dust-right', name: 'lid-dust-right', label: T('Kapak sağ toz kapağı', 'Lid right dust flap'), outline: [{ x: a, y: yLid }, { x: a + dust, y: yLid + g }, { x: a + dust, y: yLip - g - 3 }, { x: a, y: yLip }], role: 'dust' })
  b.fold({ parent: 'lid', child: 'lid-dust-right', ...foldVertical(a, yLid, yLip, 'right') })
  const li = lipInset
  const lipOutline: Pt[] = [{ x: li, y: yLip }, { x: a - li, y: yLip }, { x: a - li, y: yLip + lip - 3 }, { x: a - li - 3, y: yLip + lip }, { x: li + 3, y: yLip + lip }, { x: li, y: yLip + lip - 3 }, ...(o.zipperOn === 'lip' ? notchPts().map((p) => ({ x: p.x + li, y: p.y })) : [])]
  b.panel({ id: 'lip', name: 'lip', label: T('Kapak dudağı (yapışkan)', 'Lid lip (adhesive)'), outline: lipOutline, role: 'lock', printable: true })
  b.fold({ parent: 'lid', child: 'lip', ...foldHorizontal(yLip, li, a - li, 'above') })

  // Yırtma şeridi: iki paralel perfore + çekme dili; yapışkan bant kılavuzu şeridin ötesinde
  b.perf([{ c: 'M', x: notch, y: zipY0 }, { c: 'L', x: a, y: zipY0 }], 'yırtma şeridi perforesi')
  b.perf([{ c: 'M', x: notch, y: zipY0 + stripH }, { c: 'L', x: a, y: zipY0 + stripH }], 'yırtma şeridi perforesi')
  const adhY = o.zipperOn === 'lip' ? zipY0 + stripH + 3 : yLip + lip * 0.55
  b.guide('glue', rectPath(4, adhY, a - 8, Math.max(4, Math.min(12, lip * 0.25))), 'kendinden yapışkan bant')
  if (o.zipperOn === 'front') b.guide('glue', rectPath(4, yLip + lip * 0.2, a - 8, Math.max(4, lip * 0.25)), 'kendinden yapışkan bant')

  const minX = -(rollOver ? 2 * c + tab : c)
  const w = a - 2 * minX
  const minY = -c - (o.frontLocks ? tab * 0.6 : 0)
  if (bleed > 0) b.guide('bleed', rectPath(minX - bleed, minY - bleed, w + 2 * bleed, yLip + lip - minY + 2 * bleed), 'taşma payı')
  if (lip > bW) b.warn('lip-too-deep', 'warning', 'Kapak dudağı ön duvardan uzun; kapanırken tabana çarpar.', 'Lid lip deeper than the front wall; it will hit the base when closed.')
  return b.build()
}

// ---------------------------------------------------------------------------
// Parametreler + spec tablosu
// ---------------------------------------------------------------------------

const P = (key: string, tr: string, en: string, def: number, min: number, max: number, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ kind: 'number', key, label: { tr, en }, unit: 'mm', min, max, step: 0.5, default: def, group: 'dimensions', ...extra }) as ParamDef

const caliperP = (c: number): ParamDef => ({ kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: c, group: 'material' })
const bleedP: ParamDef = { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' }

const paramsFor = (spec: SpecialSpec): ParamDef[] => {
  const d = dctDims(spec)
  const cal = spec.caliper ?? (spec.materials.includes('corrugated') ? 1.5 : 0.5)
  switch (spec.kind) {
    case 'cube':
      return [P('length', 'Uzunluk (a)', 'Length (a)', d.a, 20, 600), P('width', 'Genişlik (b)', 'Width (b)', d.b, 20, 600), P('height', 'Yükseklik (c)', 'Height (c)', 0, 0, 600, { autoWhenZero: true, advanced: true, group: 'construction' } as Partial<ParamDef>), caliperP(cal), bleedP]
    case 'wallet':
      return [P('length', 'Uzunluk (a)', 'Length (a)', d.a, 30, 600), P('width', 'Derinlik (b)', 'Depth (b)', d.b, 10, 300), P('height', 'Yükseklik (c)', 'Height (c)', d.c, 20, 600), caliperP(cal), P('tuckDepth', 'Dil derinliği (d4)', 'Tuck depth (d4)', 0, 0, 200, { autoWhenZero: true, advanced: true, group: 'construction' } as Partial<ParamDef>), bleedP]
    case 'gift-tray':
      return [
        P('length', 'Uzunluk (a)', 'Length (a)', d.a, 30, 800),
        P('width', 'Genişlik (b)', 'Width (b)', d.b, 20, 800),
        P('height', 'Yükseklik (c)', 'Height (c)', d.c, 10, 400),
        caliperP(cal),
        P('splay', 'Duvar açılma payı (e)', 'Wall splay (e)', spec.tray?.splay ?? 0, 0, 100, { group: 'construction' } as Partial<ParamDef>),
        { kind: 'enum', key: 'window', label: { tr: 'Kapak penceresi', en: 'Lid window' }, default: 'none', advanced: true, group: 'options', options: [{ value: 'none', label: { tr: 'Yok', en: 'None' } }, { value: 'rect', label: { tr: 'Dikdörtgen', en: 'Rectangle' } }] },
        bleedP,
      ]
    case 'pyramid':
      return [
        P('length', 'Taban kenarı (a)', 'Base side (a)', d.a, 20, 500),
        P('height', 'Piramit yüksekliği (c)', 'Pyramid height (c)', Math.max(d.c, d.a * 0.8), 10, 800),
        caliperP(cal),
        P('tipRadius', 'Uç yuvarlama (r)', 'Tip radius (r)', 8, 0, 60, { advanced: true, group: 'construction' } as Partial<ParamDef>),
        { kind: 'boolean', key: 'window', label: { tr: 'Ön yüzde pencere', en: 'Window on front face' }, default: true, group: 'options' },
        bleedP,
      ]
    case 'round-pillow':
      return [P('length', 'Çap (a)', 'Diameter (a)', d.a, 30, 500), P('width', 'Sırt genişliği (b)', 'Spine width (b)', d.b, 5, 200), caliperP(cal), bleedP]
    case 'handle-carrier':
      return [
        P('length', 'Uzunluk (a)', 'Length (a)', d.a, 40, 800),
        P('width', 'Genişlik (b)', 'Width (b)', d.b, 30, 600),
        P('height', 'Yükseklik (c)', 'Height (c)', d.c, 15, 400),
        caliperP(cal),
        P('handleHeight', 'Tutamak yüksekliği', 'Handle height', 0, 0, 300, { autoWhenZero: true, advanced: true, group: 'construction' } as Partial<ParamDef>),
        bleedP,
      ]
    case 'ecom-mailer':
      return [
        P('length', 'Uzunluk (a)', 'Length (a)', d.a, 60, 1200),
        P('width', 'Genişlik (b)', 'Width (b)', d.b, 40, 1000),
        P('height', 'Yükseklik (c)', 'Height (c)', d.c, 15, 600),
        caliperP(cal),
        P('lipDepth', 'Yapışkan dudak derinliği (e)', 'Adhesive lip depth (e)', 0, 0, 300, { autoWhenZero: true, advanced: true, group: 'construction' } as Partial<ParamDef>),
        bleedP,
      ]
  }
}

const build = (spec: SpecialSpec, params: Record<string, ParamValue>): Dieline => {
  switch (spec.kind) {
    case 'cube':
      return buildCube(spec, params)
    case 'wallet':
      return buildWallet(spec, params)
    case 'gift-tray':
      return buildGiftTray(spec, params)
    case 'pyramid':
      return buildPyramid(spec, params)
    case 'round-pillow':
      return buildRoundPillow(spec, params)
    case 'handle-carrier':
      return buildHandleCarrier(spec, params)
    case 'ecom-mailer':
      return buildEcomMailer(spec, params)
  }
}

export const specialTemplate = (spec: SpecialSpec): TemplateDefinition => ({
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

const SP: TemplateCategory = 'special-boxes'

export const SPECIAL_SPECS: readonly SpecialSpec[] = [
  {
    id: 'ecma-f60-81',
    code: 'F60.81.00.00',
    standard: 'ECMA',
    dct: ['becf-11e01'],
    name: T('Katlanır küp (kilit kanatlı)', 'Folding cube with lock flaps'),
    description: T('Taban ve dört duvar; her duvarın ucundaki kanat çapraz kırımlarla komşusuna geçer. Yapıştırmasız hediye küpü.', 'Base and four walls; each wall ends in a flap that interlocks with its neighbour along diagonal creases. Glue-free gift cube.'),
    keywords: ['küp', 'cube', 'kilit kanat', 'hediye', 'f60.81'],
    category: SP,
    materials: ['carton'],
    kind: 'cube',
  },
  {
    id: 'wallet-box-tuck',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e0e'],
    name: T('Cüzdan kutu, yuvarlak dilli kapak', 'Wallet box with rounded tuck lid'),
    description: T('Dikey dizilim: ön, taban, arka, kapak ve yuvarlak dil; yanlar tabandan, arka duvarda yapıştırma payları.', 'Vertical layout: front, base, back, lid and rounded tuck; sides from the base with glue tabs on the back wall.'),
    keywords: ['cüzdan', 'wallet', 'yuvarlak dil', 'hediye'],
    category: SP,
    materials: ['carton'],
    kind: 'wallet',
  },
  {
    id: 'gift-tray-lid-splayed',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e10'],
    name: T('Açılı duvarlı kapaklı hediye tepsisi', 'Splayed-wall gift tray with lid'),
    description: T('Dışa açılan yamuk duvarlar, köşe körük kırımları; arka duvardan menteşeli dilli kapak.', 'Outward-splayed trapezoid walls with corner gusset creases; hinged tuck lid from the back wall.'),
    keywords: ['hediye tepsisi', 'gift tray', 'açılı', 'splayed', 'kapak'],
    category: SP,
    materials: ['carton'],
    kind: 'gift-tray',
    tray: { splay: 8 },
  },
  {
    id: 'gift-tray-lid-rounded',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e14'],
    name: T('Yuvarlak dilli kapaklı hediye tepsisi', 'Gift tray with rounded tuck lid'),
    description: T('Dik duvarlar, yuvarlatılmış dil ve toz kapakları; yumuşak görünümlü kapaklı tepsi.', 'Straight walls with generously rounded tuck and dust flaps for a soft-look lidded tray.'),
    keywords: ['hediye tepsisi', 'gift tray', 'yuvarlak', 'rounded', 'kapak'],
    category: SP,
    materials: ['carton'],
    kind: 'gift-tray',
    tray: { rounded: true },
  },
  {
    id: 'gift-tray-lid-arched',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e17'],
    name: T('Kavisli yanlı kapaklı tepsi', 'Arched-side gift tray with lid'),
    description: T('Yan kulaklar kavisli; dilli kapak ve yuvarlak toz kapakları. Pasta/hediye tepsisi.', 'Arched side tabs with a tuck lid and rounded dust flaps. Cake and gift tray.'),
    keywords: ['hediye tepsisi', 'gift tray', 'kavisli', 'arched', 'pasta'],
    category: SP,
    materials: ['carton'],
    kind: 'gift-tray',
    tray: { rounded: true, arched: true },
  },
  {
    id: 'pyramid-gift-box',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e12'],
    name: T('Piramit hediye kutusu (pencereli)', 'Pyramid gift box with window'),
    description: T('Kare taban, dört üçgen yüz tepe noktasında birleşir; yuvarlak uçlar ve kurdele delikleri, ön yüzde pencere.', 'Square base with four triangular faces meeting at the apex; rounded tips with ribbon holes and a window on the front.'),
    keywords: ['piramit', 'pyramid', 'hediye', 'pencere', 'kurdele'],
    category: SP,
    materials: ['carton'],
    kind: 'pyramid',
  },
  {
    id: 'round-pillow-box',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e15'],
    name: T('Yuvarlak yastık kutu', 'Round pillow box'),
    description: T('İki disk ve sırt şeridi; kavisli kırımlarla yastık formu alır. Takı ve küçük hediyeler.', 'Two discs joined by a spine; curved creases give the pillow form. Jewellery and small gifts.'),
    keywords: ['yuvarlak', 'round', 'yastık', 'pillow', 'takı'],
    category: SP,
    materials: ['carton'],
    kind: 'round-pillow',
  },
  {
    id: 'handle-carrier-box',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-11e18'],
    name: T('Şerit tutamaklı taşıyıcı kutu', 'Strap-handle carrier box'),
    description: T('Ön ve arka duvar uzantıları el delikli şerit tutamak oluşturur, birbirine yarıkla geçer; yanlar yapıştırma kulaklı.', 'Front and back wall extensions form hand-hole straps that slot into each other; glue-tabbed sides.'),
    keywords: ['tutamak', 'handle', 'taşıyıcı', 'carrier', 'pasta'],
    category: SP,
    materials: ['carton'],
    kind: 'handle-carrier',
  },
  {
    id: 'ecom-mailer-zipper',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21e04'],
    name: T('E-ticaret kutusu, yırtma şeritli', 'E-commerce mailer with tear strip'),
    description: T('Kendinden yapışkanlı kapak dudağı ve yırtma şeridi; tek kat yan duvarlar. Kargo kutusu.', 'Self-adhesive lid lip with tear strip; single side walls. Shipping mailer.'),
    keywords: ['e-ticaret', 'ecommerce', 'yırtma şeridi', 'tear strip', 'kargo', 'mailer'],
    category: SP,
    materials: ['corrugated'],
    kind: 'ecom-mailer',
    mailer: { sides: 'single', zipperOn: 'lip' },
  },
  {
    id: 'ecom-mailer-zipper-tabs',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21e05'],
    name: T('E-ticaret kutusu, yapıştırma kulaklı', 'E-commerce mailer with glued side tabs'),
    description: T('Yan duvarlar yapıştırma kulaklarıyla ön/arka duvara bağlanır; yapışkan dudak ve yırtma şeridi.', 'Side walls glue to the front/back walls via tabs; adhesive lip and tear strip.'),
    keywords: ['e-ticaret', 'ecommerce', 'yırtma şeridi', 'kargo', 'mailer'],
    category: SP,
    materials: ['corrugated'],
    kind: 'ecom-mailer',
    mailer: { sides: 'single', zipperOn: 'lip', sideTabs: true },
  },
  {
    id: 'ecom-mailer-zipper-front',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21e06'],
    name: T('E-ticaret kutusu, ön duvardan yırtma', 'E-commerce mailer, front-wall tear strip'),
    description: T('Yırtma şeridi ön duvarda; kapak dudağı öne yapışır. Açılınca ön duvar düşer.', 'Tear strip on the front wall; the lid lip sticks to the front. Opening drops the front wall.'),
    keywords: ['e-ticaret', 'ecommerce', 'yırtma şeridi', 'kargo', 'mailer'],
    category: SP,
    materials: ['corrugated'],
    kind: 'ecom-mailer',
    mailer: { sides: 'single', zipperOn: 'front', sideTabs: true },
  },
  {
    id: 'ecom-mailer-rollover',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21e25'],
    name: T('E-ticaret kutusu, çift yan duvar', 'E-commerce mailer with roll-over sides'),
    description: T('Yan duvarlar içe katlanıp tabana kilitlenir (çift kat); ön kilit dilleri, yapışkan dudak ve yırtma şeridi.', 'Side walls roll over and lock into the base (double wall); front lock tabs, adhesive lip and tear strip.'),
    keywords: ['e-ticaret', 'ecommerce', 'roll-over', 'çift duvar', 'kargo', 'mailer'],
    category: SP,
    materials: ['corrugated'],
    kind: 'ecom-mailer',
    mailer: { sides: 'roll-over', zipperOn: 'lip', frontLocks: true },
  },
  {
    id: 'ecom-mailer-rollover-pull',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-21e29'],
    name: T('E-ticaret kutusu, çift duvar + çekme dilli', 'Roll-over mailer with pull-tab strip'),
    description: T('Çift yan duvar ve ön kilitler; yırtma şeridi ön duvarda çekme dilli, kapak dudağı yapışkan.', 'Double side walls and front locks; pull-tab tear strip on the front wall, adhesive lid lip.'),
    keywords: ['e-ticaret', 'ecommerce', 'roll-over', 'çekme dili', 'kargo', 'mailer'],
    category: SP,
    materials: ['corrugated'],
    kind: 'ecom-mailer',
    mailer: { sides: 'roll-over', zipperOn: 'front', frontLocks: true },
  },
]

export const specialTemplates: TemplateDefinition[] = SPECIAL_SPECS.map(specialTemplate)
