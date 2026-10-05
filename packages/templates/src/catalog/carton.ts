import { DielineBuilder, PathBuilder, circlePath, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import {
  angledDustFlapProfile,
  autoBottomFlapProfile,
  autoTongueDepth,
  dustFlapProfile,
  edgeWithThumbNotch,
  emitProfile,
  emitTuckClosure,
  flatEdge,
  foldDiagonal,
  foldHorizontal,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  hangTabProfile,
  profileToPolygon,
  reverseProfile,
  roundedDustFlapProfile,
  sealFlapProfile,
  sitLockTuckProfile,
  snapLockMajorProfile,
  snapLockMinorProfile,
  tuckByStyle,
  tuckClosure,
  tuckFlapProfile,
  type Profile,
} from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { bool, num, str, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Birleşik dört duvarlı karton üreteci.
 *
 * Gövde dizilimi soldan sağa: arka · sol · ön · sağ · yapıştırma payı.
 * Üst ve alt uçlar birbirinden bağımsız "uç takımı" (end assembly) olarak
 * seçilir; ECMA kod sistemindeki A{alt}.{üst}.{alt panel}.{üst panel}
 * mantığı buradan gelir (A55.20.01.03 = snap-lock alt + tuck üst, ön dilli).
 *
 * diecuttemplates.com tuck end / snap lock / auto bottom / standart karton
 * gruplarındaki temel şablonların tümü bu tek üreteçten türetilir.
 */

export type EndStyle =
  | 'open' // kapak yok (açık tepsi)
  | 'tuck' // klasik tuck dili + toz kapakları (A20)
  | 'ears' // kısa kulaklı tuck (A10 / A20.10)
  | 'ears-slit' // dilli kilit + yarıklı kısa kulak (A12)
  | 'full' // tam yan kanat + geniş düz dil (A40)
  | 'lock45' // çapraz kırımlı kilit kanatlar (A45)
  | 'lock46' // açılı kanat + çapraz kırım (A46)
  | 'gable' // çatı kapak + tutamak (A75)
  | 'seal' // yapıştırmalı uç kapakları, tam + yarım (A10.10)
  | 'seal-half' // eşit yarım yapıştırmalı kapaklar (A12.12)
  | 'snap' // 1-2-3 kilit taban (A55) — yalnız alt uç
  | 'auto' // otomatik yapıştırmalı taban (A60) — yalnız alt uç
  | 'petal' // dört yaprak kapak — yaylı yapraklar birbirine geçer (taç kapak)
  | 'pinch' // çapraz kırımlı sıkıştırma kapak — dört kanat tepe noktasında birleşir
  | 'lid-lock' // menteşeli kapak + ön dudakta kilit dilleri, karşı panelde yarıklar
  | 'carry' // ön/arka panel uzantısı tutamak — el deliği, yanlarda toz kapağı (FEFCO 0217)

export type PanelSide = 'back' | 'front'

export interface CartonSpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO'
  /** diecuttemplates.com kimlikleri (ilki ana kayıt). */
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  top: EndStyle
  /** Üst dilin/ana kapağın çıktığı panel (ECMA 4. grup: 01 arka, 03 ön). */
  topSide: PanelSide
  bottom: EndStyle
  /** Alt dilin/ana kapağın çıktığı panel (ECMA 3. grup). */
  bottomSide: PanelSide
  /** .32 — arka panel üstünde askı kulağı + euroslot. Üst dil öne geçer. */
  hanger?: boolean
  /** .33 — dilli kilit + toz kapağı yarıkları. */
  slits?: boolean
  /** DCT’de pencereli varyasyonları var; pencere seçeneği katalogda görünür. */
  window?: boolean
  /** Varsayılan ölçüler DCT envanterinden alınamazsa. */
  fallbackDims?: { a: number; b: number; c: number }
  caliper?: number
  /** Üst dilde taşıma el deliği (oluklu taşıma kutuları). */
  carryHandle?: boolean
  /** Ön panelde yuvarlak havalandırma deliği sayısı. */
  vents?: number
  /** Üst toz kapakları yuvarlak askı delikli uzun kulaklara dönüşür. */
  holeTabs?: boolean
  /** Pencere seçeneğinin varsayılanı (DCT ana kaydı pencereli ise). */
  defaultWindow?: 'rect' | 'oval'
  /** Ön panelde perforeli açma: yırtma şeridi veya baklava dispenser ağzı. */
  zipper?: 'strip' | 'diamond'
  /** lid-lock kapak dillerinin biçimi. */
  lockTabShape?: 'rect' | 'round'
}

type Seg = { x1: number; x2: number; width: number }
type Dir = 1 | -1

interface EndContext {
  spec: CartonSpec
  L: number
  W: number
  H: number
  caliper: number
  tuckDepth: number
  /** Tuck kapanışında kapak (kutu derinliği) ve ucundaki dil. */
  lidDepth: number
  tongueDepth: number
  dustDepth: number
  clearance: number
  cornerRadius: number
  dustChamfer: number
  wantNotch: boolean
  notchRadius: number
  hangHeight: number
  /** DCT varyasyon eksenleri — yalnızca düz tuck (tuck / full) uçlarda etkili. */
  tuckFlapStyle: 'angled' | 'uni' | 'friction'
  dustFlapStyle: 'normal' | 'angled' | 'rounded' | 'slit'
  /** Dilli kilit (sit lock): dilde kulak + toz kapağında yarık. */
  tuckLock: boolean
  /** Arka panel üstünde askı kulağı (euroslot). */
  hangTab: boolean
  back: Seg
  left: Seg
  front: Seg
  right: Seg
}

interface EndPlan {
  /** arka · sol · ön · sağ sırasıyla kenar profilleri. */
  profiles: [Profile, Profile, Profile, Profile]
  /** Gövde kenarından dışa en uzak nokta (taşma payı için). */
  extent: number
  /** Paneller, kırımlar ve ek kesimler — gövde panelleri eklendikten sonra çağrılır. */
  emit: (b: DielineBuilder) => void
}

/** Şablona göre var olmayabilen sayısal parametre. */
const optNum = (params: Record<string, ParamValue>, key: string, fallback: number): number => {
  const v = params[key]
  return typeof v === 'number' ? v : fallback
}

const labelOf = (prefix: 'top' | 'bottom', tr: string, en: string): I18nText => ({
  tr: `${prefix === 'top' ? 'Üst' : 'Alt'} ${tr}`,
  en: `${prefix === 'top' ? 'Top' : 'Bottom'} ${en}`,
})

const edgeX = (profile: Profile): [number, number] => {
  const start = profile[0] as { p: Point }
  const end = profile[profile.length - 1] as { p: Point }
  return [start.p.x, end.p.x]
}

const flapPanel = (
  b: DielineBuilder,
  id: string,
  parent: string,
  profile: Profile,
  label: I18nText,
  role: 'flap' | 'dust' | 'lock' | 'bottom' | 'gusset' | 'lid',
  y: number,
  d: Dir,
  degrees = 90,
): void => {
  b.panel({ id, name: id, label, outline: profileToPolygon(profile), role, printable: role === 'flap' || role === 'lid' })
  const [x1, x2] = edgeX(profile)
  b.fold({ parent, child: id, ...foldHorizontal(y, x1, x2, d === 1 ? 'above' : 'below', degrees) })
}

const opposite = (side: PanelSide): PanelSide => (side === 'back' ? 'front' : 'back')
const segOf = (ctx: EndContext, side: PanelSide): Seg => (side === 'back' ? ctx.back : ctx.front)

/** Dil ve toz kapaklarını sıraya koyar: [arka, sol, ön, sağ]. */
const arrange = (side: PanelSide, main: Profile, other: Profile, leftP: Profile, rightP: Profile): EndPlan['profiles'] =>
  side === 'back' ? [main, leftP, other, rightP] : [other, leftP, main, rightP]

const openEnd = (ctx: EndContext, y: number): EndPlan => ({
  profiles: [flatEdge(ctx.back.x1, ctx.back.x2, y), flatEdge(ctx.left.x1, ctx.left.x2, y), flatEdge(ctx.front.x1, ctx.front.x2, y), flatEdge(ctx.right.x1, ctx.right.x2, y)],
  extent: 0,
  emit: () => {},
})

interface TuckOptions {
  style: 'tuck' | 'ears' | 'ears-slit' | 'full' | 'lock45' | 'lock46'
  side: PanelSide
  hanger: boolean
  slits: boolean
}

const tuckEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir, o: TuckOptions): EndPlan => {
  const { clearance, cornerRadius, dustChamfer, caliper } = ctx
  // Askı arka panelde; dil zorunlu olarak öne geçer.
  const side: PanelSide = o.hanger ? 'front' : o.side
  const tuckSeg = segOf(ctx, side)
  const otherSeg = segOf(ctx, opposite(side))
  const plain = o.style === 'tuck' || o.style === 'full'
  const sitLock = o.style === 'ears-slit' || o.slits || (plain && ctx.tuckLock)
  const dustSlits = sitLock || (plain && ctx.dustFlapStyle === 'slit')
  const isEars = o.style === 'ears' || o.style === 'ears-slit'

  const tuckOpts = { x1: tuckSeg.x1, x2: tuckSeg.x2, y, direction: d, depth: ctx.tongueDepth, clearance, cornerRadius, lidDepth: ctx.lidDepth }
  // Kapak (kutu derinliği) + kırımla ayrılan dil: dil karşı duvarın içine girer.
  const closure = tuckClosure(
    (o) => (plain ? tuckByStyle(ctx.tuckFlapStyle, o, sitLock) : sitLock ? sitLockTuckProfile(o) : tuckFlapProfile(o)),
    tuckOpts,
  )
  const tuck: Profile = closure.outer

  const holeTabs = prefix === 'top' && ctx.spec.holeTabs === true
  const dustDepth = holeTabs ? Math.max(ctx.dustDepth, 22) : isEars ? Math.max(4, Math.min(ctx.dustDepth * 0.5, ctx.W * 0.45)) : ctx.dustDepth
  // A46 kanadı: uçta pahlı; çapraz kırım pahın bittiği köşeye gider.
  const lockChamfer = Math.min(dustDepth * 0.35, ctx.W * 0.3)
  const dust = (seg: Seg): Profile => {
    const base = { x1: seg.x1, x2: seg.x2, y, direction: d, depth: dustDepth, chamfer: dustChamfer }
    if (holeTabs) return roundedDustFlapProfile({ ...base, chamfer: Math.min(6, seg.width * 0.3) })
    if (plain) {
      if (ctx.dustFlapStyle === 'rounded') return roundedDustFlapProfile(base)
      if (ctx.dustFlapStyle === 'angled') return angledDustFlapProfile(base)
      return dustFlapProfile(base)
    }
    if (o.style === 'lock45') return dustFlapProfile({ ...base, chamfer: Math.min(1.5, dustChamfer) })
    if (o.style === 'lock46') return dustFlapProfile({ ...base, chamfer: lockChamfer })
    return dustFlapProfile(base)
  }

  const hangGap = Math.max(1.5, caliper)
  const other: Profile = o.hanger
    ? hangTabProfile({ x1: otherSeg.x1, x2: otherSeg.x2, y, direction: d, height: ctx.hangHeight, gap: hangGap })
    : ctx.wantNotch && o.style !== 'full'
      ? edgeWithThumbNotch(otherSeg.x1, otherSeg.x2, y, ctx.notchRadius, d)
      : flatEdge(otherSeg.x1, otherSeg.x2, y)

  const leftP = dust(ctx.left)
  const rightP = dust(ctx.right)

  return {
    profiles: arrange(side, tuck, other, leftP, rightP),
    extent: Math.max(ctx.lidDepth + ctx.tongueDepth, dustDepth, o.hanger ? ctx.hangHeight : 0),
    emit: (b) => {
      emitTuckClosure(b, closure, { id: `${prefix}-tuck`, parent: side, label: labelOf(prefix, 'kapak dili', 'tuck flap') })
      flapPanel(b, `${prefix}-dust-left`, 'left', leftP, labelOf(prefix, holeTabs ? 'sol askı kulağı' : 'sol toz kapağı', holeTabs ? 'left hang tab' : 'left dust flap'), holeTabs ? 'flap' : 'dust', y, d, holeTabs ? 0 : 90)
      flapPanel(b, `${prefix}-dust-right`, 'right', rightP, labelOf(prefix, holeTabs ? 'sağ askı kulağı' : 'sağ toz kapağı', holeTabs ? 'right hang tab' : 'right dust flap'), holeTabs ? 'flap' : 'dust', y, d, holeTabs ? 0 : 90)

      if (holeTabs) {
        const r = Math.min(3.5, ctx.W * 0.12)
        for (const seg of [ctx.left, ctx.right]) {
          if (seg.width > r * 4) b.cut(circlePath({ x: (seg.x1 + seg.x2) / 2, y: y + d * (dustDepth - r - 4) }, r), 'askı deliği')
        }
      }
      if (prefix === 'top' && ctx.spec.carryHandle) {
        const hw = Math.min(90, tuckSeg.width * 0.55)
        const hh = Math.min(24, ctx.lidDepth * 0.35)
        if (hw >= 30 && hh >= 8) b.cut(stadiumPath({ x: (tuckSeg.x1 + tuckSeg.x2) / 2, y: y + d * ctx.lidDepth * 0.5 }, hw, hh), 'taşıma el deliği')
        else b.warn('handle-small', 'warning', 'Kapak dili el deliği için küçük; delik atlandı.', 'Tuck flap too small for a hand hole; skipped.')
      }

      if (o.hanger) {
        flapPanel(b, `${prefix}-hang-tab`, opposite(side), other, { tr: 'Askı kulağı', en: 'Hang tab' }, 'flap', y, d, 0)
        const slotW = Math.min(30, otherSeg.width * 0.55)
        const cx = (otherSeg.x1 + otherSeg.x2) / 2
        const cy = y + d * ctx.hangHeight * 0.55
        if (slotW >= 12 && ctx.hangHeight >= 14) b.cut(stadiumPath({ x: cx, y: cy }, slotW, 4), 'euroslot askı deliği')
        else b.warn('euro-hole-small', 'warning', 'Askı kulağı euroslot için dar; delik atlandı.', 'Hang tab is too small for a euroslot; the hole was skipped.')
      }

      if (dustSlits) {
        for (const seg of [ctx.left, ctx.right]) {
          const mid = (seg.x1 + seg.x2) / 2
          const half = Math.min(7.5, seg.width * 0.22)
          if (half < 2) continue
          const yy = y + d * Math.max(3.2, dustDepth * 0.42)
          b.cutLine({ x: mid - half, y: yy }, { x: mid + half, y: yy }, 'toz kapağı kilit yarığı')
        }
      }

      if (o.style === 'lock45' || o.style === 'lock46') {
        // Kilit kanadı: dile komşu menteşe köşesinden uzak uç köşesine çapraz yarı kesim.
        const tip = y + d * dustDepth
        const leftNear = side === 'back' ? ctx.left.x1 : ctx.left.x2
        const leftFar = side === 'back' ? ctx.left.x2 : ctx.left.x1
        const rightNear = side === 'front' ? ctx.right.x1 : ctx.right.x2
        const rightFar = side === 'front' ? ctx.right.x2 : ctx.right.x1
        const inset = o.style === 'lock46' ? Math.min(lockChamfer, dustDepth * 0.6, ctx.W * 0.4) : 0
        b.addPath('cutcrease', [{ c: 'M', x: leftNear, y }, { c: 'L', x: leftFar + (leftFar > leftNear ? -inset : inset), y: tip }], 'kilit kanadı çapraz kırım')
        b.addPath('cutcrease', [{ c: 'M', x: rightNear, y }, { c: 'L', x: rightFar + (rightFar > rightNear ? -inset : inset), y: tip }], 'kilit kanadı çapraz kırım')
      }
    },
  }
}

const gableEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir): EndPlan => {
  const { L, W } = ctx
  const gableH = Math.max(10, W * 0.7)
  const inset = Math.min(L * 0.32, W * 0.5)
  const handleH = Math.max(12, Math.min(28, L * 0.22))
  const gable = (seg: Seg): Profile => [
    { p: { x: seg.x1, y } },
    { p: { x: seg.x1 + inset, y: y + d * gableH } },
    { p: { x: seg.x1 + inset, y: y + d * (gableH + handleH) }, r: 2 },
    { p: { x: seg.x2 - inset, y: y + d * (gableH + handleH) }, r: 2 },
    { p: { x: seg.x2 - inset, y: y + d * gableH } },
    { p: { x: seg.x2, y } },
  ]
  const gusset = (seg: Seg): Profile => {
    const rise = gableH * 0.92
    return [
      { p: { x: seg.x1, y } },
      { p: { x: seg.x1 + seg.width * 0.08, y: y + d * rise } },
      { p: { x: seg.x2 - seg.width * 0.08, y: y + d * rise } },
      { p: { x: seg.x2, y } },
    ]
  }
  const backP = gable(ctx.back)
  const frontP = gable(ctx.front)
  const leftP = gusset(ctx.left)
  const rightP = gusset(ctx.right)
  return {
    profiles: [backP, leftP, frontP, rightP],
    extent: gableH + handleH,
    emit: (b) => {
      const tilt = 62
      for (const [seg, parent] of [
        [ctx.back, 'back'],
        [ctx.front, 'front'],
      ] as const) {
        const gableId = `${prefix}-gable-${parent}`
        const handleId = `${prefix}-handle-${parent}`
        const ridge = y + d * gableH
        const gablePoly: Point[] = [
          { x: seg.x1, y },
          { x: seg.x1 + inset, y: ridge },
          { x: seg.x2 - inset, y: ridge },
          { x: seg.x2, y },
        ]
        b.panel({ id: gableId, name: gableId, label: labelOf(prefix, `çatı kapak (${parent === 'back' ? 'arka' : 'ön'})`, `gable (${parent})`), outline: gablePoly, role: 'lid', printable: true })
        b.fold({ parent, child: gableId, ...foldHorizontal(y, seg.x1, seg.x2, d === 1 ? 'above' : 'below', tilt) })
        const handlePoly: Point[] = [
          { x: seg.x1 + inset, y: ridge },
          { x: seg.x1 + inset, y: y + d * (gableH + handleH) },
          { x: seg.x2 - inset, y: y + d * (gableH + handleH) },
          { x: seg.x2 - inset, y: ridge },
        ]
        b.panel({ id: handleId, name: handleId, label: { tr: 'Tutamak', en: 'Handle strip' }, outline: handlePoly, role: 'flap', printable: true })
        b.fold({ parent: gableId, child: handleId, ...foldHorizontal(ridge, seg.x1 + inset, seg.x2 - inset, d === 1 ? 'above' : 'below', 90 - tilt) })
        b.creaseLine({ x: seg.x1 + inset, y: ridge }, { x: seg.x2 - inset, y: ridge }, 'tutamak kırımı')
        const holeW = Math.min((seg.width - 2 * inset) * 0.6, 70)
        const holeH = Math.min(handleH * 0.42, 14)
        if (holeW >= 20 && holeH >= 5) {
          b.cut(stadiumPath({ x: (seg.x1 + seg.x2) / 2, y: y + d * (gableH + handleH * 0.55) }, holeW, holeH), 'tutamak deliği')
        }
      }
      for (const [seg, parent, p] of [
        [ctx.left, 'left', leftP],
        [ctx.right, 'right', rightP],
      ] as const) {
        const id = `${prefix}-gusset-${parent}`
        flapPanel(b, id, parent, p, labelOf(prefix, `körük (${parent === 'left' ? 'sol' : 'sağ'})`, `gusset (${parent})`), 'gusset', y, d)
        const apex: Point = { x: (seg.x1 + seg.x2) / 2, y: y + d * gableH * 0.92 }
        b.creaseLine({ x: seg.x1, y }, apex, 'körük kırımı')
        b.creaseLine({ x: seg.x2, y }, apex, 'körük kırımı')
      }
    },
  }
}

const sealEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir, side: PanelSide, half: boolean, hanger: boolean): EndPlan => {
  const { W, caliper, cornerRadius, dustChamfer } = ctx
  const outerDepth = half ? Math.max(4, W / 2 - caliper / 2) : Math.max(6, W - caliper)
  const innerDepth = half ? outerDepth : Math.max(4, W * 0.55)
  const mainSeg = segOf(ctx, hanger ? 'front' : side)
  const otherSeg = segOf(ctx, hanger ? 'back' : opposite(side))
  const outer = sealFlapProfile({ x1: mainSeg.x1, x2: mainSeg.x2, y, direction: d, depth: outerDepth, cornerRadius })
  const inner: Profile = hanger
    ? hangTabProfile({ x1: otherSeg.x1, x2: otherSeg.x2, y, direction: d, height: ctx.hangHeight, gap: Math.max(1.5, caliper) })
    : sealFlapProfile({ x1: otherSeg.x1, x2: otherSeg.x2, y, direction: d, depth: innerDepth, cornerRadius })
  const dust = (seg: Seg): Profile => dustFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction: d, depth: ctx.dustDepth, chamfer: dustChamfer })
  const leftP = dust(ctx.left)
  const rightP = dust(ctx.right)
  const mainSide: PanelSide = hanger ? 'front' : side
  return {
    profiles: arrange(mainSide, outer, inner, leftP, rightP),
    extent: Math.max(outerDepth, hanger ? ctx.hangHeight : 0),
    emit: (b) => {
      flapPanel(b, `${prefix}-seal-outer`, mainSide, outer, labelOf(prefix, 'dış yapıştırma kapağı', 'outer seal flap'), 'flap', y, d)
      if (hanger) {
        flapPanel(b, `${prefix}-hang-tab`, opposite(mainSide), inner, { tr: 'Askı kulağı', en: 'Hang tab' }, 'flap', y, d, 0)
        const slotW = Math.min(30, otherSeg.width * 0.55)
        if (slotW >= 12 && ctx.hangHeight >= 14) {
          b.cut(stadiumPath({ x: (otherSeg.x1 + otherSeg.x2) / 2, y: y + d * ctx.hangHeight * 0.55 }, slotW, 4), 'euroslot askı deliği')
        }
      } else {
        flapPanel(b, `${prefix}-seal-inner`, opposite(mainSide), inner, labelOf(prefix, 'iç yapıştırma kapağı', 'inner seal flap'), 'lock', y, d)
        b.guide('glue', rectPath(otherSeg.x1 + 2, Math.min(y, y + d * innerDepth) + 2, otherSeg.width - 4, Math.max(2, innerDepth - 4)), 'yapıştırma alanı')
      }
      flapPanel(b, `${prefix}-dust-left`, 'left', leftP, labelOf(prefix, 'sol toz kapağı', 'left dust flap'), 'dust', y, d)
      flapPanel(b, `${prefix}-dust-right`, 'right', rightP, labelOf(prefix, 'sağ toz kapağı', 'right dust flap'), 'dust', y, d)
    },
  }
}

const snapEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir, side: PanelSide): EndPlan => {
  const { L, W, caliper } = ctx
  const minorDepth = Math.max(8, W * 0.38)
  const majorDepth = Math.max(12, W * 0.55)
  const tabWidth = Math.min(16, L * 0.14)
  const tabHeight = Math.min(10, majorDepth * 0.28)
  const tabInset = Math.max(6, L * 0.08)
  const majorSeg = segOf(ctx, side)
  const slotSeg = segOf(ctx, opposite(side))
  const major = snapLockMajorProfile({ x1: majorSeg.x1, x2: majorSeg.x2, y, direction: d, depth: majorDepth, tabWidth, tabHeight, tabInset })
  const slotted = snapLockMinorProfile({ x1: slotSeg.x1, x2: slotSeg.x2, y, direction: d, depth: majorDepth * 0.85, chamfer: majorDepth * 0.35 })
  const minor = (seg: Seg): Profile => snapLockMinorProfile({ x1: seg.x1, x2: seg.x2, y, direction: d, depth: minorDepth, chamfer: minorDepth * 0.45 })
  const leftP = minor(ctx.left)
  const rightP = minor(ctx.right)
  return {
    profiles: arrange(side, major, slotted, leftP, rightP),
    extent: majorDepth,
    emit: (b) => {
      flapPanel(b, `${prefix}-lock-major`, side, major, labelOf(prefix, 'kancalı kilit kapağı', 'hooked lock flap'), 'lock', y, d)
      flapPanel(b, `${prefix}-lock-slotted`, opposite(side), slotted, labelOf(prefix, 'yarıklı kilit kapağı', 'slotted lock flap'), 'lock', y, d)
      flapPanel(b, `${prefix}-lock-left`, 'left', leftP, labelOf(prefix, 'sol kilit kapağı', 'left lock flap'), 'lock', y, d)
      flapPanel(b, `${prefix}-lock-right`, 'right', rightP, labelOf(prefix, 'sağ kilit kapağı', 'right lock flap'), 'lock', y, d)
      const slotW = Math.min(tabWidth + 4, slotSeg.width * 0.2)
      const slotH = Math.max(3, caliper * 2)
      const slotY = y + d * majorDepth * 0.45
      const slotInset = tabInset + tabWidth / 2
      if (slotSeg.width > slotInset * 2 + slotW * 2) {
        b.cut(stadiumPath({ x: slotSeg.x1 + slotInset, y: slotY }, slotW, slotH), 'sol kilit yarığı')
        b.cut(stadiumPath({ x: slotSeg.x2 - slotInset, y: slotY }, slotW, slotH), 'sağ kilit yarığı')
      }
      if (majorDepth > W) {
        b.warn('lock-too-deep', 'warning', 'Kilit kapağı kutu derinliğinden uzun; kapanırken karşı duvara çarpar.', 'Lock flap is deeper than the box; it will hit the opposite wall.')
      }
    },
  }
}

const autoEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir): EndPlan => {
  const { L, W, caliper } = ctx
  const depth = Math.max(10, Math.min(L, W) * 0.5 - caliper)
  const bevel = Math.min(depth * 0.92, L * 0.4, W * 0.45)
  const flap = (seg: Seg, bevelSide: 'left' | 'right' | 'both'): Profile => autoBottomFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction: d, depth, bevel, bevelSide })
  const profiles: EndPlan['profiles'] = [flap(ctx.back, 'left'), flap(ctx.left, 'both'), flap(ctx.front, 'right'), flap(ctx.right, 'both')]
  return {
    profiles,
    extent: depth,
    emit: (b) => {
      const walls = [
        [`${prefix}-auto-back`, ctx.back, 'back', labelOf(prefix, 'arka otomatik kapak', 'auto flap (back)')],
        [`${prefix}-auto-left`, ctx.left, 'left', labelOf(prefix, 'sol otomatik kapak', 'auto flap (left)')],
        [`${prefix}-auto-front`, ctx.front, 'front', labelOf(prefix, 'ön otomatik kapak', 'auto flap (front)')],
        [`${prefix}-auto-right`, ctx.right, 'right', labelOf(prefix, 'sağ otomatik kapak', 'auto flap (right)')],
      ] as const
      walls.forEach(([id, seg, parent, label], i) => {
        const profile = profiles[i] as Profile
        b.panel({ id, name: id, label, outline: profileToPolygon(profile), role: 'bottom', printable: false })
        b.fold({ parent, child: id, ...foldHorizontal(y, seg.x1, seg.x2, d === 1 ? 'above' : 'below') })
        if (parent === 'front' || parent === 'back') {
          const fromLeft = parent === 'front'
          const a: Point = { x: fromLeft ? seg.x1 : seg.x2, y }
          const c: Point = { x: fromLeft ? seg.x1 + bevel : seg.x2 - bevel, y: y + d * depth }
          const e: Point = { x: fromLeft ? seg.x1 : seg.x2, y: y + d * depth }
          const lockId = `${id}-glue`
          b.panel({ id: lockId, name: lockId, label: { tr: 'Otomatik taban yapıştırma dili', en: 'Auto bottom glue tab' }, outline: [a, e, c], role: 'glue', printable: false })
          const spec = foldDiagonal(a, c, fromLeft ? 180 : -180)
          b.fold({ parent: id, child: lockId, axis: spec.axis, angle: spec.angle })
        }
      })
    },
  }
}

/** Yay üzerinde nokta dizisi (a→b, sagitta s; d yönüne şişkin). */
const arcPoints = (a: Point, b: Point, s: number, d: Dir, n = 10): Point[] => {
  const out: Point[] = []
  const cx = (a.x + b.x) / 2
  const half = Math.abs(b.x - a.x) / 2
  for (let i = 1; i < n; i++) {
    const t = -1 + (2 * i) / n
    const x = cx + t * half * Math.sign(b.x - a.x)
    out.push({ x, y: a.y + d * s * (1 - t * t) })
  }
  return out
}

/** Yaprak (taç) kapak: dört panelde de yaylı yapraklar; katlanınca birbirine geçer. */
const petalEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir): EndPlan => {
  const { L, W } = ctx
  const depth = Math.max(8, Math.min(L, W) * 0.62)
  const petal = (seg: Seg): Profile => {
    const r = ((seg.width / 2) ** 2 + depth ** 2) / (2 * depth)
    return [{ p: { x: seg.x1, y } }, { p: { x: seg.x2, y }, arc: { radius: r, ccw: d === -1 } }]
  }
  const segs = [ctx.back, ctx.left, ctx.front, ctx.right] as const
  const names = ['back', 'left', 'front', 'right'] as const
  return {
    profiles: [petal(ctx.back), petal(ctx.left), petal(ctx.front), petal(ctx.right)],
    extent: depth,
    emit: (b) => {
      segs.forEach((seg, i) => {
        const id = `${prefix}-petal-${names[i]}`
        const poly: Point[] = [{ x: seg.x1, y }, ...arcPoints({ x: seg.x1, y }, { x: seg.x2, y }, depth, d), { x: seg.x2, y }]
        b.panel({ id, name: id, label: labelOf(prefix, `yaprak kapak (${names[i]})`, `petal (${names[i]})`), outline: poly, role: 'lid', printable: true })
        b.fold({ parent: names[i], child: id, ...foldHorizontal(y, seg.x1, seg.x2, d === 1 ? 'above' : 'below', 100) })
      })
    },
  }
}

/** Sıkıştırma kapak: dört kanat, her birinde tepe noktasına giden çapraz kırımlar. */
const pinchEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir): EndPlan => {
  const { L, W } = ctx
  const depth = Math.max(8, Math.min(L, W) * 0.55)
  const g = Math.max(0.8, ctx.caliper)
  const flap = (seg: Seg): Profile => [{ p: { x: seg.x1, y } }, { p: { x: seg.x1 + g, y } }, { p: { x: seg.x1 + g, y: y + d * depth } }, { p: { x: seg.x2 - g, y: y + d * depth } }, { p: { x: seg.x2 - g, y } }, { p: { x: seg.x2, y } }]
  const segs = [ctx.back, ctx.left, ctx.front, ctx.right] as const
  const names = ['back', 'left', 'front', 'right'] as const
  const profiles = segs.map(flap) as EndPlan['profiles']
  return {
    profiles,
    extent: depth,
    emit: (b) => {
      segs.forEach((seg, i) => {
        const id = `${prefix}-pinch-${names[i]}`
        const poly: Point[] = [{ x: seg.x1 + g, y }, { x: seg.x1 + g, y: y + d * depth }, { x: seg.x2 - g, y: y + d * depth }, { x: seg.x2 - g, y }]
        b.panel({ id, name: id, label: labelOf(prefix, `sıkıştırma kanadı (${names[i]})`, `pinch flap (${names[i]})`), outline: poly, role: 'lid', printable: true })
        b.fold({ parent: names[i], child: id, ...foldHorizontal(y, seg.x1 + g, seg.x2 - g, d === 1 ? 'above' : 'below') })
        const apex: Point = { x: (seg.x1 + seg.x2) / 2, y: y + d * depth }
        b.creaseLine({ x: seg.x1 + g, y }, apex, 'sıkıştırma çapraz kırımı')
        b.creaseLine({ x: seg.x2 - g, y }, apex, 'sıkıştırma çapraz kırımı')
      })
    },
  }
}

/** Menteşeli kapak + kilit dilli dudak; karşı panelin üst kenarında yarıklar. */
const lidLockEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir, side: PanelSide, shape: 'rect' | 'round'): EndPlan => {
  const { W, caliper, dustChamfer } = ctx
  const lidDepth = Math.max(6, W - caliper)
  const lipDepth = Math.max(6, Math.min(ctx.tuckDepth * 0.55, W * 0.6))
  const tabH = Math.max(4, Math.min(10, lipDepth * 0.5))
  const lidSeg = segOf(ctx, side)
  const slotSeg = segOf(ctx, opposite(side))
  const tabW = Math.min(18, lidSeg.width * 0.18)
  const tabInset = Math.max(4, lidSeg.width * 0.12)
  const yLip = y + d * lidDepth
  const yLipEnd = yLip + d * lipDepth
  const yTab = yLipEnd + d * tabH
  const g = Math.max(1, caliper)
  const tab = (x1: number, x2: number): Profile =>
    shape === 'round'
      ? [{ p: { x: x1, y: yLipEnd } }, { p: { x: x2, y: yLipEnd }, arc: { radius: (x2 - x1) / 2, ccw: d === -1 } }]
      : [{ p: { x: x1, y: yLipEnd } }, { p: { x: x1 + g, y: yTab }, r: 1 }, { p: { x: x2 - g, y: yTab }, r: 1 }, { p: { x: x2, y: yLipEnd } }]
  const tl1 = lidSeg.x1 + tabInset
  const tr2 = lidSeg.x2 - tabInset
  const lid: Profile = [
    { p: { x: lidSeg.x1, y } },
    { p: { x: lidSeg.x1, y: yLip } },
    { p: { x: lidSeg.x1 + g, y: yLip } },
    { p: { x: lidSeg.x1 + g, y: yLipEnd }, r: 2 },
    ...tab(tl1, tl1 + tabW),
    ...tab(tr2 - tabW, tr2).slice(0),
    { p: { x: lidSeg.x2 - g, y: yLipEnd }, r: 2 },
    { p: { x: lidSeg.x2 - g, y: yLip } },
    { p: { x: lidSeg.x2, y: yLip } },
    { p: { x: lidSeg.x2, y } },
  ]
  // Ardışık aynı noktaları temizle
  const cleaned: Profile = lid.filter((c, i) => i === 0 || Math.hypot(c.p.x - (lid[i - 1] as { p: Point }).p.x, c.p.y - (lid[i - 1] as { p: Point }).p.y) > 1e-6)
  const other: Profile = ctx.wantNotch ? edgeWithThumbNotch(slotSeg.x1, slotSeg.x2, y, ctx.notchRadius, d) : flatEdge(slotSeg.x1, slotSeg.x2, y)
  const dust = (seg: Seg): Profile => dustFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction: d, depth: ctx.dustDepth, chamfer: dustChamfer })
  const leftP = dust(ctx.left)
  const rightP = dust(ctx.right)
  return {
    profiles: arrange(side, cleaned, other, leftP, rightP),
    extent: lidDepth + lipDepth + tabH,
    emit: (b) => {
      const lidId = `${prefix}-lid`
      b.panel({ id: lidId, name: lidId, label: labelOf(prefix, 'kapak', 'lid'), outline: rectPoints(lidSeg.x1, Math.min(y, yLip), lidSeg.width, lidDepth), role: 'lid', printable: true })
      b.fold({ parent: side, child: lidId, ...foldHorizontal(y, lidSeg.x1, lidSeg.x2, d === 1 ? 'above' : 'below') })
      const lipId = `${prefix}-lip`
      const lipPoly: Point[] = [{ x: lidSeg.x1 + g, y: yLip }, { x: lidSeg.x1 + g, y: yLipEnd }, { x: lidSeg.x2 - g, y: yLipEnd }, { x: lidSeg.x2 - g, y: yLip }]
      b.panel({ id: lipId, name: lipId, label: labelOf(prefix, 'kapak dudağı', 'lid lip'), outline: lipPoly, role: 'lock', printable: true })
      b.fold({ parent: lidId, child: lipId, ...foldHorizontal(yLip, lidSeg.x1 + g, lidSeg.x2 - g, d === 1 ? 'above' : 'below') })
      for (const x1 of [tl1, tr2 - tabW]) {
        // Karşı panelde yarık — dil eni + pay, üst kenardan dudak derinliği kadar aşağıda değil, kenara yakın
        const sx = side === 'back' ? slotSeg.x1 + (x1 - lidSeg.x1) : slotSeg.x2 - (x1 - lidSeg.x1) - tabW
        const sy = y - d * Math.max(3, tabH * 0.6)
        b.cutLine({ x: sx - g, y: sy }, { x: sx + tabW + g, y: sy }, 'kilit dili yarığı')
      }
      flapPanel(b, `${prefix}-dust-left`, 'left', leftP, labelOf(prefix, 'sol toz kapağı', 'left dust flap'), 'dust', y, d)
      flapPanel(b, `${prefix}-dust-right`, 'right', rightP, labelOf(prefix, 'sağ toz kapağı', 'right dust flap'), 'dust', y, d)
    },
  }
}

/** Tutamaklı üst (FEFCO 0217): ön/arka uzantılar el deliğiyle birleşir, yanlar toz kapağı. */
const carryEnd = (ctx: EndContext, prefix: 'top' | 'bottom', y: number, d: Dir): EndPlan => {
  const { L, W, dustChamfer } = ctx
  const handleH = Math.max(25, Math.min(W * 0.75, 90))
  const shoulder = Math.min(L * 0.12, handleH * 0.5)
  const handle = (seg: Seg): Profile => [
    { p: { x: seg.x1, y } },
    { p: { x: seg.x1 + shoulder, y: y + d * handleH } },
    { p: { x: seg.x2 - shoulder, y: y + d * handleH } },
    { p: { x: seg.x2, y } },
  ]
  const dust = (seg: Seg): Profile => dustFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction: d, depth: Math.min(ctx.dustDepth, W * 0.5), chamfer: dustChamfer })
  const backP = handle(ctx.back)
  const frontP = handle(ctx.front)
  const leftP = dust(ctx.left)
  const rightP = dust(ctx.right)
  return {
    profiles: [backP, leftP, frontP, rightP],
    extent: handleH,
    emit: (b) => {
      for (const [seg, parent, p] of [
        [ctx.back, 'back', backP],
        [ctx.front, 'front', frontP],
      ] as const) {
        const id = `${prefix}-handle-${parent}`
        flapPanel(b, id, parent, p, labelOf(prefix, `tutamak (${parent === 'back' ? 'arka' : 'ön'})`, `handle (${parent})`), 'lid', y, d)
        const holeW = Math.min(90, (seg.width - 2 * shoulder) * 0.6)
        const holeH = Math.min(26, handleH * 0.32)
        if (holeW >= 30 && holeH >= 10) b.cut(stadiumPath({ x: (seg.x1 + seg.x2) / 2, y: y + d * handleH * 0.62 }, holeW, holeH), 'el deliği')
      }
      flapPanel(b, `${prefix}-dust-left`, 'left', leftP, labelOf(prefix, 'sol toz kapağı', 'left dust flap'), 'dust', y, d)
      flapPanel(b, `${prefix}-dust-right`, 'right', rightP, labelOf(prefix, 'sağ toz kapağı', 'right dust flap'), 'dust', y, d)
    },
  }
}

const planEnd = (ctx: EndContext, prefix: 'top' | 'bottom'): EndPlan => {
  const spec = ctx.spec
  const style = prefix === 'top' ? spec.top : spec.bottom
  const side = prefix === 'top' ? spec.topSide : spec.bottomSide
  const y = prefix === 'top' ? ctx.H : 0
  const d: Dir = prefix === 'top' ? 1 : -1
  const hanger = prefix === 'top' && (spec.hanger === true || (ctx.hangTab && isTuckLike(style)))
  switch (style) {
    case 'open':
      return openEnd(ctx, y)
    case 'gable':
      return gableEnd(ctx, prefix, y, d)
    case 'seal':
      return sealEnd(ctx, prefix, y, d, side, false, hanger)
    case 'seal-half':
      return sealEnd(ctx, prefix, y, d, side, true, hanger)
    case 'snap':
      return snapEnd(ctx, prefix, y, d, side)
    case 'auto':
      return autoEnd(ctx, prefix, y, d)
    case 'petal':
      return petalEnd(ctx, prefix, y, d)
    case 'pinch':
      return pinchEnd(ctx, prefix, y, d)
    case 'lid-lock':
      return lidLockEnd(ctx, prefix, y, d, side, spec.lockTabShape ?? 'rect')
    case 'carry':
      return carryEnd(ctx, prefix, y, d)
    default:
      return tuckEnd(ctx, prefix, y, d, { style, side, hanger, slits: spec.slits === true })
  }
}

function buildCarton(spec: CartonSpec, params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const dustChamfer = num(params, 'dustFlapChamfer')
  const cornerRadius = num(params, 'tuckCornerRadius')
  const wantNotch = bool(params, 'thumbNotch')
  const notchRadius = optNum(params, 'thumbNotchRadius', 12)
  const hangTabParam = optNum(params, 'hangTabHeight', 0)
  const windowStyle = str(params, 'window')
  const windowW = num(params, 'windowWidth')
  const windowH = num(params, 'windowHeight')
  const bleed = num(params, 'bleed')
  const plainTuck = spec.top === 'tuck' || spec.top === 'full' || spec.bottom === 'tuck' || spec.bottom === 'full'
  const tuckFlapStyle = plainTuck ? (str(params, 'tuckFlapStyle') as EndContext['tuckFlapStyle']) : 'angled'
  const dustFlapStyle = plainTuck ? (str(params, 'dustFlapStyle') as EndContext['dustFlapStyle']) : 'normal'
  const tuckLock = plainTuck ? bool(params, 'tuckLock') : false
  const hangTab = isTuckLike(spec.top) ? bool(params, 'hangTab') : false

  const tuckDepthParam = num(params, 'tuckDepth')
  // Kapanış derinliği (diğer uç tiplerinin ölçüsü) ve tuck kapanışının kapak + dil ölçüleri.
  const tuckDepth = Math.max(6, W - 2 * caliper)
  const lidDepth = W
  const tongueDepth = tuckDepthParam > 0 ? tuckDepthParam : autoTongueDepth(W, H)
  const dustDepth = Math.max(4, tuckDepth - Math.max(1.5, 2 * caliper))

  const [back, left, front, right] = girthLayout([L, W, L, W]) as [Seg, Seg, Seg, Seg]
  const glueX1 = right.x2
  const glueX2 = glueX1 + glueWidth
  const flatWidth = glueWidth > 0 ? glueX2 : glueX1

  const ctx: EndContext = {
    spec,
    L,
    W,
    H,
    caliper,
    tuckDepth,
    lidDepth,
    tongueDepth,
    dustDepth,
    clearance: Math.max(0.5, caliper),
    cornerRadius,
    dustChamfer,
    wantNotch,
    notchRadius,
    hangHeight: hangTabParam > 0 ? hangTabParam : 25,
    tuckFlapStyle,
    dustFlapStyle,
    tuckLock,
    hangTab,
    back,
    left,
    front,
    right,
  }

  const b = new DielineBuilder(
    spec.id,
    {
      name: spec.name,
      ...(spec.standard === 'ECMA' ? { ecma: spec.code } : { fefco: spec.code }),
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const top = planEnd(ctx, 'top')
  const bottom = planEnd(ctx, 'bottom')

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const profile of bottom.profiles) emitProfile(outline, profile)
  const glueTaper = Math.min(3, H * 0.1)
  if (glueWidth > 0) {
    const glue = glueFlapProfile(glueX1, glueX2, 0, H, glueTaper)
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as Point)
  }
  outline.lineTo({ x: glueX1, y: H })
  for (let i = top.profiles.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(top.profiles[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'gövde çevresi')

  const walls: [string, Seg, I18nText][] = [
    ['back', back, { tr: 'Arka', en: 'Back' }],
    ['left', left, { tr: 'Sol', en: 'Left' }],
    ['front', front, { tr: 'Ön', en: 'Front' }],
    ['right', right, { tr: 'Sağ', en: 'Right' }],
  ]
  for (const [id, seg, label] of walls) {
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, H), role: 'wall' })
  }
  b.root('front')

  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue-flap',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(glueX1, glueX2, 0, H, glueTaper),
      role: 'glue',
      printable: false,
    })
  }

  top.emit(b)
  bottom.emit(b)

  const bodyFolds: [string, string, number, 'left' | 'right'][] = [
    ['front', 'left', front.x1, 'left'],
    ['left', 'back', left.x1, 'left'],
    ['front', 'right', front.x2, 'right'],
  ]
  if (glueWidth > 0) bodyFolds.push(['right', 'glue', right.x2, 'right'])
  for (const [parent, child, x, side] of bodyFolds) {
    b.fold({ parent, child, ...foldVertical(x, 0, H, side) })
  }

  if (windowStyle === 'oval' || windowStyle === 'rect') {
    const ww = windowW > 0 ? windowW : Math.min(L * 0.58, L - 12)
    const wh = windowH > 0 ? windowH : Math.min(H * 0.42, H - 16)
    const cx = (front.x1 + front.x2) / 2
    const cy = H * 0.5
    if (ww >= 8 && wh >= 8) {
      b.cut(windowStyle === 'oval' ? stadiumPath({ x: cx, y: cy }, ww, wh) : rectPath(cx - ww / 2, cy - wh / 2, ww, wh), 'pencere')
    }
  }

  if (spec.vents && spec.vents > 0) {
    const n = spec.vents
    const r = Math.min(7, L * 0.06, H * 0.08)
    const pitch = Math.min(L / (n + 1), r * 4)
    const cx0 = (front.x1 + front.x2) / 2 - ((n - 1) * pitch) / 2
    if (r >= 2) for (let i = 0; i < n; i++) b.cut(circlePath({ x: cx0 + i * pitch, y: H * 0.72 }, r), 'havalandırma deliği')
  }

  if (spec.zipper === 'strip') {
    // Yırtma şeridi: ön panel üst kısmında iki paralel perfore, sol uçta çekme dili
    const stripH = Math.max(6, Math.min(12, H * 0.08))
    const yS = H - Math.max(stripH * 1.5, Math.min(H * 0.3, 30))
    const x1 = front.x1
    const x2 = front.x2
    b.perf([{ c: 'M', x: x1, y: yS }, { c: 'L', x: x2, y: yS }], 'yırtma şeridi perforesi')
    b.perf([{ c: 'M', x: x1, y: yS + stripH }, { c: 'L', x: x2, y: yS + stripH }], 'yırtma şeridi perforesi')
    const tabW = Math.min(12, L * 0.12)
    b.cut(stadiumPath({ x: x1 + tabW / 2, y: yS + stripH / 2 }, tabW, Math.max(2, stripH * 0.5)), 'çekme başlangıç yarığı')
  } else if (spec.zipper === 'diamond') {
    const cx = (front.x1 + front.x2) / 2
    const cy = H / 2
    const hw = Math.min(L * 0.18, 22)
    const hh = Math.min(H * 0.32, 45)
    if (hw >= 5 && hh >= 8) {
      b.perf([{ c: 'M', x: cx, y: cy - hh }, { c: 'L', x: cx + hw, y: cy }, { c: 'L', x: cx, y: cy + hh }, { c: 'L', x: cx - hw, y: cy }, { c: 'Z' }], 'dispenser ağzı perforesi')
      b.cut(stadiumPath({ x: cx, y: cy }, hw * 0.6, Math.min(4, hw * 0.25)), 'başparmak yarığı')
    }
  }

  if (bleed > 0) {
    const minY = -bottom.extent
    const maxY = H + top.extent
    b.guide('bleed', rectPath(-bleed, minY - bleed, flatWidth + 2 * bleed, maxY - minY + 2 * bleed), 'taşma payı')
  }
  if (glueWidth > 0) b.guide('glue', rectPath(glueX1, 0, glueWidth, H), 'yapıştırma alanı')

  if (tongueDepth > H * 0.8 && (isTuckLike(spec.top) || isTuckLike(spec.bottom))) {
    b.warn('tuck-too-deep', 'warning', 'Kapak dili gövde yüksekliğine göre çok uzun; ön duvarın içine sığmaz.', 'Tuck tongue is too long for the body height; it will not fit inside the front wall.')
  }
  if (glueWidth > 0 && glueWidth < 8) {
    b.warn('glue-flap-narrow', 'warning', 'Yapıştırma payı 8 mm’den dar; otomatik yapıştırma makinesinde tutunma zayıf olur.', 'Glue flap narrower than 8 mm; bonding on an automatic gluer will be weak.')
  }

  return b.build()
}

const isTuckLike = (s: EndStyle): boolean => s === 'tuck' || s === 'ears' || s === 'ears-slit' || s === 'full' || s === 'lock45' || s === 'lock46'

const dctDims = (spec: CartonSpec): { a: number; b: number; c: number } => {
  for (const id of spec.dct) {
    const entry = DCT_INVENTORY.find((e) => e.id === id)
    if (entry?.dims.a && entry.dims.b && entry.dims.c) return { a: entry.dims.a, b: entry.dims.b, c: entry.dims.c }
  }
  return spec.fallbackDims ?? { a: 100, b: 50, c: 150 }
}

const paramsFor = (spec: CartonSpec): ParamDef[] => {
  const dims = dctDims(spec)
  const caliper = spec.caliper ?? (spec.materials.includes('corrugated') && !spec.materials.includes('carton') ? 1.5 : 0.5)
  const tuckLike = isTuckLike(spec.top) || isTuckLike(spec.bottom) || spec.top === 'lid-lock'
  const out: ParamDef[] = [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk (a)', en: 'Length (a)' }, unit: 'mm', min: 15, max: 1200, step: 0.5, default: dims.a, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik / derinlik (b)', en: 'Width / depth (b)' }, unit: 'mm', min: 8, max: 1200, step: 0.5, default: dims.b, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (c)', en: 'Height (c)' }, unit: 'mm', min: 10, max: 2000, step: 0.5, default: dims.c, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: caliper, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı (d5)', en: 'Glue flap (d5)' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 15, group: 'construction' },
    { kind: 'number', key: 'tuckDepth', label: { tr: 'Kapak dili derinliği', en: 'Tuck tongue depth' }, unit: 'mm', min: 0, max: 600, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'dustFlapChamfer', label: { tr: 'Toz kapağı pahı', en: 'Dust flap chamfer' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 3, advanced: true, group: 'construction' },
    { kind: 'number', key: 'tuckCornerRadius', label: { tr: 'Dil köşe yarıçapı', en: 'Tuck corner radius' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 3, advanced: true, group: 'construction' },
  ]
  if (tuckLike) {
    out.push(
      { kind: 'boolean', key: 'thumbNotch', label: { tr: 'Başparmak oyuğu', en: 'Thumb notch' }, default: false, group: 'options' },
      { kind: 'number', key: 'thumbNotchRadius', label: { tr: 'Oyuk yarıçapı', en: 'Notch radius' }, unit: 'mm', min: 3, max: 60, step: 0.5, default: 12, advanced: true, group: 'options' },
    )
  }
  const plainTuck = spec.top === 'tuck' || spec.top === 'full' || spec.bottom === 'tuck' || spec.bottom === 'full'
  if (plainTuck) {
    const fullTop = spec.top === 'full' || spec.bottom === 'full'
    out.push(
      {
        kind: 'enum',
        key: 'tuckFlapStyle',
        label: { tr: 'Kapak dili biçimi', en: 'Tuck flap style' },
        default: fullTop ? 'uni' : 'angled',
        advanced: true,
        group: 'options',
        options: [
          { value: 'angled', label: { tr: 'Açılı dil', en: 'Angled tuck' } },
          { value: 'uni', label: { tr: 'Düz dil (uni-tuck)', en: 'Uni tuck' } },
          { value: 'friction', label: { tr: 'Sürtünmeli dil', en: 'Friction-fit tuck' } },
        ],
      },
      {
        kind: 'enum',
        key: 'dustFlapStyle',
        label: { tr: 'Toz kapağı biçimi', en: 'Dust flap style' },
        default: spec.slits ? 'slit' : fullTop ? 'rounded' : 'normal',
        advanced: true,
        group: 'options',
        options: [
          { value: 'normal', label: { tr: 'Pahlı kanat', en: 'Chamfered dust flap' } },
          { value: 'angled', label: { tr: 'Tam açılı kanat', en: 'Full angled dust flap' } },
          { value: 'rounded', label: { tr: 'Yuvarlak kanat', en: 'Rounded dust flap' } },
          { value: 'slit', label: { tr: 'Yarıklı kanat (slit lock)', en: 'Slit lock dust flap' } },
        ],
      },
      { kind: 'boolean', key: 'tuckLock', label: { tr: 'Dilli kilit (sit lock)', en: 'Sit lock tuck' }, default: spec.slits === true, advanced: true, group: 'options' },
    )
  }
  if (isTuckLike(spec.top)) {
    out.push({ kind: 'boolean', key: 'hangTab', label: { tr: 'Askı kulağı (euroslot)', en: 'Hang tab (euroslot)' }, default: spec.hanger === true, advanced: true, group: 'options' })
  }
  if (spec.hanger || isTuckLike(spec.top)) {
    out.push({ kind: 'number', key: 'hangTabHeight', label: { tr: 'Askı kulağı yüksekliği', en: 'Hang tab height' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'options' })
  }
  out.push(
    {
      kind: 'enum',
      key: 'window',
      label: { tr: 'Pencere', en: 'Window' },
      default: spec.defaultWindow ?? 'none',
      advanced: spec.window !== true && !spec.defaultWindow,
      group: 'options',
      options: [
        { value: 'none', label: { tr: 'Yok', en: 'None' } },
        { value: 'rect', label: { tr: 'Dikdörtgen pencere', en: 'Rectangle window' } },
        { value: 'oval', label: { tr: 'Oval pencere', en: 'Oval window' } },
      ],
    },
    { kind: 'number', key: 'windowWidth', label: { tr: 'Pencere genişliği', en: 'Window width' }, unit: 'mm', min: 0, max: 1000, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'options' },
    { kind: 'number', key: 'windowHeight', label: { tr: 'Pencere yüksekliği', en: 'Window height' }, unit: 'mm', min: 0, max: 1000, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'options' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  )
  return out
}

export const cartonTemplate = (spec: CartonSpec): TemplateDefinition => ({
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
  build: (params) => buildCarton(spec, params),
})

// ---------------------------------------------------------------------------
// DCT spec tablosu
// ---------------------------------------------------------------------------

const T = (tr: string, en: string): I18nText => ({ tr, en })

const CARTON: MaterialKind[] = ['carton']
const CORR: MaterialKind[] = ['corrugated']

export const CARTON_SPECS: readonly CartonSpec[] = [
  // --- Tuck end (karton) ---------------------------------------------------
  {
    id: 'ecma-a20-20-01-03',
    code: 'A20.20.01.03',
    standard: 'ECMA',
    dct: ['becf-10803', 'becf-10206', 'becf-1082d93', 'becf-10838f7', 'becf-1085b23', 'becf-1086687', 'becf-108b67', 'becf-10701'],
    name: T('Ters kapaklı kutu (üst ön, alt arka)', 'Reverse tuck end (top front, bottom back)'),
    description: T(
      'En yaygın karton kutu: üst dil ön panelden, alt dil arka panelden kapanır. Tuck end ailesinin DCT ana kaydı.',
      'The most common folding carton: top tuck from the front, bottom tuck from the back. DCT’s flagship tuck end.',
    ),
    keywords: ['rte', 'reverse tuck', 'ters kapak', 'tuck end'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'back',
    window: true,
  },
  {
    id: 'ecma-a20-20-03-03',
    code: 'A20.20.03.03',
    standard: 'ECMA',
    dct: ['becf-10401'],
    name: T('Düz kapaklı kutu (dilller önde)', 'Straight tuck end (front tucks)'),
    description: T('Her iki dil de ön panelden kapanır; arka yüz kesintisiz kalır.', 'Both tucks close from the front panel; the back face stays uninterrupted.'),
    keywords: ['ste', 'straight tuck', 'düz kapak'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'front',
  },
  {
    id: 'ecma-a40-40',
    code: 'A40.40.03.03',
    standard: 'ECMA',
    dct: ['becf-10201'],
    name: T('Tam kanatlı kutu', 'Full flap tuck end'),
    description: T('Üst ve alt uçta tam derinlikte yuvarlatılmış yan kanatlar ve geniş düz dil; toz geçirmez kapanış.', 'Full-depth rounded side flaps with a wide uni tuck at both ends for a dust-tight closure.'),
    keywords: ['full flap', 'tam kanat', 'a40'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'full',
    topSide: 'front',
    bottom: 'full',
    bottomSide: 'front',
  },
  {
    id: 'ecma-a45-45',
    code: 'A45.45.01.01',
    standard: 'ECMA',
    dct: ['becf-10202'],
    name: T('Çapraz kilitli kanatlı kutu', 'Diagonal lock flap carton'),
    description: T('Yan kanatlar çapraz yarı kesimle birbirine kilitlenir; dil yapıştırmasız sıkı kapanır.', 'Side flaps interlock along diagonal cut-creases so the tuck closes tight without glue.'),
    keywords: ['lock flap', 'kilit kanat', 'a45'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'lock45',
    topSide: 'back',
    bottom: 'lock45',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a46-46',
    code: 'A46.46.03.03',
    standard: 'ECMA',
    dct: ['becf-10203'],
    name: T('Açılı kilit kanatlı kutu', 'Angled lock flap carton'),
    description: T('A45’in açılı kanatlı sürümü; kanatlar uçta daralır ve çapraz kırımla kilitlenir.', 'Angled-flap version of A45; flaps taper at the tip and lock along a diagonal crease.'),
    keywords: ['lock flap', 'açılı kanat', 'a46'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'lock46',
    topSide: 'front',
    bottom: 'lock46',
    bottomSide: 'front',
  },
  {
    id: 'ecma-a20-20-32-33',
    code: 'A20.20.01.01.32.33',
    standard: 'ECMA',
    dct: ['becf-10204', 'becf-10210', 'becf-10501'],
    name: T('Askılı düz kapaklı kutu (dilli kilit)', 'Straight tuck end with hang tab and slit lock'),
    description: T('Arka panelde euroslot askı kulağı; dilli kilit ve yarıklı toz kapaklarıyla raf kutusu.', 'Euroslot hang tab on the back panel; sit-lock tucks and slit dust flaps for retail hanging.'),
    keywords: ['askılı', 'hang tab', 'euroslot', 'sit lock'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'back',
    hanger: true,
    slits: true,
  },
  // --- Tuck end (oluklu) ---------------------------------------------------
  {
    id: 'fefco-0211',
    code: '0211',
    standard: 'FEFCO',
    dct: ['becf-20101'],
    name: T('Ters kapaklı oluklu kutu', 'Corrugated reverse tuck end'),
    description: T('E/B dalga oluklu için ters kapaklı kutu; dil derinlikleri malzeme kalınlığına göre ayarlanır.', 'Reverse tuck end for E/B-flute corrugated; tuck depths account for board thickness.'),
    keywords: ['rte', 'oluklu', 'corrugated tuck'],
    category: 'tuck-end-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'back',
    caliper: 1.5,
  },
  {
    id: 'fefco-0210-01',
    code: '0210',
    standard: 'FEFCO',
    dct: ['becf-20301'],
    name: T('Düz kapaklı oluklu kutu (arka)', 'Corrugated straight tuck end (back)'),
    description: T('Her iki dil arka panelden; oluklu mukavva için.', 'Both tucks from the back panel; corrugated board.'),
    keywords: ['ste', 'oluklu', 'corrugated tuck'],
    category: 'tuck-end-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'back',
    bottom: 'tuck',
    bottomSide: 'back',
    caliper: 1.5,
  },
  {
    id: 'fefco-0210-03',
    code: '0210',
    standard: 'FEFCO',
    dct: ['becf-20401'],
    name: T('Düz kapaklı oluklu kutu (ön)', 'Corrugated straight tuck end (front)'),
    description: T('Her iki dil ön panelden; oluklu mukavva için.', 'Both tucks from the front panel; corrugated board.'),
    keywords: ['ste', 'oluklu', 'corrugated tuck'],
    category: 'tuck-end-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'front',
    caliper: 1.5,
  },
  // --- Snap lock (karton) --------------------------------------------------
  {
    id: 'ecma-a55-20-01-01',
    code: 'A55.20.01.01',
    standard: 'ECMA',
    dct: ['becf-10901', 'becf-10c02', 'becf-10d01'],
    name: T('Kilitli tabanlı kutu (dil arkada)', 'Snap lock bottom, back tuck'),
    description: T('1-2-3 kilit taban; üst dil ve kancalı kilit kapağı aynı (arka) panelden.', '1-2-3 snap lock base; top tuck and hooked lock flap both on the back panel.'),
    keywords: ['snap lock', 'crash lock', 'kilitli taban', '1-2-3'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    window: true,
  },
  {
    id: 'ecma-a55-01',
    code: 'A55.01.01.00',
    standard: 'ECMA',
    dct: ['becf-10911'],
    name: T('Kilitli tabanlı açık kutu', 'Snap lock bottom, open top'),
    description: T('Üstü açık; kilitli tabanla elde kurulan sergileme/taşıma kutusu.', 'Open top with a snap lock base — hand-assembled display or carry tray.'),
    keywords: ['open top', 'açık üst', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'open',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    fallbackDims: { a: 200, b: 100, c: 100 },
  },
  {
    id: 'ecma-a55-40',
    code: 'A55.40.01.03',
    standard: 'ECMA',
    dct: ['becf-10912'],
    name: T('Kilitli taban + tam kanatlı üst', 'Snap lock bottom, full flap top'),
    description: T('Altta 1-2-3 kilit, üstte tam derinlikli yan kanatlar ve geniş dil.', 'Snap lock base with full-depth side flaps and a wide tuck on top.'),
    keywords: ['snap lock', 'full flap', 'tam kanat'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'full',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a55-45',
    code: 'A55.45.01.01',
    standard: 'ECMA',
    dct: ['becf-10913'],
    name: T('Kilitli taban + çapraz kilit kanat', 'Snap lock bottom, diagonal lock flaps'),
    description: T('Altta 1-2-3 kilit, üstte çapraz kırımlı kilit kanatlar.', 'Snap lock base with diagonal-crease locking flaps on top.'),
    keywords: ['snap lock', 'lock flap'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'lock45',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a55-46',
    code: 'A55.46.01.03',
    standard: 'ECMA',
    dct: ['becf-10914'],
    name: T('Kilitli taban + açılı kilit kanat', 'Snap lock bottom, angled lock flaps'),
    description: T('Altta 1-2-3 kilit, üstte açılı çapraz kırımlı kilit kanatlar.', 'Snap lock base with angled locking flaps on top.'),
    keywords: ['snap lock', 'lock flap', 'açılı kanat'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'lock46',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a55-20-32-33',
    code: 'A55.20.01.01.32.33',
    standard: 'ECMA',
    dct: ['becf-10915', 'becf-12e01'],
    name: T('Askılı kilitli tabanlı kutu', 'Snap lock bottom with hang tab'),
    description: T('Euroslot askı kulağı, dilli kilit ve yarıklı toz kapağı; raf ürünleri için kilitli taban.', 'Euroslot hang tab, sit-lock tuck and slit dust flaps over a snap lock base.'),
    keywords: ['askılı', 'hang tab', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
    hanger: true,
    slits: true,
  },
  {
    id: 'ecma-a55-10-32',
    code: 'A55.10.01.03.32',
    standard: 'ECMA',
    dct: ['becf-10917', 'becf-10a11'],
    name: T('Askılı kilitli taban, kısa kulaklı', 'Snap lock bottom, ear tuck with hang tab'),
    description: T('Kısa toz kulaklı üst dil ve euroslot askı; kilitli taban.', 'Short ear dust flaps with a hang tab over a snap lock base.'),
    keywords: ['askılı', 'ears', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'ears',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
    hanger: true,
    fallbackDims: { a: 200, b: 50, c: 150 },
  },
  {
    id: 'ecma-a55-10',
    code: 'A55.10.01.03',
    standard: 'ECMA',
    dct: ['becf-10918'],
    name: T('Kilitli taban, kısa kulaklı dil', 'Snap lock bottom, ear tuck'),
    description: T('Üstte kısa toz kulaklı tuck dili; altta 1-2-3 kilit.', 'Short-eared tuck on top, snap lock base below.'),
    keywords: ['ears', 'kulak', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'ears',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a55-12',
    code: 'A55.12.01.03',
    standard: 'ECMA',
    dct: ['becf-10919'],
    name: T('Kilitli taban, yarıklı kulaklı dil', 'Snap lock bottom, slit-ear tuck'),
    description: T('Dilli kilit ve yarıklı kısa kulaklar; altta 1-2-3 kilit.', 'Sit-lock tuck with slit ears on top, snap lock base below.'),
    keywords: ['sit lock', 'slit', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'ears-slit',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a55-75',
    code: 'A55.75.01.03',
    standard: 'ECMA',
    dct: ['becf-10b01', 'becf-10b03'],
    name: T('Çatı kapaklı kilitli tabanlı kutu', 'Gable top, snap lock bottom'),
    description: T('Tutamaklı çatı kapak; altta 1-2-3 kilit. Hediye ve gıda taşıma kutusu.', 'Gable top with carry handle over a snap lock base — gift and takeaway packaging.'),
    keywords: ['gable', 'çatı', 'tutamak', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'gable',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
  },
  // --- Snap lock (oluklu) --------------------------------------------------
  {
    id: 'fefco-0215-01',
    code: '0215',
    standard: 'FEFCO',
    dct: ['becf-20901'],
    name: T('Oluklu kilitli tabanlı kutu (dil arkada)', 'Corrugated snap lock bottom (back tuck)'),
    description: T('Oluklu mukavva için 1-2-3 kilit taban; dil arkadan.', 'Snap lock base for corrugated board; back tuck.'),
    keywords: ['snap lock', 'oluklu', '0215'],
    category: 'snap-lock-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    caliper: 1.5,
  },
  {
    id: 'fefco-0215-03',
    code: '0215',
    standard: 'FEFCO',
    dct: ['becf-20a01'],
    name: T('Oluklu kilitli tabanlı kutu (dil önde)', 'Corrugated snap lock bottom (front tuck)'),
    description: T('Oluklu mukavva için 1-2-3 kilit taban; dil önden.', 'Snap lock base for corrugated board; front tuck.'),
    keywords: ['snap lock', 'oluklu', '0215'],
    category: 'snap-lock-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
    caliper: 1.5,
  },
  // --- Auto bottom (karton) -----------------------------------------------
  {
    id: 'ecma-a60-20-00-03',
    code: 'A60.20.00.03',
    standard: 'ECMA',
    dct: ['becf-11101'],
    name: T('Otomatik tabanlı kutu (dil önde)', 'Tuck top auto bottom (front tuck)'),
    description: T('Yapıştırmalı otomatik taban; üst dil ön panelden.', 'Glued crash-lock base; top tuck from the front panel.'),
    keywords: ['auto bottom', 'crash lock', 'otomatik taban'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a60-01',
    code: 'A60.01.00.00',
    standard: 'ECMA',
    dct: ['becf-11011'],
    name: T('Otomatik tabanlı açık kutu', 'Auto bottom, open top'),
    description: T('Üstü açık; otomatik tabanlı sergileme/taşıma kutusu.', 'Open top over a glued auto bottom — display or carry tray.'),
    keywords: ['open top', 'açık üst', 'auto bottom'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'open',
    topSide: 'back',
    bottom: 'auto',
    bottomSide: 'back',
    fallbackDims: { a: 200, b: 100, c: 100 },
  },
  {
    id: 'ecma-a60-40',
    code: 'A60.40.00.03',
    standard: 'ECMA',
    dct: ['becf-11012'],
    name: T('Otomatik taban + tam kanatlı üst', 'Auto bottom, full flap top'),
    description: T('Otomatik taban; üstte tam derinlikli yan kanatlar ve geniş dil.', 'Auto bottom with full-depth side flaps and a wide tuck on top.'),
    keywords: ['auto bottom', 'full flap'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'full',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a60-45',
    code: 'A60.45.00.01',
    standard: 'ECMA',
    dct: ['becf-11013'],
    name: T('Otomatik taban + çapraz kilit kanat', 'Auto bottom, diagonal lock flaps'),
    description: T('Otomatik taban; üstte çapraz kırımlı kilit kanatlar.', 'Auto bottom with diagonal-crease locking flaps on top.'),
    keywords: ['auto bottom', 'lock flap'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'lock45',
    topSide: 'back',
    bottom: 'auto',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a60-46',
    code: 'A60.46.00.01',
    standard: 'ECMA',
    dct: ['becf-11014'],
    name: T('Otomatik taban + açılı kilit kanat', 'Auto bottom, angled lock flaps'),
    description: T('Otomatik taban; üstte açılı çapraz kırımlı kilit kanatlar.', 'Auto bottom with angled locking flaps on top.'),
    keywords: ['auto bottom', 'lock flap', 'açılı kanat'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'lock46',
    topSide: 'back',
    bottom: 'auto',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a60-20-32-33',
    code: 'A60.20.00.01.32.33',
    standard: 'ECMA',
    dct: ['becf-11015', 'becf-12d01'],
    name: T('Askılı otomatik tabanlı kutu', 'Auto bottom with hang tab'),
    description: T('Euroslot askı kulağı, dilli kilit ve yarıklı toz kapağı; otomatik taban.', 'Euroslot hang tab, sit-lock tuck and slit dust flaps over an auto bottom.'),
    keywords: ['askılı', 'hang tab', 'auto bottom'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
    hanger: true,
    slits: true,
  },
  {
    id: 'ecma-a60-10-32',
    code: 'A60.10.00.03.32',
    standard: 'ECMA',
    dct: ['becf-11017', 'becf-1101c'],
    name: T('Askılı otomatik taban, kısa kulaklı', 'Auto bottom, ear tuck with hang tab'),
    description: T('Kısa toz kulaklı üst dil ve euroslot askı; otomatik taban.', 'Short ear dust flaps with a hang tab over an auto bottom.'),
    keywords: ['askılı', 'ears', 'auto bottom'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'ears',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
    hanger: true,
  },
  {
    id: 'ecma-a60-10',
    code: 'A60.10.00.03',
    standard: 'ECMA',
    dct: ['becf-11018'],
    name: T('Otomatik taban, kısa kulaklı dil', 'Auto bottom, ear tuck'),
    description: T('Üstte kısa toz kulaklı tuck dili; otomatik taban.', 'Short-eared tuck on top, auto bottom below.'),
    keywords: ['ears', 'kulak', 'auto bottom'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'ears',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a60-12',
    code: 'A60.12.00.03',
    standard: 'ECMA',
    dct: ['becf-11019'],
    name: T('Otomatik taban, yarıklı kulaklı dil', 'Auto bottom, slit-ear tuck'),
    description: T('Dilli kilit ve yarıklı kısa kulaklar; otomatik taban.', 'Sit-lock tuck with slit ears on top, auto bottom below.'),
    keywords: ['sit lock', 'slit', 'auto bottom'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'ears-slit',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a60-75',
    code: 'A60.75.00.03',
    standard: 'ECMA',
    dct: ['becf-10b02', 'becf-10b04'],
    name: T('Çatı kapaklı otomatik tabanlı kutu', 'Gable top, auto bottom'),
    description: T('Tutamaklı çatı kapak; yapıştırmalı otomatik taban.', 'Gable top with carry handle over a glued auto bottom.'),
    keywords: ['gable', 'çatı', 'tutamak', 'auto bottom'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CARTON,
    top: 'gable',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
  },
  // --- Auto bottom (oluklu) -----------------------------------------------
  {
    id: 'fefco-0713-01',
    code: '0713',
    standard: 'FEFCO',
    dct: ['becf-21001'],
    name: T('Oluklu otomatik tabanlı kutu (dil arkada)', 'Corrugated auto bottom (back tuck)'),
    description: T('Oluklu mukavva için yapıştırmalı otomatik taban; dil arkadan.', 'Glued crash-lock base for corrugated board; back tuck.'),
    keywords: ['auto bottom', 'oluklu', '0713'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'back',
    bottom: 'auto',
    bottomSide: 'back',
    caliper: 1.5,
  },
  {
    id: 'fefco-0713-03',
    code: '0713',
    standard: 'FEFCO',
    dct: ['becf-21101'],
    name: T('Oluklu otomatik tabanlı kutu (dil önde)', 'Corrugated auto bottom (front tuck)'),
    description: T('Oluklu mukavva için yapıştırmalı otomatik taban; dil önden.', 'Glued crash-lock base for corrugated board; front tuck.'),
    keywords: ['auto bottom', 'oluklu', '0713'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'front',
    bottom: 'auto',
    bottomSide: 'back',
    caliper: 1.5,
  },
  // --- Standart karton (seal end) -----------------------------------------
  {
    id: 'ecma-a12-12',
    code: 'A12.12.01.01',
    standard: 'ECMA',
    dct: ['becf-11d02', 'becf-11d06'],
    name: T('Eşit kapaklı yapıştırmalı kutu', 'Seal end with equal flaps'),
    description: T('Üst ve altta ortada birleşen eşit yapıştırma kapakları; makinede kapatılan gıda/ilaç kutusu.', 'Equal seal flaps meeting at the centre top and bottom — machine-closed food and pharma cartons.'),
    keywords: ['seal end', 'yapıştırmalı uç', 'a12'],
    category: 'standard-boxes',
    materials: CARTON,
    top: 'seal-half',
    topSide: 'back',
    bottom: 'seal-half',
    bottomSide: 'back',
  },
  {
    id: 'ecma-a11-11-32',
    code: 'A11.11.03.03.32',
    standard: 'ECMA',
    dct: ['becf-11d03'],
    name: T('Askılı yapıştırmalı kutu', 'Seal end with hang tab'),
    description: T('Yapıştırmalı uç kapakları ve arka panelde euroslot askı kulağı.', 'Seal end flaps with a euroslot hang tab on the back panel.'),
    keywords: ['seal end', 'askılı', 'hang tab'],
    category: 'standard-boxes',
    materials: CARTON,
    top: 'seal',
    topSide: 'front',
    bottom: 'seal',
    bottomSide: 'front',
    hanger: true,
  },
  {
    id: 'ecma-a10-20-32',
    code: 'A10.20.03.03.32.51',
    standard: 'ECMA',
    dct: ['becf-11e02'],
    name: T('Askılı kutu, yapıştırmalı alt + tuck üst', 'Hang tab carton, seal bottom and tuck top'),
    description: T('Alt uç makinede yapıştırılır, üst dil elle kapanır; arka panelde euroslot askı.', 'Machine-sealed bottom, hand-closed tuck top and a euroslot hang tab on the back.'),
    keywords: ['seal end', 'tuck', 'askılı', 'hang tab'],
    category: 'special-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'seal',
    bottomSide: 'front',
    hanger: true,
  },
  // --- DCT ek şablonlar: pencere, kilit kapak, taç/sıkıştırma, tutamak, dispenser ------
  {
    id: 'snap-lock-window',
    code: 'A55.20.01.03.W',
    standard: 'ECMA',
    dct: ['becf-1091c'],
    name: T('Pencereli snap-lock kutu', 'Snap-lock box with window'),
    description: T('1-2-3 kilit taban, dilli üst kapak ve ön panelde yuvarlatılmış pencere; raf ürünleri için.', 'Crash-lock bottom, tuck top and a rounded window on the front panel for retail display.'),
    keywords: ['pencere', 'window', 'snap lock', 'raf'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    window: true,
    defaultWindow: 'rect',
  },
  {
    id: 'snap-lock-lid-tabs',
    code: 'A55.20.03.04.82',
    standard: 'ECMA',
    dct: ['becf-1091d'],
    name: T('Kilit dilli menteşeli kapak, snap-lock taban', 'Hinged lid with lock tabs, snap-lock bottom'),
    description: T('Arka panelden menteşeli kapak; ön dudaktaki iki dikdörtgen dil ön paneldeki yarıklara girer. Geniş ve alçak ürünler için.', 'Lid hinged from the back; two rectangular tabs on the lip lock into slits on the front panel. Wide, shallow products.'),
    keywords: ['menteşeli kapak', 'hinged lid', 'kilit dili', 'lock tab', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'lid-lock',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    lockTabShape: 'rect',
  },
  {
    id: 'ecma-a55-20-03-04-83',
    code: 'A55.20.03.04.83',
    standard: 'ECMA',
    dct: ['becf-10e01'],
    name: T('Yarım daire kilit dilli kapak, snap-lock taban', 'Hinged lid with round lock tabs, snap-lock bottom'),
    description: T('Menteşeli kapak dudağında iki yarım daire dil; ön panel yarıklarına oturur. Kilit taban.', 'Two semicircular tabs on the hinged lid lip seat into slits on the front panel; crash-lock bottom.'),
    keywords: ['menteşeli kapak', 'hinged lid', 'yarım daire', 'round tab', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'lid-lock',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    lockTabShape: 'round',
  },
  {
    id: 'snap-lock-pinch-top',
    code: 'A55.65',
    standard: 'ECMA',
    dct: ['becf-10b05'],
    name: T('Sıkıştırma kapaklı snap-lock kutu', 'Snap-lock box with pinch top'),
    description: T('Dört üst kanat çapraz kırımlarla tepe noktasında birleşir (yastık/hediye kapanışı); 1-2-3 kilit taban.', 'Four top flaps meet at a point along diagonal creases (pinch closure); crash-lock bottom.'),
    keywords: ['sıkıştırma', 'pinch top', 'hediye', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CARTON,
    top: 'pinch',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'fefco-0215-handle',
    code: '0215',
    standard: 'FEFCO',
    dct: ['becf-20d01'],
    name: T('El delikli snap-lock oluklu kutu', 'Corrugated snap-lock box with hand hole'),
    description: T('Kilit taban, dilli üst; kapak dilinde taşıma el deliği ve ön panelde havalandırma delikleri.', 'Crash-lock bottom, tuck top; hand hole in the tuck flap and vent holes on the front.'),
    keywords: ['el deliği', 'hand hole', 'havalandırma', 'vent', 'oluklu', 'snap lock'],
    category: 'snap-lock-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    caliper: 1.5,
    carryHandle: true,
    vents: 2,
  },
  {
    id: 'fefco-0216',
    code: '0216',
    standard: 'FEFCO',
    dct: ['becf-21d08'],
    name: T('FEFCO 0216 — kilit tabanlı, kulaklı üst', 'FEFCO 0216 — lock bottom, short top flaps'),
    description: T('Kilit taban; üstte kısa kulaklı tuck. Hafif dolum için oluklu.', 'Lock bottom with a short-eared tuck top; light-duty corrugated.'),
    keywords: ['0216', 'oluklu', 'kilit taban'],
    category: 'snap-lock-boxes',
    materials: CORR,
    top: 'ears',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    caliper: 1.5,
    fallbackDims: { a: 200, b: 100, c: 150 },
  },
  {
    id: 'tuck-end-hole-tabs',
    code: 'A20.20.01.03.36',
    standard: 'ECMA',
    dct: ['becf-10601'],
    name: T('Askı delikli kulaklı tuck end', 'Tuck end with hang-hole tabs'),
    description: T('Üst toz kapakları yuvarlak askı delikli uzun kulaklara uzatılmış; iki noktadan asılır.', 'Top dust flaps extended into long tabs with round hang holes for two-point hanging.'),
    keywords: ['askı deliği', 'hang hole', 'kulak', 'tuck end'],
    category: 'tuck-end-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'back',
    holeTabs: true,
  },
  {
    id: 'fefco-0713-handle',
    code: '0713',
    standard: 'FEFCO',
    dct: ['becf-21401'],
    name: T('El delikli otomatik tabanlı oluklu kutu', 'Corrugated auto-bottom box with hand hole'),
    description: T('Otomatik yapıştırmalı taban, dilli üst; kapakta el deliği, ön panelde havalandırma.', 'Auto-lock bottom, tuck top; hand hole in the lid and vents on the front.'),
    keywords: ['el deliği', 'hand hole', 'auto bottom', 'oluklu'],
    category: 'tuck-top-auto-bottom-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'back',
    bottom: 'auto',
    bottomSide: 'back',
    caliper: 1.5,
    carryHandle: true,
    vents: 2,
  },
  {
    id: 'seal-end-tear-strip',
    code: 'A10.10.03.03.T',
    standard: 'ECMA',
    dct: ['becf-11d04'],
    name: T('Yırtma şeritli yapıştırmalı kutu', 'Seal end box with tear strip'),
    description: T('Yapıştırmalı uçlar; ön panelde iki paralel perfore arasında çekme dilli yırtma şeridi.', 'Glued seal ends; tear strip between two parallel perforations with a pull tab on the front.'),
    keywords: ['yırtma şeridi', 'tear strip', 'zipper', 'seal end'],
    category: 'standard-boxes',
    materials: CARTON,
    top: 'seal',
    topSide: 'front',
    bottom: 'seal',
    bottomSide: 'front',
    zipper: 'strip',
  },
  {
    id: 'seal-end-dispenser',
    code: 'A10.10.03.03.D',
    standard: 'ECMA',
    dct: ['becf-11d05'],
    name: T('Dispenser ağızlı yapıştırmalı kutu', 'Seal end box with dispenser opening'),
    description: T('Yapıştırmalı uçlar; ön panelde baklava biçimli perforeli dispenser ağzı (mendil, poşet çay).', 'Glued seal ends; diamond-shaped perforated dispenser opening on the front (tissues, tea bags).'),
    keywords: ['dispenser', 'baklava', 'perfore', 'seal end'],
    category: 'standard-boxes',
    materials: CARTON,
    top: 'seal',
    topSide: 'front',
    bottom: 'seal',
    bottomSide: 'front',
    zipper: 'diamond',
  },
  {
    id: 'fefco-0217',
    code: '0217',
    standard: 'FEFCO',
    dct: ['becf-21e1f', 'becf-21e20'],
    name: T('FEFCO 0217 — tutamaklı taşıma kutusu', 'FEFCO 0217 — carry box with handle'),
    description: T('Ön ve arka panel uzantıları el delikli tutamak oluşturur; yanlar toz kapağı, kilit taban.', 'Front and back extensions form a hand-hole handle; side dust flaps and a crash-lock bottom.'),
    keywords: ['0217', 'tutamak', 'handle', 'taşıma', 'carry', 'oluklu'],
    category: 'special-boxes',
    materials: CORR,
    top: 'carry',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
    caliper: 1.5,
  },
  {
    id: 'corr-carry-tuck',
    code: '0217.T',
    standard: 'FEFCO',
    dct: ['becf-21d07'],
    name: T('Tutamaklı oluklu kutu, dilli taban', 'Corrugated carry box, tuck bottom'),
    description: T('El delikli tutamak üstte; altta dilli kapak.', 'Hand-hole handle on top with a tuck-flap bottom.'),
    keywords: ['tutamak', 'handle', 'taşıma', 'oluklu'],
    category: 'standard-boxes',
    materials: CORR,
    top: 'carry',
    topSide: 'back',
    bottom: 'tuck',
    bottomSide: 'back',
    caliper: 1.5,
  },
  {
    id: 'fefco-0207',
    code: '0207',
    standard: 'FEFCO',
    dct: ['becf-21e07'],
    name: T('FEFCO 0207 — kilit kanatlı koli', 'FEFCO 0207 — locking flap container'),
    description: T('Açılı kilit kanatlar üst ve altta çapraz kırımla birbirine geçer; yapıştırma payı ile kapanan oluklu koli.', 'Angled lock flaps interlock along diagonal creases at both ends; glued corrugated container.'),
    keywords: ['0207', 'kilit kanat', 'lock flap', 'oluklu'],
    category: 'special-boxes',
    materials: CORR,
    top: 'lock46',
    topSide: 'front',
    bottom: 'lock46',
    bottomSide: 'back',
    caliper: 1.5,
    vents: 6,
  },
  {
    id: 'corr-thin-tuck-lock',
    code: '0211.N',
    standard: 'FEFCO',
    dct: ['becf-21e23'],
    name: T('İnce oluklu kutu', 'Slim corrugated box'),
    description: T('Çok ince (kitap/CD) oluklu kutu; kısa dil ve dar toz kapakları.', 'Very slim corrugated box (books/CDs) with short tucks and narrow dust flaps.'),
    keywords: ['ince', 'slim', 'cd', 'kitap', 'oluklu'],
    category: 'special-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'front',
    bottom: 'tuck',
    bottomSide: 'front',
    caliper: 1.5,
  },
  {
    id: 'corr-snap-tuck-slits',
    code: '0215.S',
    standard: 'FEFCO',
    dct: ['becf-21e24'],
    name: T('Oluklu snap-lock, dilli kilitli üst', 'Corrugated snap-lock with sit-lock top'),
    description: T('Kilit taban; üstte dilli kilit ve yarıklı toz kapakları.', 'Crash-lock bottom with a sit-lock tuck top and slit dust flaps.'),
    keywords: ['snap lock', 'sit lock', 'oluklu'],
    category: 'special-boxes',
    materials: CORR,
    top: 'tuck',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
    slits: true,
    caliper: 1.5,
  },
  {
    id: 'petal-top-box',
    code: 'A55.61',
    standard: 'ECMA',
    dct: ['becf-11e0f', 'becf-11e13'],
    name: T('Taç (yaprak) kapaklı kutu', 'Petal-top box'),
    description: T('Dört yaylı yaprak birbirine geçerek taç kapanış oluşturur; kilit taban. Hediye ve kozmetik.', 'Four arched petals interlock into a crown closure; crash-lock bottom. Gifts and cosmetics.'),
    keywords: ['taç', 'yaprak', 'petal', 'crown', 'hediye'],
    category: 'special-boxes',
    materials: CARTON,
    top: 'petal',
    topSide: 'back',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'square-lock45-snap',
    code: 'A55.45.01.01',
    standard: 'ECMA',
    dct: ['becf-11e11'],
    name: T('Kare kutu, çapraz kilit kanatlı üst', 'Square box with diagonal lock-flap top'),
    description: T('Kare kesitli gövde; üstte çapraz kırımlı kilit kanatlar ve dil, altta kilit taban.', 'Square section; diagonal lock flaps with tuck on top and a crash-lock bottom.'),
    keywords: ['kare', 'square', 'kilit kanat', 'lock flap'],
    category: 'special-boxes',
    materials: CARTON,
    top: 'lock45',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
  },
  {
    id: 'hang-hole-snap-box',
    code: 'A55.20.01.03.36',
    standard: 'ECMA',
    dct: ['becf-11e16'],
    name: T('İki askı delikli snap-lock kutu', 'Snap-lock box with two hang holes'),
    description: T('Üst kulaklar yuvarlak askı delikli; kilit taban.', 'Top tabs carry round hang holes; crash-lock bottom.'),
    keywords: ['askı deliği', 'hang hole', 'snap lock'],
    category: 'special-boxes',
    materials: CARTON,
    top: 'tuck',
    topSide: 'front',
    bottom: 'snap',
    bottomSide: 'back',
    holeTabs: true,
  },
  {
    id: 'fefco-0717',
    code: '0717',
    standard: 'FEFCO',
    dct: ['becf-21e21'],
    name: T('FEFCO 0717 — tutamaklı şişe taşıyıcı', 'FEFCO 0717 — bottle carrier with handle'),
    description: T('Uzun panellerin uzantısı el delikli tutamak; otomatik yapıştırmalı taban. Bölme şeritleriyle (0930) hücreli taşıyıcı.', 'Long-panel extensions form a hand-hole handle; auto-lock bottom. Pair with 0930 dividers for a cellular carrier.'),
    keywords: ['0717', 'şişe', 'bottle', 'taşıyıcı', 'carrier', 'tutamak'],
    category: 'special-boxes',
    materials: CORR,
    top: 'carry',
    topSide: 'back',
    bottom: 'auto',
    bottomSide: 'back',
    caliper: 1.5,
  },
]

export const cartonTemplates: TemplateDefinition[] = CARTON_SPECS.map(cartonTemplate)
