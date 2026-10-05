import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import { foldDiagonal, foldHorizontal, foldVertical, tuckFlapProfile, emitProfile, reverseProfile, profileToPolygon, type Profile } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Tek parça tepsi / klasör kutu ailesi (FEFCO 04xx, ECMA B20/B40/B15).
 *
 * Taban ortada; dört duvar artı formunda açılır. Duvarlar tek kat veya
 * içe katlanan çift kat (roll-over) olabilir; köşeler yapıştırma kulağı ya da
 * 45° körük (webbed corner) ile kapanır. Arka duvardan menteşeli kapak,
 * kapak önü, dil ve toz kanatları eklenebilir.
 */

export type WallStyle = 'single' | 'rollover'
export type CornerStyle = 'flap' | 'gusset' | 'none'
/** `tray`: kapak da duvarlı bir tepsidir (B14/B49 menteşeli gıda kutusu / clamshell). */
export type LidStyle = 'none' | 'plain' | 'tuck' | 'dust' | 'tray'

export interface TraySpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  sides: WallStyle
  ends: WallStyle
  corners: CornerStyle
  /** Köşe kulağı hangi duvardan çıkar; varsayılan: roll-over yan → uç duvarlar, aksi → yan duvarlar. */
  cornerOwner?: 'sides' | 'ends'
  lid: LidStyle
  /** Roll-over duvar ucundaki kilit dilleri taban yarıklarına girer. */
  lockTabs?: boolean
  /** Sol/sağ duvarlar taşıma kulpuna uzar; iki kulp kutunun üstünde birleşir (B40.10.84). */
  handles?: boolean
  fallbackDims?: { a: number; b: number; c: number }
  /** DCT varsayılanını ezer (ör. çift kat duvar için taban yarısından alçak yükseklik). */
  dims?: { a: number; b: number; c: number }
  caliper?: number
}

type Pt = Point

interface Geo {
  L: number
  W: number
  H: number
  caliper: number
  gap: number
  chamfer: number
  tabH: number
  tabW: number
  sideDepth: number
  frontDepth: number
  backDepth: number
  lidFront: number
  tuckDepth: number
  dustW: number
  /** `lid: 'tray'` kapak duvar yüksekliği. */
  lidH: number
  /** Kulp paneli uzunluğu (duvar üstünden kulp tepesine). */
  handleP: number
}

const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 6): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

const dedupe = (pts: Pt[]): Pt[] => pts.filter((p, i) => i === 0 || Math.hypot(p.x - (pts[i - 1] as Pt).x, p.y - (pts[i - 1] as Pt).y) > 1e-6)

/** Kenar boyunca iki kilit dili: `fixed` sabit eksen değeri, `from→to` kenar. */
const tabbedEdge = (axis: 'x' | 'y', fixed: number, from: number, to: number, outward: 1 | -1, g: Geo): Pt[] => {
  const span = to - from
  const dir = Math.sign(span)
  const len = Math.abs(span)
  const tabW = Math.min(g.tabW, len * 0.28)
  const ch = Math.min(2.5, tabW * 0.25)
  const pts: Pt[] = []
  const P = (along: number, out: number): Pt => (axis === 'x' ? { x: along, y: fixed + outward * out } : { x: fixed + outward * out, y: along })
  const starts = [from + dir * len * 0.2, from + dir * (len * 0.8 - tabW)]
  for (const s of starts) {
    pts.push(P(s, 0), P(s + dir * ch, g.tabH), P(s + dir * (tabW - ch), g.tabH), P(s + dir * tabW, 0))
  }
  return pts
}

export function buildTray(spec: TraySpec, params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const tuckParam = num(params, 'tuckDepth')
  const dustParam = num(params, 'lidDust')
  const bleed = num(params, 'bleed')
  const lidHParam = 'lidHeight' in params ? num(params, 'lidHeight') : 0
  const handleRise = 'handleHeight' in params ? num(params, 'handleHeight') : 0

  const hasLid = spec.lid !== 'none'
  const handles = spec.handles === true
  const lidH = spec.lid === 'tray' ? (lidHParam > 0 ? lidHParam : H) : 0
  const handleP = handles ? Math.hypot(W / 2, handleRise > 0 ? handleRise : Math.max(30, W * 0.4)) : 0
  const g: Geo = {
    L,
    W,
    H,
    caliper,
    gap: Math.max(0.8, caliper),
    chamfer: Math.min(H * 0.35, 8),
    tabH: Math.max(5, Math.min(12, H * 0.25)),
    tabW: Math.min(22, Math.max(10, W * 0.18)),
    sideDepth: handles ? H + handleP : spec.sides === 'rollover' ? 2 * H - caliper : H,
    frontDepth: spec.ends === 'rollover' ? 2 * H - caliper : H,
    backDepth: spec.ends === 'rollover' && !hasLid ? 2 * H - caliper : H,
    lidFront: spec.lid === 'tray' ? lidH : hasLid ? Math.max(4, H - caliper) : 0,
    tuckDepth: spec.lid === 'tuck' || spec.lid === 'dust' ? (tuckParam > 0 ? tuckParam : Math.max(12, Math.min(40, H * 0.7))) : 0,
    dustW: spec.lid === 'dust' ? (dustParam > 0 ? dustParam : Math.max(10, H * 0.8)) : 0,
    lidH,
    handleP,
  }
  const sideTabs = spec.sides === 'rollover' && spec.lockTabs === true && !handles
  const endTabs = spec.ends === 'rollover' && spec.lockTabs === true

  const b = new DielineBuilder(
    spec.id,
    { name: spec.name, ...(spec.standard === 'ECMA' ? { ecma: spec.code } : { fefco: spec.code }), caliper, glueFlapSide: 'none' },
    params,
  )

  // Köşe kulağı sahibi: roll-over yan duvarda kulaklar ön/arka duvara ait olur
  // (iki kat arasında sıkışır); tek kat yan duvarda kulak yan duvardan çıkar.
  const cornerOwner: 'sides' | 'ends' = spec.cornerOwner ?? (spec.sides === 'rollover' || handles ? 'ends' : 'sides')
  const Hc = Math.max(4, H - caliper)
  const c = Math.min(g.chamfer, Hc * 0.5)
  // Kapak-tepsi ölçüleri
  const Hl = g.lidH
  const Hlc = Math.max(4, Hl - caliper)
  const cl = Math.min(g.chamfer, Hlc * 0.5)
  // Kulp köşe yuvarlaması
  const hr = handles ? Math.min(12, W * 0.2, handleP * 0.4) : 0

  const pts: Pt[] = []
  const add = (...p: Pt[]) => pts.push(...p)

  // Ön duvar alt kenarı (soldan sağa), y = -frontDepth
  const yF = -g.frontDepth
  add({ x: 0, y: yF })
  if (endTabs) add(...tabbedEdge('x', yF, 0, L, -1, g))
  add({ x: L, y: yF })

  // Köşe FR: ön duvar sağ kenarından sağ duvar alt kenarına
  if (spec.corners === 'gusset') {
    add({ x: L, y: -H }, { x: L + H, y: -H }, { x: L + H, y: 0 })
  } else if (spec.corners === 'flap' && cornerOwner === 'sides') {
    add({ x: L, y: 0 }, { x: L + g.gap, y: 0 }, { x: L + g.gap, y: -Hc + c }, { x: L + g.gap + c, y: -Hc }, { x: L + H - c, y: -Hc }, { x: L + H, y: -Hc + c }, { x: L + H, y: 0 })
  } else if (spec.corners === 'flap') {
    add({ x: L, y: -H }, { x: L + Hc - c, y: -H }, { x: L + Hc, y: -H + c }, { x: L + Hc, y: -g.gap }, { x: L, y: -g.gap }, { x: L, y: 0 })
  } else {
    add({ x: L, y: 0 })
  }
  // Sağ duvar dış kenarı (aşağıdan yukarıya), x = L + sideDepth
  const xR = L + g.sideDepth
  if (handles) {
    add({ x: xR - hr, y: 0 }, ...arcPts(xR - hr, hr, hr, -Math.PI / 2, 0), ...arcPts(xR - hr, W - hr, hr, 0, Math.PI / 2), { x: xR - hr, y: W })
  } else {
    add({ x: xR, y: 0 })
    if (sideTabs) add(...tabbedEdge('y', xR, 0, W, 1, g))
    add({ x: xR, y: W })
  }

  // Köşe BR
  if (spec.corners === 'gusset') {
    add({ x: L + H, y: W }, { x: L + H, y: W + H }, { x: L, y: W + H })
  } else if (spec.corners === 'flap' && cornerOwner === 'sides') {
    add({ x: L + H, y: W }, { x: L + H, y: W + Hc - c }, { x: L + H - c, y: W + Hc }, { x: L + g.gap + c, y: W + Hc }, { x: L + g.gap, y: W + Hc - c }, { x: L + g.gap, y: W }, { x: L, y: W })
  } else if (spec.corners === 'flap') {
    add({ x: L, y: W }, { x: L, y: W + g.gap }, { x: L + Hc, y: W + g.gap }, { x: L + Hc, y: W + H - c }, { x: L + Hc - c, y: W + H }, { x: L, y: W + H })
  } else {
    add({ x: L, y: W })
  }

  // Arka duvar + kapak zinciri (sağ kenar yukarı, üst kenar sağdan sola, sol kenar aşağı)
  const yB = W + g.backDepth
  const lidY0 = W + H
  const lidY1 = lidY0 + W
  const lidFrontY = lidY1 + g.lidFront
  // Teleskop kapak tepsinin dışına geçer: duvar + kapak köşe kulağı kalınlığı kadar her yandan geniş.
  const lw = spec.lid === 'tray' ? 2 * caliper + 0.5 : 0
  let tuck: Profile | null = null
  if (spec.lid === 'tray') {
    add({ x: L, y: lidY0 }, { x: L + lw, y: lidY0 }, { x: L + lw, y: lidY0 + g.gap }, { x: L + lw + Hl, y: lidY0 + g.gap }, { x: L + lw + Hl, y: lidY1 })
    if (spec.corners === 'gusset') {
      add({ x: L + lw + Hl, y: lidY1 + Hl })
    } else if (spec.corners === 'flap') {
      add({ x: L + lw, y: lidY1 }, { x: L + lw, y: lidY1 + g.gap }, { x: L + lw + Hlc, y: lidY1 + g.gap }, { x: L + lw + Hlc, y: lidY1 + Hl - cl }, { x: L + lw + Hlc - cl, y: lidY1 + Hl })
    } else {
      add({ x: L + lw, y: lidY1 }, { x: L + lw, y: lidY1 + Hl })
    }
  } else if (hasLid) {
    add({ x: L, y: lidY0 })
    if (g.dustW > 0) {
      const dc = Math.min(g.dustW * 0.6, W * 0.25)
      add({ x: L + g.dustW, y: lidY0 + dc }, { x: L + g.dustW, y: lidY1 - dc }, { x: L, y: lidY1 })
    } else {
      add({ x: L, y: lidY1 })
    }
    add({ x: L, y: lidFrontY })
    if (g.tuckDepth > 0) {
      tuck = tuckFlapProfile({ x1: 0, x2: L, y: lidFrontY, direction: 1, depth: g.tuckDepth, clearance: Math.max(0.5, caliper), cornerRadius: Math.max(4, caliper * 3) })
    } else {
      add({ x: 0, y: lidFrontY })
    }
  } else {
    add({ x: L, y: yB })
    if (endTabs) add(...tabbedEdge('x', yB, L, 0, 1, g))
    add({ x: 0, y: yB })
  }

  const outline = new PathBuilder()
  const ptsD = dedupe(pts)
  outline.moveTo(ptsD[0] as Pt)
  for (let i = 1; i < ptsD.length; i++) outline.lineTo(ptsD[i] as Pt)
  if (tuck) emitProfile(outline, reverseProfile(tuck))

  // Sol taraf aşağı: kapak sol toz, arka sol, köşe BL, sol duvar, köşe FL
  const left: Pt[] = []
  const addL = (...p: Pt[]) => left.push(...p)
  if (spec.lid === 'tray') {
    if (spec.corners === 'gusset') {
      addL({ x: -lw - Hl, y: lidY1 + Hl }, { x: -lw - Hl, y: lidY1 })
    } else if (spec.corners === 'flap') {
      addL({ x: -lw - Hlc + cl, y: lidY1 + Hl }, { x: -lw - Hlc, y: lidY1 + Hl - cl }, { x: -lw - Hlc, y: lidY1 + g.gap }, { x: -lw, y: lidY1 + g.gap }, { x: -lw, y: lidY1 }, { x: -lw - Hl, y: lidY1 })
    } else {
      addL({ x: -lw, y: lidY1 + Hl }, { x: -lw, y: lidY1 }, { x: -lw - Hl, y: lidY1 })
    }
    addL({ x: -lw - Hl, y: lidY0 + g.gap }, { x: -lw, y: lidY0 + g.gap }, { x: -lw, y: lidY0 }, { x: 0, y: lidY0 })
  } else if (hasLid) {
    addL({ x: 0, y: lidY1 })
    if (g.dustW > 0) {
      const dc = Math.min(g.dustW * 0.6, W * 0.25)
      addL({ x: -g.dustW, y: lidY1 - dc }, { x: -g.dustW, y: lidY0 + dc })
    }
    addL({ x: 0, y: lidY0 })
  }
  if (spec.corners === 'gusset') {
    addL({ x: 0, y: W + H }, { x: -H, y: W + H }, { x: -H, y: W })
  } else if (spec.corners === 'flap' && cornerOwner === 'sides') {
    addL({ x: 0, y: W + H }, { x: 0, y: W }, { x: -g.gap, y: W }, { x: -g.gap, y: W + Hc - c }, { x: -g.gap - c, y: W + Hc }, { x: -H + c, y: W + Hc }, { x: -H, y: W + Hc - c }, { x: -H, y: W })
  } else if (spec.corners === 'flap') {
    addL({ x: 0, y: W + H }, { x: -Hc + c, y: W + H }, { x: -Hc, y: W + H - c }, { x: -Hc, y: W + g.gap }, { x: 0, y: W + g.gap }, { x: 0, y: W })
  } else {
    addL({ x: 0, y: W + H }, { x: 0, y: W })
  }
  const xL = -g.sideDepth
  if (handles) {
    addL({ x: xL + hr, y: W }, ...arcPts(xL + hr, W - hr, hr, Math.PI / 2, Math.PI), ...arcPts(xL + hr, hr, hr, Math.PI, Math.PI * 1.5), { x: xL + hr, y: 0 })
  } else {
    addL({ x: xL, y: W })
    if (sideTabs) addL(...tabbedEdge('y', xL, W, 0, -1, g))
    addL({ x: xL, y: 0 })
  }
  if (spec.corners === 'gusset') {
    addL({ x: -H, y: 0 }, { x: -H, y: -H }, { x: 0, y: -H })
  } else if (spec.corners === 'flap' && cornerOwner === 'sides') {
    addL({ x: -H, y: 0 }, { x: -H, y: -Hc + c }, { x: -H + c, y: -Hc }, { x: -g.gap - c, y: -Hc }, { x: -g.gap, y: -Hc + c }, { x: -g.gap, y: 0 }, { x: 0, y: 0 })
  } else if (spec.corners === 'flap') {
    addL({ x: 0, y: 0 }, { x: 0, y: -g.gap }, { x: -Hc, y: -g.gap }, { x: -Hc, y: -H + c }, { x: -Hc + c, y: -H }, { x: 0, y: -H })
  } else {
    addL({ x: 0, y: 0 })
  }
  for (const p of dedupe(left)) outline.lineTo(p)
  outline.close()
  b.cut(outline.build(), 'tepsi çevresi')

  // Taşıma kulpları: duvar üstünden kulp paneli, ortada tutma deliği
  if (handles) {
    const rise = handleRise > 0 ? handleRise : Math.max(30, W * 0.4)
    const tilt = (Math.atan2(W / 2, rise) * 180) / Math.PI
    const holeT = Math.min(24, handleP * 0.35)
    const holeLen = Math.min(W * 0.6, 100)
    const grip = Math.max(10, holeT * 0.6)
    const hx = handleP - grip - holeT / 2
    b.panel({ id: 'left-handle', name: 'left-handle', label: { tr: 'Sol kulp', en: 'Left handle' }, outline: rectPoints(-H - handleP, 0, handleP, W), role: 'wall' })
    b.fold({ parent: 'left', child: 'left-handle', ...foldVertical(-H, 0, W, 'left', tilt) })
    b.cut(stadiumPath({ x: -H - hx, y: W / 2 }, holeT, holeLen), 'kulp deliği')
    b.panel({ id: 'right-handle', name: 'right-handle', label: { tr: 'Sağ kulp', en: 'Right handle' }, outline: rectPoints(L + H, 0, handleP, W), role: 'wall' })
    b.fold({ parent: 'right', child: 'right-handle', ...foldVertical(L + H, 0, W, 'right', tilt) })
    b.cut(stadiumPath({ x: L + H + hx, y: W / 2 }, holeT, holeLen), 'kulp deliği')
  }

  // --- Paneller
  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar', en: 'Back wall' }, outline: rectPoints(0, W, L, H), role: 'wall' })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })

  const inner = (id: string, parent: string, outline: Pt[], fold: ReturnType<typeof foldVertical>, label: I18nText) => {
    b.panel({ id, name: id, label, outline, role: 'wall', printable: false })
    b.fold({ parent, child: id, ...fold })
  }
  if (spec.sides === 'rollover') {
    const d = H - caliper
    inner('left-inner', 'left', rectPoints(-H - d, 0, d, W), foldVertical(-H, 0, W, 'left', 180), { tr: 'Sol iç duvar', en: 'Left inner wall' })
    inner('right-inner', 'right', rectPoints(L + H, 0, d, W), foldVertical(L + H, 0, W, 'right', 180), { tr: 'Sağ iç duvar', en: 'Right inner wall' })
  }
  if (spec.ends === 'rollover') {
    const d = H - caliper
    inner('front-inner', 'front', rectPoints(0, -H - d, L, d), foldHorizontal(-H, 0, L, 'below', 180), { tr: 'Ön iç duvar', en: 'Front inner wall' })
    if (!hasLid) inner('back-inner', 'back', rectPoints(0, W + H, L, d), foldHorizontal(W + H, 0, L, 'above', 180), { tr: 'Arka iç duvar', en: 'Back inner wall' })
  }

  // Kilit yarıkları (taban, kırım hattının hemen içinde)
  if (sideTabs || endTabs) {
    const slotT = Math.max(2, caliper * 2 + 0.6)
    // Yarık tabanın içinde kalır (kenardan > 1.6 mm) — panel oyuğu değil delik.
    const slotOff = caliper + slotT / 2 + 2
    const slotLen = Math.min(g.tabW, W * 0.28) + 1
    if (sideTabs) {
      for (const y of [W * 0.2 + slotLen / 2 - 0.5, W * 0.8 - slotLen / 2 + 0.5]) {
        b.cut(stadiumPath({ x: slotOff, y }, slotT, slotLen), 'kilit yarığı')
        b.cut(stadiumPath({ x: L - slotOff, y }, slotT, slotLen), 'kilit yarığı')
      }
    }
    if (endTabs) {
      const sl = Math.min(g.tabW, L * 0.28) + 1
      for (const x of [L * 0.2 + sl / 2 - 0.5, L * 0.8 - sl / 2 + 0.5]) {
        b.cut(stadiumPath({ x, y: slotOff }, sl, slotT), 'kilit yarığı')
        if (!hasLid) b.cut(stadiumPath({ x, y: W - slotOff }, sl, slotT), 'kilit yarığı')
      }
    }
  }

  // Köşeler
  if (spec.corners === 'flap') {
    const flaps: [string, string, Pt[], ReturnType<typeof foldVertical>][] =
      cornerOwner === 'sides'
        ? [
            ['corner-fl', 'left', [{ x: -g.gap, y: 0 }, { x: -H, y: 0 }, { x: -H, y: -Hc + c }, { x: -H + c, y: -Hc }, { x: -g.gap - c, y: -Hc }, { x: -g.gap, y: -Hc + c }], foldHorizontal(0, -H, -g.gap, 'below')],
            ['corner-fr', 'right', [{ x: L + g.gap, y: 0 }, { x: L + H, y: 0 }, { x: L + H, y: -Hc + c }, { x: L + H - c, y: -Hc }, { x: L + g.gap + c, y: -Hc }, { x: L + g.gap, y: -Hc + c }], foldHorizontal(0, L + g.gap, L + H, 'below')],
            ['corner-bl', 'left', [{ x: -g.gap, y: W }, { x: -H, y: W }, { x: -H, y: W + Hc - c }, { x: -H + c, y: W + Hc }, { x: -g.gap - c, y: W + Hc }, { x: -g.gap, y: W + Hc - c }], foldHorizontal(W, -H, -g.gap, 'above')],
            ['corner-br', 'right', [{ x: L + g.gap, y: W }, { x: L + H, y: W }, { x: L + H, y: W + Hc - c }, { x: L + H - c, y: W + Hc }, { x: L + g.gap + c, y: W + Hc }, { x: L + g.gap, y: W + Hc - c }], foldHorizontal(W, L + g.gap, L + H, 'above')],
          ]
        : [
            ['corner-fl', 'front', [{ x: 0, y: -g.gap }, { x: 0, y: -H }, { x: -Hc + c, y: -H }, { x: -Hc, y: -H + c }, { x: -Hc, y: -g.gap }], foldVertical(0, -H, -g.gap, 'left')],
            ['corner-fr', 'front', [{ x: L, y: -g.gap }, { x: L, y: -H }, { x: L + Hc - c, y: -H }, { x: L + Hc, y: -H + c }, { x: L + Hc, y: -g.gap }], foldVertical(L, -H, -g.gap, 'right')],
            ['corner-bl', 'back', [{ x: 0, y: W + g.gap }, { x: 0, y: W + H }, { x: -Hc + c, y: W + H }, { x: -Hc, y: W + H - c }, { x: -Hc, y: W + g.gap }], foldVertical(0, W + g.gap, W + H, 'left')],
            ['corner-br', 'back', [{ x: L, y: W + g.gap }, { x: L, y: W + H }, { x: L + Hc - c, y: W + H }, { x: L + Hc, y: W + H - c }, { x: L + Hc, y: W + g.gap }], foldVertical(L, W + g.gap, W + H, 'right')],
          ]
    for (const [id, parent, outline, fold] of flaps) {
      b.panel({ id, name: id, label: { tr: 'Köşe kulağı', en: 'Corner flap' }, outline, role: 'glue', printable: false })
      b.fold({ parent, child: id, ...fold })
    }
    if (cornerOwner === 'sides') b.guide('glue', rectPath(-H, -Hc, H - g.gap, Hc), 'yapıştırma alanı')
  } else if (spec.corners === 'gusset') {
    // Her köşede iki üçgen: biri yan duvara, diğeri ona 180° ile bağlı (yapıştırılır).
    const gussets: [string, string, Pt, Pt, Pt, ReturnType<typeof foldHorizontal>, 1 | -1][] = [
      ['fl', 'left', { x: 0, y: 0 }, { x: -H, y: 0 }, { x: -H, y: -H }, foldHorizontal(0, -H, 0, 'below'), 1],
      ['fr', 'right', { x: L, y: 0 }, { x: L + H, y: 0 }, { x: L + H, y: -H }, foldHorizontal(0, L, L + H, 'below'), -1],
      ['bl', 'left', { x: 0, y: W }, { x: -H, y: W }, { x: -H, y: W + H }, foldHorizontal(W, -H, 0, 'above'), -1],
      ['br', 'right', { x: L, y: W }, { x: L + H, y: W }, { x: L + H, y: W + H }, foldHorizontal(W, L, L + H, 'above'), 1],
    ]
    for (const [k, parent, a, wallEnd, far, fold, sign] of gussets) {
      const t1 = `gusset-${k}-a`
      const t2 = `gusset-${k}-b`
      // a: taban köşesi, wallEnd: yan duvar ucu, far: dış köşe, endWallPt: ön/arka duvarın köşesi
      const endWallPt: Pt = { x: a.x, y: far.y }
      b.panel({ id: t1, name: t1, label: { tr: 'Köşe körüğü', en: 'Corner gusset' }, outline: [a, wallEnd, far], role: 'gusset', printable: false })
      b.fold({ parent, child: t1, ...fold })
      b.panel({ id: t2, name: t2, label: { tr: 'Köşe körüğü (yapıştırma)', en: 'Corner gusset (glue)' }, outline: [a, far, endWallPt], role: 'glue', printable: false })
      const diag = foldDiagonal(a, far, 180 * sign)
      b.fold({ parent: t1, child: t2, axis: diag.axis, angle: diag.angle })
      b.creaseLine(a, far, 'körük çaprazı')
    }
  }

  // Kapak
  if (spec.lid === 'tray') {
    const lx0 = -lw
    const lx1 = L + lw
    b.panel({ id: 'lid', name: 'lid', label: { tr: 'Kapak', en: 'Lid' }, outline: rectPoints(lx0, lidY0, lx1 - lx0, W), role: 'lid' })
    b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(lidY0, 0, L, 'above') })
    b.panel({ id: 'lid-front', name: 'lid-front', label: { tr: 'Kapak ön duvarı', en: 'Lid front wall' }, outline: rectPoints(lx0, lidY1, lx1 - lx0, Hl), role: 'wall' })
    b.fold({ parent: 'lid', child: 'lid-front', ...foldHorizontal(lidY1, lx0, lx1, 'above') })
    b.panel({ id: 'lid-left', name: 'lid-left', label: { tr: 'Kapak sol duvarı', en: 'Lid left wall' }, outline: rectPoints(lx0 - Hl, lidY0 + g.gap, Hl, W - g.gap), role: 'wall' })
    b.fold({ parent: 'lid', child: 'lid-left', ...foldVertical(lx0, lidY0 + g.gap, lidY1, 'left') })
    b.panel({ id: 'lid-right', name: 'lid-right', label: { tr: 'Kapak sağ duvarı', en: 'Lid right wall' }, outline: rectPoints(lx1, lidY0 + g.gap, Hl, W - g.gap), role: 'wall' })
    b.fold({ parent: 'lid', child: 'lid-right', ...foldVertical(lx1, lidY0 + g.gap, lidY1, 'right') })
    if (spec.corners === 'flap') {
      const fl: Pt[] = [{ x: lx0, y: lidY1 + g.gap }, { x: lx0, y: lidY1 + Hl }, { x: lx0 - Hlc + cl, y: lidY1 + Hl }, { x: lx0 - Hlc, y: lidY1 + Hl - cl }, { x: lx0 - Hlc, y: lidY1 + g.gap }]
      const fr: Pt[] = [{ x: lx1, y: lidY1 + g.gap }, { x: lx1, y: lidY1 + Hl }, { x: lx1 + Hlc - cl, y: lidY1 + Hl }, { x: lx1 + Hlc, y: lidY1 + Hl - cl }, { x: lx1 + Hlc, y: lidY1 + g.gap }]
      b.panel({ id: 'lid-corner-l', name: 'lid-corner-l', label: { tr: 'Kapak köşe kulağı', en: 'Lid corner flap' }, outline: fl, role: 'glue', printable: false })
      b.fold({ parent: 'lid-front', child: 'lid-corner-l', ...foldVertical(lx0, lidY1 + g.gap, lidY1 + Hl, 'left') })
      b.panel({ id: 'lid-corner-r', name: 'lid-corner-r', label: { tr: 'Kapak köşe kulağı', en: 'Lid corner flap' }, outline: fr, role: 'glue', printable: false })
      b.fold({ parent: 'lid-front', child: 'lid-corner-r', ...foldVertical(lx1, lidY1 + g.gap, lidY1 + Hl, 'right') })
    } else if (spec.corners === 'gusset') {
      const gl: [string, string, Pt, Pt, Pt, ReturnType<typeof foldHorizontal>, 1 | -1][] = [
        ['ll', 'lid-left', { x: lx0, y: lidY1 }, { x: lx0 - Hl, y: lidY1 }, { x: lx0 - Hl, y: lidY1 + Hl }, foldHorizontal(lidY1, lx0 - Hl, lx0, 'above'), -1],
        ['lr', 'lid-right', { x: lx1, y: lidY1 }, { x: lx1 + Hl, y: lidY1 }, { x: lx1 + Hl, y: lidY1 + Hl }, foldHorizontal(lidY1, lx1, lx1 + Hl, 'above'), 1],
      ]
      for (const [k, parent, a, wallEnd, far, fold, sign] of gl) {
        const t1 = `gusset-${k}-a`
        const t2 = `gusset-${k}-b`
        b.panel({ id: t1, name: t1, label: { tr: 'Kapak köşe körüğü', en: 'Lid corner gusset' }, outline: [a, wallEnd, far], role: 'gusset', printable: false })
        b.fold({ parent, child: t1, ...fold })
        b.panel({ id: t2, name: t2, label: { tr: 'Kapak köşe körüğü (yapıştırma)', en: 'Lid corner gusset (glue)' }, outline: [a, far, { x: a.x, y: far.y }], role: 'glue', printable: false })
        const diag = foldDiagonal(a, far, 180 * sign)
        b.fold({ parent: t1, child: t2, axis: diag.axis, angle: diag.angle })
        b.creaseLine(a, far, 'körük çaprazı')
      }
    }
  } else if (hasLid) {
    b.panel({ id: 'lid', name: 'lid', label: { tr: 'Kapak', en: 'Lid' }, outline: rectPoints(0, lidY0, L, W), role: 'lid' })
    b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(lidY0, 0, L, 'above') })
    b.panel({ id: 'lid-front', name: 'lid-front', label: { tr: 'Kapak önü', en: 'Lid front' }, outline: rectPoints(0, lidY1, L, g.lidFront), role: 'wall' })
    b.fold({ parent: 'lid', child: 'lid-front', ...foldHorizontal(lidY1, 0, L, 'above') })
    if (tuck) {
      b.panel({ id: 'lid-tuck', name: 'lid-tuck', label: { tr: 'Kapak dili', en: 'Lid tuck' }, outline: profileToPolygon(tuck), role: 'lock', printable: false })
      b.fold({ parent: 'lid-front', child: 'lid-tuck', ...foldHorizontal(lidFrontY, 0, L, 'above') })
      if (spec.ends !== 'rollover') {
        const slotT = Math.max(2, caliper * 2 + 0.6)
        b.cut(stadiumPath({ x: L / 2, y: -(caliper + slotT / 2 + 2) }, Math.min(L * 0.6, L - 2 * caliper - 4), slotT), 'kapak dili yarığı')
      }
    }
    if (g.dustW > 0) {
      const dc = Math.min(g.dustW * 0.6, W * 0.25)
      const dustL: Pt[] = [{ x: 0, y: lidY0 }, { x: -g.dustW, y: lidY0 + dc }, { x: -g.dustW, y: lidY1 - dc }, { x: 0, y: lidY1 }]
      const dustR: Pt[] = [{ x: L, y: lidY0 }, { x: L + g.dustW, y: lidY0 + dc }, { x: L + g.dustW, y: lidY1 - dc }, { x: L, y: lidY1 }]
      b.panel({ id: 'lid-dust-left', name: 'lid-dust-left', label: { tr: 'Kapak sol toz kanadı', en: 'Lid left dust flap' }, outline: dustL, role: 'dust', printable: false })
      b.fold({ parent: 'lid', child: 'lid-dust-left', ...foldVertical(0, lidY0, lidY1, 'left') })
      b.panel({ id: 'lid-dust-right', name: 'lid-dust-right', label: { tr: 'Kapak sağ toz kanadı', en: 'Lid right dust flap' }, outline: dustR, role: 'dust', printable: false })
      b.fold({ parent: 'lid', child: 'lid-dust-right', ...foldVertical(L, lidY0, lidY1, 'right') })
    }
  }

  if (bleed > 0) {
    const minX = -Math.max(g.sideDepth + (sideTabs ? g.tabH : 0), H, g.dustW, Hl + lw)
    const maxX = L + Math.max(g.sideDepth + (sideTabs ? g.tabH : 0), H, g.dustW, Hl + lw)
    const minY = -g.frontDepth - (endTabs ? g.tabH : 0)
    const maxY = hasLid ? lidFrontY + g.tuckDepth : yB + (endTabs ? g.tabH : 0)
    b.guide('bleed', rectPath(minX - bleed, minY - bleed, maxX - minX + 2 * bleed, maxY - minY + 2 * bleed), 'taşma payı')
  }

  if (hasLid && g.tuckDepth > H) {
    b.warn('tuck-too-deep', 'warning', 'Kapak dili duvar yüksekliğinden uzun; tabana çarpar.', 'Lid tuck is deeper than the wall height; it will hit the base.')
  }
  if (spec.sides === 'rollover' && H * 2 > W) {
    b.warn('rollover-too-tall', 'info', 'Çift kat yan duvar taban genişliğinin yarısından yüksek; iç duvarlar tabanda çakışır.', 'Roll-over walls are taller than half the base width; inner walls overlap on the base.')
  }

  return b.build()
}

const dctDims = (spec: TraySpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b && e.dims.c) return { a: e.dims.a, b: e.dims.b, c: e.dims.c }
  }
  return spec.fallbackDims ?? { a: 200, b: 150, c: 50 }
}

const paramsFor = (spec: TraySpec): ParamDef[] => {
  const dims = dctDims(spec)
  const caliper = spec.caliper ?? (spec.materials.includes('carton') ? 0.5 : 1.5)
  const out: ParamDef[] = [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk (a)', en: 'Length (a)' }, unit: 'mm', min: 30, max: 1500, step: 0.5, default: dims.a, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik (b)', en: 'Width (b)' }, unit: 'mm', min: 30, max: 1500, step: 0.5, default: dims.b, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (c)', en: 'Height (c)' }, unit: 'mm', min: 8, max: 600, step: 0.5, default: dims.c, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: caliper, group: 'material' },
  ]
  if (spec.lid === 'tray') {
    out.push({ kind: 'number', key: 'lidHeight', label: { tr: 'Kapak duvar yüksekliği', en: 'Lid wall height' }, unit: 'mm', min: 0, max: 600, step: 0.5, default: 0, autoWhenZero: true, group: 'construction' })
  }
  if (spec.handles) {
    out.push({ kind: 'number', key: 'handleHeight', label: { tr: 'Kulp yükseliği', en: 'Handle rise' }, unit: 'mm', min: 0, max: 400, step: 0.5, default: 0, autoWhenZero: true, group: 'construction' })
  }
  out.push(
    { kind: 'number', key: 'tuckDepth', label: { tr: 'Kapak dili derinliği', en: 'Lid tuck depth' }, unit: 'mm', min: 0, max: 300, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'lidDust', label: { tr: 'Kapak toz kanadı', en: 'Lid dust flap' }, unit: 'mm', min: 0, max: 300, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  )
  return out
}

export const trayTemplate = (spec: TraySpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: spec.standard,
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, spec.code.toLowerCase(), ...spec.dct],
  params: paramsFor(spec),
  build: (params) => buildTray(spec, params),
})

const T = (tr: string, en: string): I18nText => ({ tr, en })
const CARTON: MaterialKind[] = ['carton']
const CORR: MaterialKind[] = ['corrugated']

export const TRAY_SPECS: readonly TraySpec[] = [
  // --- Oluklu FEFCO 04xx ---------------------------------------------------
  {
    id: 'fefco-0400',
    code: '0400',
    standard: 'FEFCO',
    dct: ['becf-21c05'],
    name: T('Tek parça klasör kutu', 'One-piece folder box'),
    description: T('Taban, dört tek kat duvar, köşe kulakları ve arka duvardan menteşeli kapak + kapak önü.', 'Base, four single walls with corner flaps and a hinged lid with lid front from the back wall.'),
    keywords: ['folder', 'klasör kutu', 'kitap kutusu'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'plain',
  },
  {
    id: 'fefco-0403',
    code: '0403',
    standard: 'FEFCO',
    dct: ['becf-21c07'],
    name: T('Çift yan duvarlı klasör kutu', 'Folder box with double side walls'),
    description: T('Yan duvarlar içe katlanır (çift kat); köşe kulakları iki kat arasında sıkışır. Kapak + kapak önü.', 'Side walls roll over into double thickness trapping the corner flaps; lid with lid front.'),
    keywords: ['folder', 'roll over', 'çift duvar'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'plain',
  },
  {
    id: 'fefco-0404',
    code: '0404',
    standard: 'FEFCO',
    dct: ['becf-21c08'],
    name: T('Çift yan duvarlı klasör kutu, dilli kapak', 'Folder box, double sides, tuck lid'),
    description: T('0403 gövdesi; kapak önündeki dil ön duvara girer.', '0403 body with a lid tuck that locks into the front wall.'),
    keywords: ['folder', 'roll over', 'tuck lid'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'tuck',
  },
  {
    id: 'fefco-0405',
    code: '0405',
    standard: 'FEFCO',
    dct: ['becf-21c09'],
    name: T('Çift duvarlı klasör kutu, toz kanatlı kapak', 'Folder box, double walls, dust-flap lid'),
    description: T('Yan ve ön duvarlar çift kat; kapakta toz kanatları ve iki duvar arasına giren dil.', 'Double side and front walls; lid with dust flaps and a tuck sliding between the front walls.'),
    keywords: ['folder', 'roll over', 'dust flap'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'rollover',
    ends: 'rollover',
    corners: 'flap',
    lid: 'dust',
    lockTabs: true,
  },
  {
    id: 'fefco-0426',
    code: '0426',
    standard: 'FEFCO',
    dct: ['becf-21704', 'becf-21705'],
    name: T('Kilit dilli mailer (toz kanatsız)', 'Roll-end tuck front mailer'),
    description: T('Çift kat yan duvarlar kilit dilleriyle tabana oturur; kapak önü dili ön duvara girer. Toz kanadı yok.', 'Roll-over side walls lock into the base; lid front tucks into the front wall. No dust flaps.'),
    keywords: ['mailer', 'roll end tuck front', 'e-ticaret', 'retf'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'tuck',
    lockTabs: true,
  },
  {
    id: 'fefco-0422',
    code: '0422',
    standard: 'FEFCO',
    dct: ['becf-21a01'],
    name: T('Köşe kulaklı tepsi', 'Tray with corner flaps'),
    description: T('Tek kat dört duvar; yan duvar kulakları ön/arka duvarın içine yapıştırılır. Kapaksız.', 'Four single walls; side-wall flaps glue inside the end walls. No lid.'),
    keywords: ['tray', 'tepsi', 'köşe kulağı'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'none',
  },
  {
    id: 'fefco-0425',
    code: '0425',
    standard: 'FEFCO',
    dct: ['becf-21b03'],
    name: T('Çift yan duvarlı tepsi', 'Tray with roll-over side walls'),
    description: T('Yan duvarlar içe katlanıp kilit dilleriyle tabana oturur; köşe kulakları arada sıkışır. Tutkalsız.', 'Side walls roll over and lock into the base, trapping the corner flaps. Glue-free.'),
    keywords: ['tray', 'tepsi', 'roll over', 'tutkalsız'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'none',
    lockTabs: true,
  },
  {
    id: 'fefco-0451',
    code: '0451',
    standard: 'FEFCO',
    dct: ['becf-21c01'],
    name: T('Çift uç duvarlı tepsi', 'Tray with roll-over end walls'),
    description: T('Ön ve arka duvarlar çift kat, yan duvarlar tek kat kulaklı. Kapaksız sergileme tepsisi.', 'Double front/back walls with single flapped side walls. Open display tray.'),
    keywords: ['tray', 'tepsi', 'display'],
    category: 'tray-boxes',
    materials: CORR,
    sides: 'single',
    ends: 'rollover',
    corners: 'flap',
    lid: 'none',
    lockTabs: true,
  },
  // --- Karton B-serisi tepsiler -------------------------------------------
  {
    id: 'ecma-b20-01',
    code: 'B20.01.00.00',
    standard: 'ECMA',
    dct: ['becf-11a01'],
    name: T('Yapıştırmalı köşe kulaklı tepsi', 'Glued tray with corner flaps'),
    description: T('Dört tek kat duvar; yan duvar kulakları uç duvarların içine yapıştırılır.', 'Four single walls; side-wall flaps glue inside the end walls.'),
    keywords: ['tray', 'tepsi', 'b20'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'none',
  },
  {
    id: 'ecma-b40-20',
    code: 'B40.20.00.00',
    standard: 'ECMA',
    dct: ['becf-11a07', 'becf-11a04'],
    name: T('Kulaklı tepsi (uç duvardan)', 'Tray with end-wall flaps'),
    description: T('Köşe kulakları ön/arka duvardan çıkar ve yan duvarın içine yapışır.', 'Corner flaps come off the end walls and glue inside the side walls.'),
    keywords: ['tray', 'tepsi', 'b40'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    cornerOwner: 'ends',
    lid: 'none',
  },
  {
    id: 'ecma-b40-22',
    code: 'B40.22.00.00',
    standard: 'ECMA',
    dct: ['becf-11a02', 'becf-11a03', 'becf-12007'],
    name: T('Körüklü köşeli tepsi', 'Webbed-corner tray'),
    description: T('Köşeler 45° körükle kapanır; tepsi tek hamlede kurulur, sızdırmaz köşe.', 'Corners close with 45° gussets — pops up in one motion with leak-resistant corners.'),
    keywords: ['tray', 'webbed corner', 'körük', 'gıda tepsisi'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'gusset',
    lid: 'none',
  },
  {
    id: 'ecma-b15-06',
    code: 'B15.06.00.00.A',
    standard: 'ECMA',
    dct: ['becf-11a08'],
    name: T('Kendinden kilitli tepsi', 'Self-locking tray'),
    description: T('Çift kat yan duvarlar kilit dilleriyle taban yarıklarına oturur; tutkalsız kurulur.', 'Roll-over side walls lock into base slots; assembles without glue.'),
    keywords: ['tray', 'self lock', 'kilitli tepsi'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'none',
    lockTabs: true,
    dims: { a: 150, b: 100, c: 40 },
  },
  {
    id: 'ecma-b20-01-53',
    code: 'B20.01.00.53.B',
    standard: 'ECMA',
    dct: ['becf-11701'],
    name: T('Menteşeli kapaklı karton tepsi', 'Carton tray with hinged lid'),
    description: T('Köşe kulaklı tepsi; arka duvardan kapak, toz kanatları ve ön duvara giren dil.', 'Flapped tray with a hinged lid, dust flaps and a tuck into the front wall.'),
    keywords: ['tray', 'hinged lid', 'menteşeli kapak', 'karton mailer'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'dust',
  },
  {
    id: 'ecma-b40-20-82',
    code: 'B40.20.82.50',
    standard: 'ECMA',
    dct: ['becf-11a09'],
    name: T('Kapaklı tepsi (dilli)', 'Tray with tuck lid'),
    description: T('Kulaklı tepsi; kapak önündeki dil ön duvara girer, toz kanadı yok.', 'Flapped tray with a lid whose tuck locks into the front wall; no dust flaps.'),
    keywords: ['tray', 'tuck lid', 'kapaklı tepsi'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'tuck',
  },
  {
    id: 'ecma-b40-22-lid',
    code: 'B40.22.00.53',
    standard: 'ECMA',
    dct: ['becf-11a0e', 'becf-12014'],
    name: T('Körüklü köşeli kapaklı tepsi', 'Webbed-corner tray with lid'),
    description: T('45° körük köşeli tepsi; arka duvardan toz kanatlı kapak ve dil.', 'Gusseted tray with a hinged dust-flap lid and tuck.'),
    keywords: ['tray', 'webbed corner', 'lid', 'körük'],
    category: 'tray-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'gusset',
    lid: 'dust',
  },
  // --- Gıda kutuları (DCT food-boxes) — tepsi ailesi ---------------------------
  {
    id: 'ecma-b15-06-53',
    code: 'B15.06.00.53',
    standard: 'ECMA',
    dct: ['becf-12001', 'becf-12002'],
    name: T('Kilitli tepsi, dilli kapak', 'Self-locking tray with tuck lid'),
    description: T('Çift kat yan duvarlar taban yarıklarına kilitlenir; arka duvardan kapak, kapak önü, dil ve toz kanatları.', 'Roll-over side walls lock into the base; hinged lid with front, tuck and dust flaps.'),
    keywords: ['food tray', 'pastane kutusu', 'tuck lid tray'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'dust',
    lockTabs: true,
  },
  {
    id: 'ecma-b15-06-55',
    code: 'B15.06.00.55',
    standard: 'ECMA',
    dct: ['becf-1200d'],
    name: T('Kilitli tepsi, düz dilli kapak', 'Self-locking tray with plain tuck lid'),
    description: T('Çift kat yan duvarlı kilitli tepsi; toz kanatsız, dilli kapak.', 'Roll-over locking tray with a tuck lid without dust flaps.'),
    keywords: ['food tray', 'tuck lid'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'tuck',
    lockTabs: true,
  },
  {
    id: 'ecma-b15-06-53c',
    code: 'B15.06.00.53C',
    standard: 'ECMA',
    dct: ['becf-12010', 'becf-12011'],
    name: T('Derin kilitli tepsi, dilli kapak', 'Deep self-locking tray with tuck lid'),
    description: T('Yüksek duvarlı kilitli tepsi (pasta/börek kutusu); dil ve toz kanatlı kapak.', 'Tall locking tray (cake/pastry box) with tuck and dust-flap lid.'),
    keywords: ['cake box', 'pasta kutusu', 'deep tray'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'dust',
    lockTabs: true,
    dims: { a: 150, b: 95, c: 45 },
  },
  {
    id: 'ecma-b49-10',
    code: 'B49.10.00.00',
    standard: 'ECMA',
    dct: ['becf-12005', 'becf-12009', 'becf-1200f', 'becf-12015'],
    name: T('Menteşeli kapaklı tepsi (clamshell)', 'Hinged-lid tray (clamshell)'),
    description: T('Taban tepsisi ve kapak tepsisi arka duvardan menteşelidir; iki tepsi de köşe kulaklıdır.', 'Base tray and lid tray hinged along the back wall; both trays with corner flaps.'),
    keywords: ['clamshell', 'hamburger box', 'menteşeli', 'food box'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'tray',
  },
  {
    id: 'ecma-b14-10',
    code: 'B14.10.00.00',
    standard: 'ECMA',
    dct: ['becf-12003', 'becf-1200a'],
    name: T('İki bölmeli menteşeli tepsi', 'Two-tray hinged box'),
    description: T('Eşit iki tepsi ortak duvardan menteşeli; köşe kulakları ön/arka duvardan.', 'Two equal trays hinged along a shared wall; corner flaps on the end walls.'),
    keywords: ['clamshell', 'hinged tray', 'menteşeli tepsi'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    cornerOwner: 'ends',
    lid: 'tray',
  },
  {
    id: 'ecma-b14-10-51',
    code: 'B14.10.00.51.B',
    standard: 'ECMA',
    dct: ['becf-12004'],
    name: T('Çift kat duvarlı menteşeli tepsi', 'Hinged tray with roll-over walls'),
    description: T('Taban tepsisinin yan duvarları çift kat ve kilitli; kapak tepsisi tek kat.', 'Base tray with locking roll-over side walls; single-wall lid tray.'),
    keywords: ['clamshell', 'rollover', 'hinged tray'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'rollover',
    ends: 'single',
    corners: 'flap',
    lid: 'tray',
    lockTabs: true,
  },
  {
    id: 'food-clamshell-gusset',
    code: 'B49.10.22',
    standard: 'ECMA',
    dct: ['becf-12017', 'becf-12019'],
    name: T('Körüklü hamburger kutusu', 'Gusset-corner clamshell'),
    description: T('Menteşeli iki tepsi; köşeler 45° körükle kapanır, tutkalsız kurulur.', 'Hinged clamshell with 45° webbed corners on both trays; glue-free assembly.'),
    keywords: ['hamburger', 'clamshell', 'körük', 'burger box'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'gusset',
    lid: 'tray',
  },
  {
    id: 'ecma-b40-10-84',
    code: 'B40.10.84.00.84.A',
    standard: 'ECMA',
    dct: ['becf-12006', 'becf-12008'],
    name: T('Kulplu tepsi (pasta kutusu)', 'Tray with carry handles'),
    description: T('Dört duvarlı tepsi; yan duvarlar tutma delikli kulplara uzar ve üstte birleşir.', 'Four-wall tray; side walls extend into handle panels with grip holes that meet on top.'),
    keywords: ['handle', 'kulp', 'cake box', 'carry tray'],
    category: 'food-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'none',
    handles: true,
  },
  // --- Gömlek kutuları (DCT shirt-boxes) --------------------------------------
  {
    id: 'ecma-b30-02',
    code: 'B30.02.00.00',
    standard: 'ECMA',
    dct: ['becf-12402', 'becf-12404'],
    name: T('Gömlek kutusu tepsisi (kulaklı)', 'Shirt box tray (corner flaps)'),
    description: T('Tek kat duvarlı, köşe kulaklı yassı tepsi; taban veya kapak olarak kullanılır.', 'Shallow single-wall tray with corner flaps; used as base or lid.'),
    keywords: ['gömlek', 'shirt', 'tepsi', 'tray'],
    category: 'shirt-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    cornerOwner: 'ends',
    lid: 'none',
  },
  {
    id: 'ecma-b48-02',
    code: 'B48.02.00.00',
    standard: 'ECMA',
    dct: ['becf-12403', 'becf-12405'],
    name: T('Gömlek kutusu tepsisi (körüklü köşe)', 'Shirt box tray (webbed corners)'),
    description: T('45° körüklü köşeli yassı tepsi; tutkalsız kurulur.', 'Shallow tray with 45° webbed corners; glue-free.'),
    keywords: ['gömlek', 'shirt', 'körük', 'webbed'],
    category: 'shirt-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'gusset',
    lid: 'none',
  },
  {
    id: 'ecma-b14-05',
    code: 'B14.05.00.00',
    standard: 'ECMA',
    dct: ['becf-12408', 'becf-1240e'],
    name: T('Menteşeli gömlek kutusu', 'Hinged shirt box'),
    description: T('Taban ve kapak tepsileri arka duvardan menteşeli; köşe kulakları uç duvarlardan.', 'Base and lid trays hinged along the back wall; corner flaps on the end walls.'),
    keywords: ['gömlek', 'shirt', 'menteşeli', 'hinged', 'clamshell'],
    category: 'shirt-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    cornerOwner: 'ends',
    lid: 'tray',
  },
  {
    id: 'shirt-tray-lid',
    code: 'B40.20.53',
    standard: 'ECMA',
    dct: ['becf-1240c'],
    name: T('Gömlek tepsisi, dilli kapak', 'Shirt tray with tuck lid'),
    description: T('Köşe kulaklı tepsi; arka duvardan toz kanatlı dilli kapak.', 'Corner-flap tray with a hinged tuck lid and dust flaps.'),
    keywords: ['gömlek', 'shirt', 'kapak', 'lid'],
    category: 'shirt-boxes',
    materials: CARTON,
    sides: 'single',
    ends: 'single',
    corners: 'flap',
    lid: 'dust',
    dims: { a: 150, b: 70, c: 40 },
  },
]

export const trayTemplates: TemplateDefinition[] = TRAY_SPECS.map(trayTemplate)
