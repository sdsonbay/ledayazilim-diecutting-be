import { DielineBuilder, PathBuilder, flattenPath, rectPath, rectPoints, segment, stadiumPath, type Dieline, type PathCommand, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Klasör ve zarf aileleri (DCT folders / envelopes): cepli sunum klasörleri,
 * üst kıvrımlı kart klasörleri, üç panelli kart/klasörler, körüklü evrak
 * cüzdanı (E40.82), portföy (F60.91), yuvarlak kapaklı zarf (F60.92), cep
 * zarfı (F60.93), körüklü CD zarfı, kartlık (F80.53) ve körüklü evrak
 * torbası.
 *
 * Tüm formlar düz panel + kanat birleşimidir; dış hat köşe listesinden
 * (`Corner`) tek kapalı yol olarak izlenir, paneller aynı köşelerden türetilir.
 */

type Pt = Point
type Kind =
  | 'pocket'
  | 'trifold'
  | 'wallet'
  | 'portfolio'
  | 'env-rounded'
  | 'env-pocket'
  | 'env-gusset'
  | 'env-expanding'

interface Pocket {
  cover: 'left' | 'right'
  side: 'bottom' | 'outer'
  tab: boolean
  cards: boolean
}

export interface FolderSpec {
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
  /** Sırt (kapasite) — pocket türünde. */
  spine?: boolean
  /** Üst kıvrım (kart tutucu dudak) — pocket türünde. */
  lips?: 'both' | 'left' | 'none'
  pockets?: Pocket[]
  /** trifold: yön ve kilit/oyuk/yarık seçenekleri. */
  trifold?: { dir: 'v' | 'h'; locks?: boolean; notch?: boolean; slit?: boolean }
  dims?: { a: number; b: number; c?: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })

/** Dış hat köşesi: `r` köşe yuvarlama, `ch` 45° pah. */
interface C {
  p: Pt
  r?: number
  ch?: number
}
const c = (x: number, y: number, o: { r?: number; ch?: number } = {}): C => ({ p: { x, y }, ...o })

/** Köşe listesinden kapalı yol; yuvarlama/pah bir sonraki köşeye göre uygulanır. */
function trace(corners: C[]): PathCommand[] {
  const pb = new PathBuilder()
  const n = corners.length
  const first = corners[0] as C
  pb.moveTo(first.p)
  for (let i = 1; i < n; i++) {
    const cur = corners[i] as C
    const next = corners[(i + 1) % n] as C
    if (cur.r) pb.filletTo(cur.p, next.p, cur.r)
    else if (cur.ch) pb.chamferTo(cur.p, next.p, cur.ch)
    else pb.lineTo(cur.p)
  }
  pb.close()
  return pb.build()
}

const flat = (path: PathCommand[]): Pt[] => {
  const chain = flattenPath(path, 0.15)[0] ?? []
  if (chain.length > 2) {
    const a = chain[0] as Pt
    const z = chain[chain.length - 1] as Pt
    if (Math.hypot(a.x - z.x, a.y - z.y) < 1e-3) chain.pop()
  }
  return chain
}

const boundsOf = (pts: Pt[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxX: Math.max(...pts.map((p) => p.x)),
  maxY: Math.max(...pts.map((p) => p.y)),
})

const bleedGuide = (b: DielineBuilder, pts: Pt[], bleed: number): void => {
  if (bleed <= 0) return
  const r = boundsOf(pts)
  b.guide('bleed', rectPath(r.minX - bleed, r.minY - bleed, r.maxX - r.minX + 2 * bleed, r.maxY - r.minY + 2 * bleed), 'taşma payı')
}

/** Kartvizit yarıkları: kartın dört köşesine 45° kısa kesikler. */
function cardSlits(b: DielineBuilder, cx: number, cy: number, availW: number, availH: number): void {
  const cw = Math.min(85, availW * 0.7)
  const chh = Math.min(55, availH * 0.7)
  if (cw < 30 || chh < 20) return
  const s = Math.min(9, cw * 0.15)
  const corners: [number, number, number, number][] = [
    [cx - cw / 2, cy - chh / 2, 1, 1],
    [cx + cw / 2, cy - chh / 2, -1, 1],
    [cx + cw / 2, cy + chh / 2, -1, -1],
    [cx - cw / 2, cy + chh / 2, 1, -1],
  ]
  for (const [x, y, sx, sy] of corners) {
    b.cut(segment({ x: x - sx * s * 0.35, y: y - sy * s * 0.35 }, { x: x + sx * s, y: y + sy * s }), 'kartvizit yarığı')
  }
}

const meta = (spec: FolderSpec, caliper: number) => ({
  name: spec.name,
  ...(spec.standard === 'ECMA' ? { ecma: spec.code } : {}),
  caliper,
  glueFlapSide: 'none' as const,
})

// ---------------------------------------------------------------------------
// 1) Cepli / kıvrımlı sunum klasörü
// ---------------------------------------------------------------------------

function buildPocketFolder(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hgt = num(params, 'width')
  const s = spec.spine ? num(params, 'spine') : 0
  const e = num(params, 'pocketDepth')
  const cap = num(params, 'capacity')
  const lip = num(params, 'lipDepth')
  const tabW = num(params, 'glueTab')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const g = Math.max(1, caliper * 2)
  const lips = spec.lips ?? 'none'
  const pockets = spec.pockets ?? []
  const X = 2 * a + s
  const r0 = Math.min(6, e * 0.2)
  const rOuter = Math.min(e * 0.45, 22)

  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const out: C[] = []

  const leftBottom = pockets.find((p) => p.cover === 'left' && p.side === 'bottom')
  const rightBottom = pockets.find((p) => p.cover === 'right' && p.side === 'bottom')
  const leftOuter = pockets.find((p) => p.cover === 'left' && p.side === 'outer')

  // Alt kenar (soldan sağa). Sırtsız çift cepte iki cep tek yarıkla ayrılır.
  const joined = Boolean(leftBottom && rightBottom && s <= 0)
  const rt = Math.min(4, tabW * 0.3)
  if (joined) {
    out.push(c(0, 0), c(0, -e, { r: r0 }), c(X, -e, { r: r0 }), c(X, 0))
  } else {
    if (leftBottom) {
      out.push(c(0, 0), c(0, -e, { r: r0 }))
      if (leftBottom.tab) out.push(c(a, -e), c(a + tabW, -e + 3, { r: rt }), c(a + tabW, -3, { r: rt }), c(a, 0))
      else out.push(c(a, -e, { r: rOuter }), c(a, 0))
    } else out.push(c(0, 0))
    if (rightBottom) {
      if (rightBottom.tab) out.push(c(a + s, 0), c(a + s - tabW, -3, { r: rt }), c(a + s - tabW, -e + 3, { r: rt }), c(a + s, -e))
      else out.push(c(a + s, 0), c(a + s, -e, { r: rOuter }))
      out.push(c(X, -e, { r: r0 }), c(X, 0))
    } else out.push(c(X, 0))
  }
  // Sağ kenar
  out.push(c(X, hgt))
  // Üst kenar (sağdan sola)
  const lipTop = hgt + cap + lip
  if (lips === 'both') out.push(c(X - g, hgt), c(X - g, lipTop), c(a + s + g, lipTop), c(a + s + g, hgt))
  if (lips !== 'none') out.push(c(a - g, hgt), c(a - g, lipTop), c(g, lipTop), c(g, hgt))
  out.push(c(0, hgt))
  // Sol kenar (yukarıdan aşağı)
  if (leftOuter) {
    const f = Math.min(hgt * 0.6, Math.max(e, hgt * 0.4))
    out.push(c(0, f), c(-e, f, { r: rOuter }), c(-e, 0))
    if (leftOuter.tab) out.push(c(-e + 3, -tabW, { r: rt }), c(-3, -tabW, { r: rt }))
  }
  const outline = trace(out)
  b.cut(outline, 'klasör çevresi')

  // Kapaklar + sırt
  b.panel({ id: 'left', name: 'left', label: T('Sol kapak', 'Left cover'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('left')
  if (s > 0) {
    b.panel({ id: 'spine', name: 'spine', label: T('Sırt', 'Spine'), outline: rectPoints(a, 0, s, hgt), role: 'wall' })
    b.fold({ parent: 'left', child: 'spine', ...foldVertical(a, 0, hgt, 'right') })
    b.panel({ id: 'right', name: 'right', label: T('Sağ kapak', 'Right cover'), outline: rectPoints(a + s, 0, a, hgt), role: 'wall' })
    b.fold({ parent: 'spine', child: 'right', ...foldVertical(a + s, 0, hgt, 'right') })
  } else {
    b.panel({ id: 'right', name: 'right', label: T('Sağ kapak', 'Right cover'), outline: rectPoints(a, 0, a, hgt), role: 'wall' })
    b.fold({ parent: 'left', child: 'right', ...foldVertical(a, 0, hgt, 'right') })
  }

  // Üst kıvrımlar: kapasite şeridi + dudak (180° içe)
  const lipOn = (id: string, x1: number, x2: number) => {
    b.panel({ id: `${id}-cap`, name: `${id}-cap`, label: T('Kıvrım payı', 'Fold allowance'), outline: rectPoints(x1 + g, hgt, x2 - x1 - 2 * g, cap), role: 'gusset', printable: false })
    b.fold({ parent: id, child: `${id}-cap`, ...foldHorizontal(hgt, x1 + g, x2 - g, 'above') })
    b.panel({ id: `${id}-lip`, name: `${id}-lip`, label: T('Üst kıvrım', 'Top lip'), outline: rectPoints(x1 + g, hgt + cap, x2 - x1 - 2 * g, lip), role: 'flap', printable: false })
    b.fold({ parent: `${id}-cap`, child: `${id}-lip`, ...foldHorizontal(hgt + cap, x1 + g, x2 - g, 'above') })
  }
  if (lips !== 'none') lipOn('left', 0, a)
  if (lips === 'both') lipOn('right', a + s, X)

  // Alt cepler
  const bottomPocket = (p: Pocket, id: string, x1: number, x2: number, spineX: number, dir: 1 | -1) => {
    const pid = `${id}-pocket`
    const rIn = joined || p.tab ? r0 : rOuter
    const shape = trace(dir === 1 ? [c(x1, 0), c(x1, -e, { r: r0 }), c(x2, -e, { r: rIn }), c(x2, 0)] : [c(x1, 0), c(x1, -e, { r: rIn }), c(x2, -e, { r: r0 }), c(x2, 0)])
    b.panel({ id: pid, name: pid, label: T('Cep', 'Pocket'), outline: flat(shape), role: 'flap' })
    b.fold({ parent: id, child: pid, ...foldHorizontal(0, x1, x2, 'below', 180) })
    if (p.tab) {
      const tid = `${pid}-tab`
      const tx = spineX + dir * tabW
      const tabShape = trace(dir === 1 ? [c(spineX, 0), c(spineX, -e), c(tx, -e + 3, { r: rt }), c(tx, -3, { r: rt })] : [c(spineX, 0), c(tx, -3, { r: rt }), c(tx, -e + 3, { r: rt }), c(spineX, -e)])
      b.panel({ id: tid, name: tid, label: T('Cep yapıştırma kulağı', 'Pocket glue tab'), outline: flat(tabShape), role: 'glue', printable: false })
      b.fold({ parent: pid, child: tid, ...foldVertical(spineX, -e, 0, dir === 1 ? 'right' : 'left', 180) })
    }
    if (p.cards) cardSlits(b, (x1 + x2) / 2, -e / 2, x2 - x1, e)
  }
  if (leftBottom) bottomPocket(leftBottom, 'left', 0, a, a, 1)
  if (rightBottom) bottomPocket(rightBottom, 'right', a + s, X, a + s, -1)
  if (joined) b.cut(segment({ x: a, y: -e }, { x: a, y: 0 }), 'cep ayırma yarığı')
  if (leftOuter) {
    const f = Math.min(hgt * 0.6, Math.max(e, hgt * 0.4))
    const shape = trace([c(0, 0), c(0, f), c(-e, f, { r: rOuter }), c(-e, 0)])
    b.panel({ id: 'left-side-pocket', name: 'left-side-pocket', label: T('Yan cep', 'Side pocket'), outline: flat(shape), role: 'flap' })
    b.fold({ parent: 'left', child: 'left-side-pocket', ...foldVertical(0, 0, f, 'left', 180) })
    if (leftOuter.tab) {
      const tabShape = trace([c(0, 0), c(-e, 0), c(-e + 3, -tabW, { r: rt }), c(-3, -tabW, { r: rt })])
      b.panel({ id: 'left-side-pocket-tab', name: 'left-side-pocket-tab', label: T('Cep yapıştırma kulağı', 'Pocket glue tab'), outline: flat(tabShape), role: 'glue', printable: false })
      b.fold({ parent: 'left-side-pocket', child: 'left-side-pocket-tab', ...foldHorizontal(0, -e, 0, 'below', 180) })
    }
    if (leftOuter.cards) cardSlits(b, -e / 2, f / 2, e, f)
  }

  bleedGuide(b, flat(outline), bleed)
  if (e > hgt * 0.8) b.warn('pocket-too-deep', 'warning', 'Cep derinliği kapak yüksekliğine yakın; içerik görünmez.', 'Pocket depth is close to the cover height; contents will be hidden.')
  return b.build()
}

// ---------------------------------------------------------------------------
// 2) Üç panelli kart / klasör (dikey rulo katlama veya yatay kartlık)
// ---------------------------------------------------------------------------

function buildTriFold(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bb = num(params, 'width')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const o = spec.trifold ?? { dir: 'v' }
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)

  if (o.dir === 'v') {
    // Paneller yukarıdan aşağı: kapak (c) / arka (c) / iç kanat (b, daha kısa)
    const cc = num(params, 'height')
    const yTop = 2 * cc
    const lugW = Math.min(16, a * 0.2)
    const lugD = Math.min(10, cc * 0.15)
    const lugXs = [a * 0.28, a * 0.72]
    const out: C[] = [c(0, -bb), c(a, -bb), c(a, yTop)]
    if (o.locks) {
      for (const x of [...lugXs].reverse()) out.push(c(x + lugW / 2, yTop), c(x + lugW / 2 - 1.5, yTop + lugD, { r: 2 }), c(x - lugW / 2 + 1.5, yTop + lugD, { r: 2 }), c(x - lugW / 2, yTop))
    }
    out.push(c(0, yTop))
    const outline = trace(out)
    b.cut(outline, 'kart çevresi')
    b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, 0, a, cc), role: 'wall' })
    b.root('back')
    b.panel({ id: 'cover', name: 'cover', label: T('Kapak', 'Cover'), outline: rectPoints(0, cc, a, cc), role: 'lid' })
    b.fold({ parent: 'back', child: 'cover', ...foldHorizontal(cc, 0, a, 'above', 172) })
    b.panel({ id: 'inner', name: 'inner', label: T('İç kanat', 'Inner flap'), outline: rectPoints(0, -bb, a, bb), role: 'flap' })
    b.fold({ parent: 'back', child: 'inner', ...foldHorizontal(0, 0, a, 'below', 180) })
    if (o.locks) {
      for (const x of lugXs) {
        b.panel({ id: `lug-${Math.round(x)}`, name: 'lug', label: T('Kilit dili', 'Lock tab'), outline: [{ x: x - lugW / 2, y: yTop }, { x: x + lugW / 2, y: yTop }, { x: x + lugW / 2 - 1.5, y: yTop + lugD }, { x: x - lugW / 2 + 1.5, y: yTop + lugD }], role: 'lock', printable: false })
        b.fold({ parent: 'cover', child: `lug-${Math.round(x)}`, ...foldHorizontal(yTop, x - lugW / 2, x + lugW / 2, 'above', 180) })
        // Dilin girdiği yarık: iç kanatta, kırıma yakın
        b.cut(segment({ x: x - lugW / 2 - 1, y: -Math.min(6, bb * 0.2) }, { x: x + lugW / 2 + 1, y: -Math.min(6, bb * 0.2) }), 'kilit yarığı')
      }
    }
    bleedGuide(b, flat(outline), bleed)
    if (bb > cc) b.warn('inner-taller-than-cover', 'warning', 'İç kanat kapaktan uzun; rulo katlama kapanmaz.', 'Inner flap is taller than the cover; the roll fold will not close.')
    return b.build()
  }

  // Yatay kartlık: üç panel yan yana (a × b), solda başparmak oyuğu, sağda kart yarığı
  const notchR = o.notch ? Math.min(9, bb * 0.1) : 0
  const leftEdge = (pb: PathBuilder): void => {
    // Sol kenar yukarıdan aşağı; oyuk panel içine (+x) doğru
    if (notchR > 0) {
      pb.lineTo({ x: 0, y: bb / 2 + notchR })
      pb.arcTo({ x: 0, y: bb / 2 - notchR }, notchR, true)
    }
    pb.lineTo({ x: 0, y: 0 })
  }
  const pb = new PathBuilder()
  pb.moveTo({ x: 0, y: 0 }).lineTo({ x: 3 * a, y: 0 }).lineTo({ x: 3 * a, y: bb }).lineTo({ x: 0, y: bb })
  leftEdge(pb)
  pb.close()
  const outline = pb.build()
  b.cut(outline, 'kartlık çevresi')
  const leftPb = new PathBuilder()
  leftPb.moveTo({ x: 0, y: 0 }).lineTo({ x: a, y: 0 }).lineTo({ x: a, y: bb }).lineTo({ x: 0, y: bb })
  leftEdge(leftPb)
  leftPb.close()
  b.panel({ id: 'center', name: 'center', label: T('Orta', 'Center'), outline: rectPoints(a, 0, a, bb), role: 'wall' })
  b.root('center')
  b.panel({ id: 'left', name: 'left', label: T('Sol kapak', 'Left cover'), outline: flat(leftPb.build()), role: 'lid' })
  b.fold({ parent: 'center', child: 'left', ...foldVertical(a, 0, bb, 'left', 180) })
  b.panel({ id: 'right', name: 'right', label: T('Sağ kapak', 'Right cover'), outline: rectPoints(2 * a, 0, a, bb), role: 'lid' })
  b.fold({ parent: 'center', child: 'right', ...foldVertical(2 * a, 0, bb, 'right', 172) })
  if (o.slit) {
    const len = Math.min(bb * 0.45, 70)
    b.cut(segment({ x: 2.5 * a, y: bb / 2 - len / 2 }, { x: 2.5 * a, y: bb / 2 + len / 2 }), 'kart yarığı')
  }
  bleedGuide(b, flat(outline), bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 3) Körüklü evrak cüzdanı (E40.82): arka + yuvarlak köşeli dilli kapak,
//    alt körük, yan körüklü ön cep
// ---------------------------------------------------------------------------

function buildWallet(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hgt = num(params, 'width')
  const d = num(params, 'height') // körük / kapasite
  const e = num(params, 'lidDepth')
  const f = num(params, 'frontHeight')
  const r1 = num(params, 'cornerRadius')
  const tabW = num(params, 'glueTab')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const tuckW = Math.min(a * 0.4, 60)
  const tuckD = Math.min(14, e * 0.45)
  const gap = Math.max(1, caliper * 2)
  const yFrontTop = -d
  const yFrontBot = -d - f

  // Ön panelin alt-sol köşesinden saat yönünün tersine: ön + yan körükler,
  // arka, yuvarlak köşeli kapak + orta dil.
  const ordered: C[] = [
    c(-d, yFrontBot),
    c(a + d, yFrontBot),
    c(a + d, yFrontBot + gap),
    c(a + d + tabW, yFrontBot + gap + 3, { r: 3 }),
    c(a + d + tabW, yFrontTop - gap - 3, { r: 3 }),
    c(a + d, yFrontTop - gap),
    c(a + d, yFrontTop),
    c(a, yFrontTop),
    c(a, hgt),
    c(a, hgt + e, { r: r1 }),
    c(a / 2 + tuckW / 2, hgt + e),
    c(a / 2 + tuckW / 2 - 2, hgt + e + tuckD, { r: 3 }),
    c(a / 2 - tuckW / 2 + 2, hgt + e + tuckD, { r: 3 }),
    c(a / 2 - tuckW / 2, hgt + e),
    c(0, hgt + e, { r: r1 }),
    c(0, hgt),
    c(0, yFrontTop),
    c(-d, yFrontTop),
    c(-d, yFrontTop - gap),
    c(-d - tabW, yFrontTop - gap - 3, { r: 3 }),
    c(-d - tabW, yFrontBot + gap + 3, { r: 3 }),
    c(-d, yFrontBot + gap),
  ]
  const outline = trace(ordered)
  b.cut(outline, 'cüzdan çevresi')

  b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('back')
  const lidShape = trace([c(0, hgt), c(a, hgt), c(a, hgt + e, { r: r1 }), c(0, hgt + e, { r: r1 })])
  b.panel({ id: 'lid', name: 'lid', label: T('Kapak', 'Lid'), outline: flat(lidShape), role: 'lid' })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(hgt, 0, a, 'above', 172) })
  const tuckShape = trace([c(a / 2 - tuckW / 2, hgt + e), c(a / 2 + tuckW / 2, hgt + e), c(a / 2 + tuckW / 2 - 2, hgt + e + tuckD, { r: 3 }), c(a / 2 - tuckW / 2 + 2, hgt + e + tuckD, { r: 3 })])
  b.panel({ id: 'tuck', name: 'tuck', label: T('Kilit dili', 'Tuck'), outline: flat(tuckShape), role: 'lock', printable: false })
  b.fold({ parent: 'lid', child: 'tuck', ...foldHorizontal(hgt + e, a / 2 - tuckW / 2, a / 2 + tuckW / 2, 'above') })
  b.panel({ id: 'bottom-gusset', name: 'bottom-gusset', label: T('Alt körük', 'Bottom gusset'), outline: rectPoints(0, -d, a, d), role: 'gusset' })
  b.fold({ parent: 'back', child: 'bottom-gusset', ...foldHorizontal(0, 0, a, 'below') })
  b.panel({ id: 'front', name: 'front', label: T('Ön cep', 'Front pocket'), outline: rectPoints(0, yFrontBot, a, f), role: 'wall' })
  b.fold({ parent: 'bottom-gusset', child: 'front', ...foldHorizontal(yFrontTop, 0, a, 'below') })
  for (const side of ['left', 'right'] as const) {
    const sgn = side === 'left' ? -1 : 1
    const x0 = side === 'left' ? 0 : a
    const gid = `${side}-gusset`
    b.panel({ id: gid, name: gid, label: T('Yan körük', 'Side gusset'), outline: rectPoints(side === 'left' ? -d : a, yFrontBot, d, f), role: 'gusset' })
    b.fold({ parent: 'front', child: gid, ...foldVertical(x0, yFrontBot, yFrontTop, side) })
    const tid = `${side}-glue`
    const xg = x0 + sgn * d
    const xt = xg + sgn * tabW
    const tabShape = trace(side === 'left' ? [c(xg, yFrontBot + gap), c(xg, yFrontTop - gap), c(xt, yFrontTop - gap - 3, { r: 3 }), c(xt, yFrontBot + gap + 3, { r: 3 })] : [c(xg, yFrontBot + gap), c(xt, yFrontBot + gap + 3, { r: 3 }), c(xt, yFrontTop - gap - 3, { r: 3 }), c(xg, yFrontTop - gap)])
    b.panel({ id: tid, name: tid, label: T('Yapıştırma kulağı', 'Glue tab'), outline: flat(tabShape), role: 'glue', printable: false })
    b.fold({ parent: gid, child: tid, ...foldVertical(xg, yFrontBot + gap, yFrontTop - gap, side) })
  }
  // Dil yarığı: ön panelde, kapak boyu kadar aşağıda
  const slotY = Math.max(yFrontBot + 6, -Math.max(e * 0.6, d + 4))
  b.cut(stadiumPath({ x: a / 2, y: slotY }, tuckW + 2 * gap, Math.max(1.2, caliper * 2)), 'dil yarığı')
  bleedGuide(b, flat(outline), bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 4) Portföy (F60.91): orta panel + pahlı dört kanat, yan kanatlarda bağ yarığı
// ---------------------------------------------------------------------------

function buildPortfolio(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hgt = num(params, 'width')
  const e = num(params, 'flapDepth')
  const f = num(params, 'sideFlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(1, caliper * 2)
  const chE = Math.min(e * 0.6, 18)
  const chF = Math.min(f * 0.6, 18)

  const outline = trace([
    c(gap, 0),
    c(gap, -e, { ch: chE }),
    c(a - gap, -e, { ch: chE }),
    c(a - gap, 0),
    c(a, gap),
    c(a + f, gap, { ch: chF }),
    c(a + f, hgt - gap, { ch: chF }),
    c(a, hgt - gap),
    c(a - gap, hgt),
    c(a - gap, hgt + e, { ch: chE }),
    c(gap, hgt + e, { ch: chE }),
    c(gap, hgt),
    c(0, hgt - gap),
    c(-f, hgt - gap, { ch: chF }),
    c(-f, gap, { ch: chF }),
    c(0, gap),
  ])
  b.cut(outline, 'portföy çevresi')
  b.panel({ id: 'center', name: 'center', label: T('Orta panel', 'Center panel'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('center')
  const flap = (id: string, label: I18nText, shape: C[], fold: ReturnType<typeof foldHorizontal>) => {
    b.panel({ id, name: id, label, outline: flat(trace(shape)), role: 'flap' })
    b.fold({ parent: 'center', child: id, ...fold })
  }
  flap('bottom', T('Alt kanat', 'Bottom flap'), [c(gap, 0), c(gap, -e, { ch: chE }), c(a - gap, -e, { ch: chE }), c(a - gap, 0)], foldHorizontal(0, gap, a - gap, 'below', 180))
  flap('top', T('Üst kanat', 'Top flap'), [c(gap, hgt), c(a - gap, hgt), c(a - gap, hgt + e, { ch: chE }), c(gap, hgt + e, { ch: chE })], foldHorizontal(hgt, gap, a - gap, 'above', 172))
  flap('right', T('Sağ kanat', 'Right flap'), [c(a, gap), c(a + f, gap, { ch: chF }), c(a + f, hgt - gap, { ch: chF }), c(a, hgt - gap)], foldVertical(a, gap, hgt - gap, 'right', 180))
  flap('left', T('Sol kanat', 'Left flap'), [c(0, gap), c(0, hgt - gap), c(-f, hgt - gap, { ch: chF }), c(-f, gap, { ch: chF })], foldVertical(0, gap, hgt - gap, 'left', 180))
  // Bağ yarıkları: yan kanat ortası + kapandığında çakışan orta panel noktası
  const slotL = Math.min(hgt * 0.3, 60)
  const slotW = Math.max(4, Math.min(8, f * 0.2))
  for (const sgn of [-1, 1]) {
    const xFlap = sgn === 1 ? a + f / 2 : -f / 2
    const xPanel = sgn === 1 ? a - f / 2 : f / 2
    b.cut(stadiumPath({ x: xFlap, y: hgt / 2 }, slotW, slotL), 'bağ yarığı')
    b.cut(stadiumPath({ x: xPanel, y: hgt / 2 }, slotW, slotL), 'bağ yarığı')
  }
  bleedGuide(b, flat(outline), bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// 5) Zarflar
// ---------------------------------------------------------------------------

/** F60.92 — yuvarlak kemerli kapaklı zarf; yan kanatlar + yuvarlak köşeli alt kapak. */
function buildEnvRounded(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hgt = num(params, 'width')
  const y1 = num(params, 'flapDepth')
  const bot = num(params, 'bottomFlap')
  const side = num(params, 'sideFlap')
  const r = num(params, 'cornerRadius')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(1, caliper * 2)
  const rTop = Math.min(r, a / 2 - 1, y1 - 1)
  const rBot = Math.min(r * 0.5, bot * 0.6)
  const taper = Math.min(side * 0.4, 8)

  const outline = trace([
    c(gap, 0),
    c(gap, -bot, { r: rBot }),
    c(a - gap, -bot, { r: rBot }),
    c(a - gap, 0),
    c(a, gap),
    c(a + side, gap + taper, { r: 3 }),
    c(a + side, hgt - gap - taper, { r: 3 }),
    c(a, hgt - gap),
    c(a, hgt),
    c(a, hgt + y1, { r: rTop }),
    c(0, hgt + y1, { r: rTop }),
    c(0, hgt),
    c(0, hgt - gap),
    c(-side, hgt - gap - taper, { r: 3 }),
    c(-side, gap + taper, { r: 3 }),
    c(0, gap),
  ])
  b.cut(outline, 'zarf çevresi')
  b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('back')
  b.panel({ id: 'bottom', name: 'bottom', label: T('Alt kapak', 'Bottom flap'), outline: flat(trace([c(gap, 0), c(gap, -bot, { r: rBot }), c(a - gap, -bot, { r: rBot }), c(a - gap, 0)])), role: 'flap' })
  b.fold({ parent: 'back', child: 'bottom', ...foldHorizontal(0, gap, a - gap, 'below', 180) })
  b.panel({ id: 'top', name: 'top', label: T('Üst kapak', 'Top flap'), outline: flat(trace([c(0, hgt), c(a, hgt), c(a, hgt + y1, { r: rTop }), c(0, hgt + y1, { r: rTop })])), role: 'lid' })
  b.fold({ parent: 'back', child: 'top', ...foldHorizontal(hgt, 0, a, 'above', 172) })
  b.panel({ id: 'right', name: 'right', label: T('Sağ kanat', 'Right flap'), outline: flat(trace([c(a, gap), c(a + side, gap + taper, { r: 3 }), c(a + side, hgt - gap - taper, { r: 3 }), c(a, hgt - gap)])), role: 'flap' })
  b.fold({ parent: 'back', child: 'right', ...foldVertical(a, gap, hgt - gap, 'right', 180) })
  b.panel({ id: 'left', name: 'left', label: T('Sol kanat', 'Left flap'), outline: flat(trace([c(0, gap), c(0, hgt - gap), c(-side, hgt - gap - taper, { r: 3 }), c(-side, gap + taper, { r: 3 })])), role: 'flap' })
  b.fold({ parent: 'back', child: 'left', ...foldVertical(0, gap, hgt - gap, 'left', 180) })
  bleedGuide(b, flat(outline), bleed)
  if (bot + y1 < hgt * 0.6) b.warn('flaps-shallow', 'info', 'Alt kapak + üst kapak zarf yüksekliğinin %60’ından az; kapaklar örtüşmez.', 'Bottom + top flap is under 60% of the height; the flaps will not overlap.')
  return b.build()
}

/** F60.93 — cep zarfı: arka, kulaklı ön panel (alttan katlanır), yuvarlak köşeli üst kapak + başparmak oyuğu. */
function buildEnvPocket(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hgt = num(params, 'width')
  const y1 = num(params, 'flapDepth')
  const f = num(params, 'frontHeight')
  const x1 = num(params, 'glueTab')
  const r1 = num(params, 'cornerRadius')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(1, caliper * 2)
  const notchR = Math.min(8, a * 0.08, y1 * 0.4)
  const rTop = Math.min(r1, a / 2 - notchR - 2, y1 - 1)

  const flapTop = hgt + y1
  const outlineCmds: PathCommand[] = [
    { c: 'M', x: 0, y: 0 },
    { c: 'L', x: 0, y: -gap },
    { c: 'L', x: -x1, y: -gap - 3 },
    { c: 'L', x: -x1, y: -f + 3 },
    { c: 'L', x: 0, y: -f + gap },
    { c: 'L', x: 0, y: -f },
    { c: 'L', x: a, y: -f },
    { c: 'L', x: a, y: -f + gap },
    { c: 'L', x: a + x1, y: -f + 3 },
    { c: 'L', x: a + x1, y: -gap - 3 },
    { c: 'L', x: a, y: -gap },
    { c: 'L', x: a, y: 0 },
    { c: 'L', x: a, y: hgt },
  ]
  const pb = new PathBuilder()
  for (const cmd of outlineCmds) {
    if (cmd.c === 'M') pb.moveTo({ x: cmd.x, y: cmd.y })
    else if (cmd.c === 'L') pb.lineTo({ x: cmd.x, y: cmd.y })
  }
  pb.filletTo({ x: a, y: flapTop }, { x: a / 2 + notchR, y: flapTop }, rTop)
  pb.lineTo({ x: a / 2 + notchR, y: flapTop })
  pb.arcTo({ x: a / 2 - notchR, y: flapTop }, notchR, false)
  pb.filletTo({ x: 0, y: flapTop }, { x: 0, y: hgt }, rTop)
  pb.lineTo({ x: 0, y: hgt })
  pb.close()
  const outline = pb.build()
  b.cut(outline, 'zarf çevresi')

  b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('back')
  b.panel({ id: 'front', name: 'front', label: T('Ön cep', 'Front pocket'), outline: rectPoints(0, -f, a, f), role: 'wall' })
  b.fold({ parent: 'back', child: 'front', ...foldHorizontal(0, 0, a, 'below', 180) })
  for (const side of ['left', 'right'] as const) {
    const x0 = side === 'left' ? 0 : a
    const xt = side === 'left' ? -x1 : a + x1
    const id = `${side}-glue`
    b.panel({ id, name: id, label: T('Yapıştırma kulağı', 'Glue tab'), outline: side === 'left' ? [{ x: x0, y: -gap }, { x: xt, y: -gap - 3 }, { x: xt, y: -f + 3 }, { x: x0, y: -f + gap }] : [{ x: x0, y: -f + gap }, { x: xt, y: -f + 3 }, { x: xt, y: -gap - 3 }, { x: x0, y: -gap }], role: 'glue', printable: false })
    b.fold({ parent: 'front', child: id, ...foldVertical(x0, -f + gap, -gap, side, 180) })
  }
  const lidPb = new PathBuilder()
  lidPb.moveTo({ x: 0, y: hgt }).lineTo({ x: a, y: hgt })
  lidPb.filletTo({ x: a, y: flapTop }, { x: a / 2 + notchR, y: flapTop }, rTop)
  lidPb.lineTo({ x: a / 2 + notchR, y: flapTop })
  lidPb.arcTo({ x: a / 2 - notchR, y: flapTop }, notchR, false)
  lidPb.filletTo({ x: 0, y: flapTop }, { x: 0, y: hgt }, rTop)
  lidPb.close()
  b.panel({ id: 'lid', name: 'lid', label: T('Üst kapak', 'Top flap'), outline: flat(lidPb.build()), role: 'lid' })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(hgt, 0, a, 'above', 172) })
  bleedGuide(b, flat(outline), bleed)
  if (f > hgt) b.warn('front-taller-than-back', 'warning', 'Ön cep arkadan yüksek.', 'Front pocket is taller than the back.')
  return b.build()
}

/** Körüklü CD / kutu zarfı: arka + dilli kapak, alt körük, yan körüklü ön; ön panelde dil yarığı. */
function buildEnvGusset(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const d = num(params, 'width') // körük (b)
  const hgt = num(params, 'height') // panel yüksekliği (c)
  const e = num(params, 'lidDepth')
  const tabW = num(params, 'glueTab')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(1, caliper * 2)
  const tuckW = Math.min(a * 0.45, 70)
  const tuckD = Math.min(14, e * 0.5)
  const yFrontTop = -d
  const yFrontBot = -d - hgt

  const outline = trace([
    c(-d, yFrontBot),
    c(a + d, yFrontBot),
    c(a + d, yFrontBot + gap),
    c(a + d + tabW, yFrontBot + gap + 3, { r: 3 }),
    c(a + d + tabW, yFrontTop - gap - 3, { r: 3 }),
    c(a + d, yFrontTop - gap),
    c(a + d, yFrontTop),
    c(a, yFrontTop),
    c(a, hgt),
    c(a, hgt + e, { r: Math.min(8, e * 0.4) }),
    c(a / 2 + tuckW / 2, hgt + e),
    c(a / 2 + tuckW / 2 - 2, hgt + e + tuckD, { r: 3 }),
    c(a / 2 - tuckW / 2 + 2, hgt + e + tuckD, { r: 3 }),
    c(a / 2 - tuckW / 2, hgt + e),
    c(0, hgt + e, { r: Math.min(8, e * 0.4) }),
    c(0, hgt),
    c(0, yFrontTop),
    c(-d, yFrontTop),
    c(-d, yFrontTop - gap),
    c(-d - tabW, yFrontTop - gap - 3, { r: 3 }),
    c(-d - tabW, yFrontBot + gap + 3, { r: 3 }),
    c(-d, yFrontBot + gap),
  ])
  b.cut(outline, 'zarf çevresi')
  b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('back')
  const rl = Math.min(8, e * 0.4)
  b.panel({ id: 'lid', name: 'lid', label: T('Kapak', 'Lid'), outline: flat(trace([c(0, hgt), c(a, hgt), c(a, hgt + e, { r: rl }), c(0, hgt + e, { r: rl })])), role: 'lid' })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(hgt, 0, a, 'above', 172) })
  b.panel({ id: 'tuck', name: 'tuck', label: T('Kilit dili', 'Tuck'), outline: flat(trace([c(a / 2 - tuckW / 2, hgt + e), c(a / 2 + tuckW / 2, hgt + e), c(a / 2 + tuckW / 2 - 2, hgt + e + tuckD, { r: 3 }), c(a / 2 - tuckW / 2 + 2, hgt + e + tuckD, { r: 3 })])), role: 'lock', printable: false })
  b.fold({ parent: 'lid', child: 'tuck', ...foldHorizontal(hgt + e, a / 2 - tuckW / 2, a / 2 + tuckW / 2, 'above') })
  b.panel({ id: 'bottom-gusset', name: 'bottom-gusset', label: T('Alt körük', 'Bottom gusset'), outline: rectPoints(0, -d, a, d), role: 'gusset' })
  b.fold({ parent: 'back', child: 'bottom-gusset', ...foldHorizontal(0, 0, a, 'below') })
  b.panel({ id: 'front', name: 'front', label: T('Ön', 'Front'), outline: rectPoints(0, yFrontBot, a, hgt), role: 'wall' })
  b.fold({ parent: 'bottom-gusset', child: 'front', ...foldHorizontal(yFrontTop, 0, a, 'below') })
  for (const side of ['left', 'right'] as const) {
    const sgn = side === 'left' ? -1 : 1
    const x0 = side === 'left' ? 0 : a
    const gid = `${side}-gusset`
    b.panel({ id: gid, name: gid, label: T('Yan körük', 'Side gusset'), outline: rectPoints(side === 'left' ? -d : a, yFrontBot, d, hgt), role: 'gusset' })
    b.fold({ parent: 'front', child: gid, ...foldVertical(x0, yFrontBot, yFrontTop, side) })
    const xg = x0 + sgn * d
    const xt = xg + sgn * tabW
    const tid = `${side}-glue`
    const shape = side === 'left' ? [c(xg, yFrontBot + gap), c(xg, yFrontTop - gap), c(xt, yFrontTop - gap - 3, { r: 3 }), c(xt, yFrontBot + gap + 3, { r: 3 })] : [c(xg, yFrontBot + gap), c(xt, yFrontBot + gap + 3, { r: 3 }), c(xt, yFrontTop - gap - 3, { r: 3 }), c(xg, yFrontTop - gap)]
    b.panel({ id: tid, name: tid, label: T('Yapıştırma kulağı', 'Glue tab'), outline: flat(trace(shape)), role: 'glue', printable: false })
    b.fold({ parent: gid, child: tid, ...foldVertical(xg, yFrontBot + gap, yFrontTop - gap, side) })
  }
  if (e > d + 4) {
    const slotY = yFrontTop - (e - d) - tuckD * 0.5
    if (slotY > yFrontBot + 4) b.cut(stadiumPath({ x: a / 2, y: slotY }, tuckW + 2 * gap, Math.max(1.2, caliper * 2)), 'dil yarığı')
  }
  bleedGuide(b, flat(outline), bleed)
  return b.build()
}

/** Körüklü evrak torbası: arka + pahlı üst kapak, sol/alt/sağ körük şeritleri, sağ körükten ön panel. */
function buildEnvExpanding(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const hgt = num(params, 'width')
  const d = num(params, 'height') // körük (c)
  const e = num(params, 'flapDepth')
  const tabW = num(params, 'glueTab')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, meta(spec, caliper), params)
  const gap = Math.max(1, caliper * 2)
  const ch = Math.min(e * 0.6, 20)
  const xFront = a + d

  const outline = trace([
    c(-d - tabW, gap + 3, { r: 3 }),
    c(-d, gap),
    c(-d, 0),
    c(0, 0),
    c(0, -d),
    c(a, -d),
    c(a, 0),
    c(xFront, 0),
    c(xFront, -gap),
    c(xFront + a, -gap),
    c(xFront + a, hgt),
    c(xFront, hgt),
    c(a, hgt),
    c(a, hgt + e, { ch }),
    c(0, hgt + e, { ch }),
    c(0, hgt),
    c(-d, hgt),
    c(-d, hgt - gap),
    c(-d - tabW, hgt - gap - 3, { r: 3 }),
  ])
  b.cut(outline, 'torba çevresi')
  b.panel({ id: 'back', name: 'back', label: T('Arka', 'Back'), outline: rectPoints(0, 0, a, hgt), role: 'wall' })
  b.root('back')
  b.panel({ id: 'lid', name: 'lid', label: T('Üst kapak', 'Top flap'), outline: flat(trace([c(0, hgt), c(a, hgt), c(a, hgt + e, { ch }), c(0, hgt + e, { ch })])), role: 'lid' })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(hgt, 0, a, 'above', 172) })
  b.panel({ id: 'bottom-gusset', name: 'bottom-gusset', label: T('Alt körük', 'Bottom gusset'), outline: rectPoints(0, -d, a, d), role: 'gusset' })
  b.fold({ parent: 'back', child: 'bottom-gusset', ...foldHorizontal(0, 0, a, 'below') })
  b.panel({ id: 'left-gusset', name: 'left-gusset', label: T('Sol körük', 'Left gusset'), outline: rectPoints(-d, 0, d, hgt), role: 'gusset' })
  b.fold({ parent: 'back', child: 'left-gusset', ...foldVertical(0, 0, hgt, 'left') })
  b.panel({ id: 'left-glue', name: 'left-glue', label: T('Yapıştırma kulağı', 'Glue tab'), outline: flat(trace([c(-d, gap), c(-d, hgt - gap), c(-d - tabW, hgt - gap - 3, { r: 3 }), c(-d - tabW, gap + 3, { r: 3 })])), role: 'glue', printable: false })
  b.fold({ parent: 'left-gusset', child: 'left-glue', ...foldVertical(-d, gap, hgt - gap, 'left') })
  b.panel({ id: 'right-gusset', name: 'right-gusset', label: T('Sağ körük', 'Right gusset'), outline: rectPoints(a, 0, d, hgt), role: 'gusset' })
  b.fold({ parent: 'back', child: 'right-gusset', ...foldVertical(a, 0, hgt, 'right') })
  b.panel({ id: 'front', name: 'front', label: T('Ön', 'Front'), outline: rectPoints(xFront, -gap, a, hgt + gap), role: 'wall' })
  b.fold({ parent: 'right-gusset', child: 'front', ...foldVertical(xFront, 0, hgt, 'right') })
  b.guide('glue', rectPath(xFront, -gap, a, d), 'alt körük yapıştırma alanı')
  bleedGuide(b, flat(outline), bleed)
  return b.build()
}

// ---------------------------------------------------------------------------
// Parametreler + tanımlar
// ---------------------------------------------------------------------------

const dctDims = (spec: FolderSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return { a: spec.dims.a, b: spec.dims.b, c: spec.dims.c ?? 0 }
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b) return { a: e.dims.a, b: e.dims.b, c: e.dims.c ?? 0 }
  }
  return { a: 220, b: 310, c: 5 }
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
const bleedP = (): ParamDef => ({ kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' })

function paramsFor(spec: FolderSpec): ParamDef[] {
  const d = dctDims(spec)
  switch (spec.kind) {
    case 'pocket': {
      const out: ParamDef[] = [N('length', 'Kapak genişliği (a)', 'Cover width (a)', d.a, 40, 800), N('width', 'Kapak yüksekliği (b)', 'Cover height (b)', d.b, 40, 800)]
      if (spec.spine) out.push(N('spine', 'Sırt (c)', 'Spine (c)', d.c || 5, 1, 80))
      const hasPockets = (spec.pockets ?? []).length > 0
      out.push(N('pocketDepth', 'Cep derinliği (e)', 'Pocket depth (e)', Math.min(d.b * 0.35, 110), 15, 400, 'construction', !hasPockets))
      out.push(N('glueTab', 'Cep yapıştırma kulağı', 'Pocket glue tab', 14, 6, 40, 'construction', !(spec.pockets ?? []).some((p) => p.tab)))
      const hasLips = (spec.lips ?? 'none') !== 'none'
      out.push(N('capacity', 'Kıvrım payı (c)', 'Fold allowance (c)', d.c || 4, 0.5, 30, 'construction', !hasLips), N('lipDepth', 'Üst kıvrım derinliği', 'Top lip depth', Math.min(d.b * 0.12, 25), 5, 120, 'construction', !hasLips))
      out.push(caliperP(0.4), bleedP())
      return out
    }
    case 'trifold': {
      if (spec.trifold?.dir === 'h') {
        return [N('length', 'Panel genişliği (a)', 'Panel width (a)', d.a, 30, 400), N('width', 'Panel yüksekliği (b)', 'Panel height (b)', d.b, 30, 600), caliperP(0.35), bleedP()]
      }
      return [N('length', 'Genişlik (a)', 'Width (a)', d.a, 30, 600), N('width', 'İç kanat yüksekliği (b)', 'Inner flap height (b)', d.b, 15, 600), N('height', 'Kapak / arka yüksekliği (c)', 'Cover / back height (c)', d.c || d.b * 1.3, 20, 800), caliperP(0.35), bleedP()]
    }
    case 'wallet':
      return [
        N('length', 'Genişlik (a)', 'Width (a)', d.a, 40, 600),
        N('width', 'Arka yüksekliği (b)', 'Back height (b)', d.b, 40, 600),
        N('height', 'Körük / kapasite (c)', 'Gusset / capacity (c)', d.c || 20, 3, 120),
        N('lidDepth', 'Kapak derinliği (e)', 'Lid depth (e)', Math.min(d.b * 0.4, 60), 10, 300, 'construction'),
        N('frontHeight', 'Ön cep yüksekliği', 'Front pocket height', d.b * 0.6, 15, 600, 'construction'),
        N('cornerRadius', 'Kapak köşe yarıçapı (r)', 'Lid corner radius (r)', 8, 0, 60, 'construction', true),
        N('glueTab', 'Yapıştırma kulağı (z)', 'Glue tab (z)', 10, 4, 40, 'construction', true),
        caliperP(0.5),
        bleedP(),
      ]
    case 'portfolio':
      return [N('length', 'Genişlik (a)', 'Width (a)', d.a, 60, 800), N('width', 'Yükseklik (b)', 'Height (b)', d.b, 60, 800), N('flapDepth', 'Üst/alt kanat (e)', 'Top/bottom flap (e)', Math.min(d.b * 0.2, 60), 10, 400, 'construction'), N('sideFlap', 'Yan kanat (f)', 'Side flap (f)', Math.min(d.a * 0.22, 70), 10, 400, 'construction'), caliperP(0.5), bleedP()]
    case 'env-rounded':
      return [
        N('length', 'Genişlik (a)', 'Width (a)', d.a, 40, 600),
        N('width', 'Yükseklik (b)', 'Height (b)', d.b, 40, 600),
        N('flapDepth', 'Üst kapak (y)', 'Top flap (y)', d.b * 0.5, 10, 400, 'construction'),
        N('bottomFlap', 'Alt kapak', 'Bottom flap', d.b * 0.55, 10, 400, 'construction'),
        N('sideFlap', 'Yan kanat', 'Side flap', Math.min(d.a * 0.15, 25), 5, 120, 'construction'),
        N('cornerRadius', 'Kapak köşe yarıçapı (r)', 'Flap corner radius (r)', Math.min(d.a * 0.3, d.b * 0.4), 0, 300, 'construction'),
        caliperP(0.25),
        bleedP(),
      ]
    case 'env-pocket':
      return [
        N('length', 'Genişlik (a)', 'Width (a)', d.a, 40, 600),
        N('width', 'Yükseklik (b)', 'Height (b)', d.b, 30, 600),
        N('flapDepth', 'Üst kapak (y)', 'Top flap (y)', Math.min(d.b * 0.4, 60), 8, 300, 'construction'),
        N('frontHeight', 'Ön cep yüksekliği', 'Front pocket height', d.b - 6, 15, 600, 'construction'),
        N('glueTab', 'Yan kulak (x)', 'Side tab (x)', 12, 4, 40, 'construction'),
        N('cornerRadius', 'Kapak köşe yarıçapı (r)', 'Flap corner radius (r)', 10, 0, 100, 'construction', true),
        caliperP(0.25),
        bleedP(),
      ]
    case 'env-gusset':
      return [
        N('length', 'Genişlik (a)', 'Width (a)', d.a, 40, 600),
        N('width', 'Körük (b)', 'Gusset (b)', d.b || 20, 3, 120),
        N('height', 'Yükseklik (c)', 'Height (c)', d.c || d.a, 40, 600),
        N('lidDepth', 'Kapak derinliği (e)', 'Lid depth (e)', Math.min((d.c || d.a) * 0.3, 60), 10, 300, 'construction'),
        N('glueTab', 'Yapıştırma kulağı', 'Glue tab', 10, 4, 40, 'construction', true),
        caliperP(0.4),
        bleedP(),
      ]
    case 'env-expanding':
      return [
        N('length', 'Genişlik (a)', 'Width (a)', d.a, 60, 800),
        N('width', 'Yükseklik (b)', 'Height (b)', d.b, 60, 800),
        N('height', 'Körük (c)', 'Gusset (c)', d.c || 20, 3, 120),
        N('flapDepth', 'Üst kapak (e)', 'Top flap (e)', Math.min(d.b * 0.3, 80), 10, 400, 'construction'),
        N('glueTab', 'Yapıştırma kulağı', 'Glue tab', 12, 4, 40, 'construction', true),
        caliperP(0.4),
        bleedP(),
      ]
  }
}

function build(spec: FolderSpec, params: Record<string, ParamValue>): Dieline {
  switch (spec.kind) {
    case 'pocket':
      return buildPocketFolder(spec, params)
    case 'trifold':
      return buildTriFold(spec, params)
    case 'wallet':
      return buildWallet(spec, params)
    case 'portfolio':
      return buildPortfolio(spec, params)
    case 'env-rounded':
      return buildEnvRounded(spec, params)
    case 'env-pocket':
      return buildEnvPocket(spec, params)
    case 'env-gusset':
      return buildEnvGusset(spec, params)
    case 'env-expanding':
      return buildEnvExpanding(spec, params)
  }
}

export const folderTemplate = (spec: FolderSpec): TemplateDefinition => ({
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

const FOLDER: TemplateCategory = 'folders'
const ENVELOPE: TemplateCategory = 'envelopes'
const CARTON: MaterialKind[] = ['carton']

export const FOLDER_SPECS: readonly FolderSpec[] = [
  {
    id: 'folder-lip-both',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b01'],
    name: T('Kart klasörü, iki üst kıvrım', 'Card folder, two top lips'),
    description: T('İki kapak + sırt; her kapağın üst kenarı kapasite payıyla içe kıvrılır (kart tutucu).', 'Two covers + spine; the top edge of each cover folds inward with a capacity allowance (card holder).'),
    keywords: ['klasör', 'folder', 'kart tutucu', 'card holder', 'kıvrım'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: true,
    lips: 'both',
  },
  {
    id: 'folder-lip-left',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b02'],
    name: T('Kart klasörü, tek üst kıvrım', 'Card folder, single top lip'),
    description: T('İki kapak + sırt; yalnızca sol kapağın üst kenarı içe kıvrılır.', 'Two covers + spine; only the left cover’s top edge folds inward.'),
    keywords: ['klasör', 'folder', 'kart tutucu', 'kıvrım'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: true,
    lips: 'left',
  },
  {
    id: 'folder-pocket-tab',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b04'],
    name: T('Sunum klasörü, kulaklı cep', 'Presentation folder, tabbed pocket'),
    description: T('İki kapak + sırt; sol kapakta alttan katlanan cep ve sırta yapışan kulak.', 'Two covers + spine; bottom pocket on the left cover with a glue tab onto the spine side.'),
    keywords: ['sunum klasörü', 'presentation folder', 'cep', 'pocket'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: true,
    lips: 'none',
    pockets: [{ cover: 'left', side: 'bottom', tab: true, cards: false }],
  },
  {
    id: 'ecma-e40-82',
    code: 'E40.82.00.00',
    standard: 'ECMA',
    dct: ['becf-12b05'],
    name: T('Körüklü evrak cüzdanı', 'Gusseted document wallet'),
    description: T('Arka panel + yuvarlak köşeli dilli kapak, alt körük ve yan körüklü ön cep; ön panelde dil yarığı.', 'Back panel with a rounded, tucked lid, bottom gusset and a side-gusseted front pocket; tuck slot in the front.'),
    keywords: ['evrak cüzdanı', 'document wallet', 'körük', 'gusset', 'e40.82'],
    category: FOLDER,
    materials: CARTON,
    kind: 'wallet',
  },
  {
    id: 'ecma-f60-91',
    code: 'F60.91.00.00',
    standard: 'ECMA',
    dct: ['becf-12b06'],
    name: T('Portföy, dört kanatlı', 'Portfolio, four flaps'),
    description: T('Orta panel + pahlı üst/alt/yan kanatlar; yan kanatlarda bağ (kurdele) yarıkları.', 'Center panel with chamfered top/bottom/side flaps; ribbon slots in the side flaps.'),
    keywords: ['portföy', 'portfolio', 'dosya', 'kanat', 'f60.91'],
    category: FOLDER,
    materials: CARTON,
    kind: 'portfolio',
  },
  {
    id: 'folder-pocket-corner',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b07'],
    name: T('Sunum klasörü, kartvizit cepli', 'Presentation folder, card-slit pocket'),
    description: T('Sırtsız iki kapak; sol kapakta alt cep, yapıştırma kulağı ve kartvizit yarıkları.', 'Two covers without spine; bottom pocket on the left with a glue tab and business card slits.'),
    keywords: ['sunum klasörü', 'presentation folder', 'kartvizit', 'business card'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: false,
    lips: 'none',
    pockets: [{ cover: 'left', side: 'bottom', tab: true, cards: true }],
  },
  {
    id: 'folder-pocket-corner-spine',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b08'],
    name: T('Sunum klasörü, kartvizit cepli, sırtlı', 'Presentation folder, card-slit pocket, spined'),
    description: T('İki kapak + kapasite sırtı; sol kapakta alt cep, kulak ve kartvizit yarıkları.', 'Two covers + capacity spine; bottom pocket on the left with a glue tab and business card slits.'),
    keywords: ['sunum klasörü', 'presentation folder', 'kartvizit', 'sırt', 'spine'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: true,
    lips: 'none',
    pockets: [{ cover: 'left', side: 'bottom', tab: true, cards: true }],
  },
  {
    id: 'folder-pocket-side',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b09'],
    name: T('Sunum klasörü, yan cepli', 'Presentation folder, side pocket'),
    description: T('Sırtsız iki kapak; sol kapağın dış kenarından katlanan yan cep, kulak ve kartvizit yarıkları.', 'Two covers without spine; side pocket folding from the outer edge of the left cover, with glue tab and card slits.'),
    keywords: ['sunum klasörü', 'presentation folder', 'yan cep', 'side pocket'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: false,
    lips: 'none',
    pockets: [{ cover: 'left', side: 'outer', tab: true, cards: true }],
  },
  {
    id: 'folder-pocket-side-spine',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b0a'],
    name: T('Sunum klasörü, yan cepli, sırtlı', 'Presentation folder, side pocket, spined'),
    description: T('İki kapak + kapasite sırtı; sol kapakta yan cep, kulak ve kartvizit yarıkları.', 'Two covers + capacity spine; side pocket on the left cover with glue tab and card slits.'),
    keywords: ['sunum klasörü', 'presentation folder', 'yan cep', 'sırt'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: true,
    lips: 'none',
    pockets: [{ cover: 'left', side: 'outer', tab: true, cards: true }],
  },
  {
    id: 'folder-pocket-double',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b0b'],
    name: T('Sunum klasörü, çift cepli', 'Presentation folder, double pocket'),
    description: T('Sırtsız iki kapak; her iki kapakta alt cep ve kartvizit yarıkları.', 'Two covers without spine; bottom pockets with card slits on both covers.'),
    keywords: ['sunum klasörü', 'presentation folder', 'çift cep', 'double pocket'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: false,
    lips: 'none',
    pockets: [
      { cover: 'left', side: 'bottom', tab: false, cards: true },
      { cover: 'right', side: 'bottom', tab: false, cards: true },
    ],
  },
  {
    id: 'folder-trifold',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b0c'],
    name: T('Üç panelli kart (rulo katlama)', 'Tri-fold card (roll fold)'),
    description: T('Kapak / arka / kısa iç kanat; kanat içe, kapak üstüne katlanır.', 'Cover / back / short inner flap; the flap folds in and the cover folds over it.'),
    keywords: ['üç panel', 'tri-fold', 'kart', 'card', 'rulo katlama'],
    category: FOLDER,
    materials: CARTON,
    kind: 'trifold',
    trifold: { dir: 'v' },
  },
  {
    id: 'folder-trifold-lock',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b0d'],
    name: T('Üç panelli kart, kilit dilli', 'Tri-fold card with lock tabs'),
    description: T('Rulo katlanan üç panel; kapak kenarındaki iki dil iç kanattaki yarıklara geçer.', 'Roll-folded three panels; two tabs on the cover edge lock into slits in the inner flap.'),
    keywords: ['üç panel', 'tri-fold', 'kilit dili', 'lock tab', 'kart'],
    category: FOLDER,
    materials: CARTON,
    kind: 'trifold',
    trifold: { dir: 'v', locks: true },
  },
  {
    id: 'folder-presentation',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12b0e'],
    name: T('Sunum klasörü, sırtlı, çift cep', 'Presentation folder, spined, double pocket'),
    description: T('İki kapak + kapasite sırtı; her iki kapakta alt cep ve kartvizit yarıkları — A4 sunum klasörü.', 'Two covers + capacity spine; bottom pockets with card slits on both covers — A4 presentation folder.'),
    keywords: ['sunum klasörü', 'presentation folder', 'a4', 'sırt', 'çift cep'],
    category: FOLDER,
    materials: CARTON,
    kind: 'pocket',
    spine: true,
    lips: 'none',
    pockets: [
      { cover: 'left', side: 'bottom', tab: false, cards: true },
      { cover: 'right', side: 'bottom', tab: false, cards: true },
    ],
    dims: { a: 220, b: 310, c: 6 },
  },
  // --- Zarflar ---
  {
    id: 'ecma-f60-92',
    code: 'F60.92.00.00',
    standard: 'ECMA',
    dct: ['becf-12c01'],
    name: T('Zarf, yuvarlak kapaklı', 'Envelope, rounded flap'),
    description: T('Kare / dikdörtgen zarf; yuvarlak kemerli üst kapak, yuvarlak köşeli alt kapak ve yan kanatlar.', 'Square / rectangular envelope; rounded top flap, rounded bottom flap and side flaps.'),
    keywords: ['zarf', 'envelope', 'yuvarlak kapak', 'davetiye', 'f60.92'],
    category: ENVELOPE,
    materials: CARTON,
    kind: 'env-rounded',
  },
  {
    id: 'ecma-f60-93',
    code: 'F60.93.00.00',
    standard: 'ECMA',
    dct: ['becf-12c02'],
    name: T('Cep zarfı, kulaklı', 'Pocket envelope with side tabs'),
    description: T('Arka + alttan katlanan ön cep (yan yapıştırma kulakları), yuvarlak köşeli ve başparmak oyuklu üst kapak.', 'Back + front pocket folding from the bottom with side glue tabs; rounded top flap with thumb notch.'),
    keywords: ['zarf', 'envelope', 'cep', 'pocket', 'başparmak oyuğu', 'f60.93'],
    category: ENVELOPE,
    materials: CARTON,
    kind: 'env-pocket',
  },
  {
    id: 'envelope-gusset-cd',
    code: '',
    standard: 'CUSTOM',
    dct: ['becf-12c03'],
    name: T('Körüklü zarf (CD / kutu zarfı)', 'Gusseted envelope (CD / box envelope)'),
    description: T('Arka + dilli kapak, alt ve yan körükler, ön panelde dil yarığı — kapasiteli evrak/CD zarfı.', 'Back with tucked lid, bottom and side gussets, tuck slot in the front — CD / document envelope with capacity.'),
    keywords: ['zarf', 'envelope', 'körük', 'gusset', 'cd', 'dil'],
    category: ENVELOPE,
    materials: CARTON,
    kind: 'env-gusset',
  },
  {
    id: 'ecma-f80-53',
    code: 'F80.53.00.00',
    standard: 'ECMA',
    dct: ['becf-12c04'],
    name: T('Kartlık, üç panelli', 'Card holder, tri-fold'),
    description: T('Yan yana üç panel; sol kenarda başparmak oyuğu, sağ panelde kart yarığı — hediye kartı / otel kartı tutucu.', 'Three panels side by side; thumb notch on the left edge and card slit in the right panel — gift / key card holder.'),
    keywords: ['kartlık', 'card holder', 'hediye kartı', 'gift card', 'f80.53'],
    category: ENVELOPE,
    materials: CARTON,
    kind: 'trifold',
    trifold: { dir: 'h', notch: true, slit: true },
  },
  {
    id: 'envelope-expanding',
    code: 'F60.93.00.00',
    standard: 'ECMA',
    dct: ['becf-12c05'],
    name: T('Körüklü evrak torbası', 'Expanding document pouch'),
    description: T('Arka + pahlı üst kapak, sol/alt/sağ körük şeritleri ve sağ körükten ön panel — kapasiteli A4 zarf.', 'Back with chamfered top flap, left/bottom/right gusset strips and a front panel off the right gusset — A4 pouch with capacity.'),
    keywords: ['zarf', 'envelope', 'körüklü', 'expanding', 'torba', 'pouch', 'a4'],
    category: ENVELOPE,
    materials: CARTON,
    kind: 'env-expanding',
  },
]

export const folderTemplates: TemplateDefinition[] = FOLDER_SPECS.map(folderTemplate)
