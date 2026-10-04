import { DielineBuilder, PathBuilder, circlePath, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * diecuttemplates.com sert karton (rigid / set-up box) grupları.
 *
 * Her şablon iki katmandan oluşur: **mukavva parçaları** (V-kanal kırımlı
 * çapraz tepsi, kapak şeridi, boyun bandı) ve **kaplama kâğıdı** (turn-in
 * paylı sargı). Parçalar tek kalıp sayfasında yan yana dizilir; mukavva
 * parçaları baskısızdır, kaplamalar baskılıdır.
 */

type Pt = Point

export type RigidKind =
  | 'two-piece' // taban + tam derinlik kapak
  | 'two-piece-shallow' // taban + alçak kapak
  | 'neck' // taban + boyun bandı + kapak (omuzlu)
  | 'two-piece-notch' // taban + alçak kapak, başparmak deliği
  | 'two-piece-liner' // taban + kapak + iç astar tepsi
  | 'two-piece-sleeve' // taban + kapak + dış kılıf bandı
  | 'book' // taban tepsi + kitap tipi kapak (ön/sırt/arka)
  | 'hinged-trays' // taban + kapak tepsileri, menteşe sargısıyla bağlı
  | 'hinged-neck' // menteşeli tepsiler + boyun bandı
  | 'magnetic' // taban tepsi + arka duvar/kapak/ön kanat şeridi (mıknatıslı)
  | 'display-header' // tezgâh üstü tepsi + yuvarlak köşeli başlık
  | 'swatch-folder' // iki panelli numune kartı, sırt kırımlı, delikli
  | 'swatch-card' // tek panel numune kartı, orta kırım, dört delik

export interface RigidSpec {
  id: string
  code: string
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  kind: RigidKind
  dims?: { a: number; b: number; c: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })
const GAP = 25

const dctDims = (spec: RigidSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b) return { a: e.dims.a, b: e.dims.b, c: e.dims.c ?? 40 }
  }
  return { a: 200, b: 100, c: 50 }
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Bağımsız parça kökleri — tek ağaç için sıfır açılı bağlarla birleştirilir. */
  roots?: string[]
}

const polyPath = (pts: Pt[]): PathBuilder => {
  const pb = new PathBuilder()
  pb.moveTo(pts[0] as Pt)
  for (let i = 1; i < pts.length; i++) pb.lineTo(pts[i] as Pt)
  pb.close()
  return pb
}

const roundedRectPath = (x: number, y: number, w: number, h: number, r: number): PathBuilder => {
  const rr = Math.min(r, w / 2, h / 2)
  const pb = new PathBuilder()
  if (rr <= 0) return polyPath(rectPoints(x, y, w, h))
  pb.moveTo({ x: x + rr, y })
  pb.lineTo({ x: x + w - rr, y })
  pb.filletTo({ x: x + w, y }, { x: x + w, y: y + h }, rr)
  pb.lineTo({ x: x + w, y: y + h - rr })
  pb.filletTo({ x: x + w, y: y + h }, { x, y: y + h }, rr)
  pb.lineTo({ x: x + rr, y: y + h })
  pb.filletTo({ x, y: y + h }, { x, y }, rr)
  pb.lineTo({ x, y: y + rr })
  pb.filletTo({ x, y }, { x: x + w, y }, rr)
  pb.close()
  return pb
}

/** Üst köşeleri yuvarlatılmış dikdörtgen — yay n parçaya örneklenir (kesim ve panel aynı noktaları kullanır). */
const roundedTopRectPts = (x: number, y: number, w: number, h: number, r: number, n = 6): Pt[] => {
  const rr = Math.min(r, w / 2, h)
  const pts: Pt[] = [{ x, y }, { x: x + w, y }]
  if (rr <= 0) return [...pts, { x: x + w, y: y + h }, { x, y: y + h }]
  pts.push({ x: x + w, y: y + h - rr })
  for (let i = 1; i <= n; i++) {
    const th = (i / n) * (Math.PI / 2)
    pts.push({ x: x + w - rr + rr * Math.cos(th), y: y + h - rr + rr * Math.sin(th) })
  }
  for (let i = 0; i <= n; i++) {
    const th = Math.PI / 2 + (i / n) * (Math.PI / 2)
    pts.push({ x: x + rr + rr * Math.cos(th), y: y + h - rr + rr * Math.sin(th) })
  }
  return pts
}

/** Alt köşeleri yuvarlatılmış dikdörtgen (üst sürümün y ekseninde aynası). */
const roundedBottomRectPts = (x: number, y: number, w: number, h: number, r: number, n = 6): Pt[] => roundedTopRectPts(x, y, w, h, r, n).map((p) => ({ x: p.x, y: 2 * y + h - p.y }))

/** Dört köşesi yuvarlatılmış dikdörtgen noktaları (kesim + panel için ortak). */
const roundedRectPts = (x: number, y: number, w: number, h: number, r: number, n = 3): Pt[] => {
  const rr = Math.min(r, w / 2, h / 2)
  if (rr <= 0) return rectPoints(x, y, w, h)
  const pts: Pt[] = []
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const th = a0 + (i / n) * (Math.PI / 2)
      pts.push({ x: cx + rr * Math.cos(th), y: cy + rr * Math.sin(th) })
    }
  }
  corner(x + w - rr, y + rr, -Math.PI / 2)
  corner(x + w - rr, y + h - rr, 0)
  corner(x + rr, y + h - rr, Math.PI / 2)
  corner(x + rr, y + rr, Math.PI)
  return pts
}

interface TrayOpts {
  /** Ön duvarda başparmak deliği (kaplamada). */
  notch?: boolean
  /** Arka duvar başlık uzantısı: yükseklik + köşe yarıçapı. */
  header?: { h: number; r: number }
}

/**
 * Mukavva çapraz tepsi: taban a×b, dört duvar c; kırımlar V-kanal.
 * Sol alt köşe (ox, oy) — duvarlar tabandan dışarı uzandığı için gerçek
 * bbox (ox−c … ox+a+c) olur.
 */
function boardTray(b: DielineBuilder, pre: string, ox: number, oy: number, a: number, bW: number, c: number, opts: TrayOpts = {}): Box {
  const hh = opts.header?.h ?? 0
  const pts: Pt[] = [
    { x: ox, y: oy },
    { x: ox, y: oy - c },
    { x: ox + a, y: oy - c },
    { x: ox + a, y: oy },
    { x: ox + a + c, y: oy },
    { x: ox + a + c, y: oy + bW },
    { x: ox + a, y: oy + bW },
    { x: ox + a, y: oy + bW + c + hh },
    { x: ox, y: oy + bW + c + hh },
    { x: ox, y: oy + bW },
    { x: ox - c, y: oy + bW },
    { x: ox - c, y: oy },
  ]
  const backPts = roundedTopRectPts(ox, oy + bW, a, c + hh, hh > 0 && opts.header ? opts.header.r : 0)
  if (hh > 0 && opts.header) {
    // Arka duvar + başlık: köşeleri yuvarlatılmış nokta dizisiyle çevre
    const head = backPts.slice(2) // (x+w, y+h-rr) … (x, y+h-rr) → sağdan sola
    const merged: Pt[] = [...pts.slice(0, 7), ...head, ...pts.slice(9)]
    b.cut(polyPath(merged).build(), `${pre} mukavva tepsi`)
  } else b.cut(polyPath(pts).build(), `${pre} mukavva tepsi`)

  const P = (id: string, label: I18nText, outline: Pt[], role: 'bottom' | 'wall') => b.panel({ id: `${pre}-${id}`, name: `${pre}-${id}`, label, outline, role, printable: false })
  P('base', T('Mukavva taban', 'Board base'), rectPoints(ox, oy, a, bW), 'bottom')
  P('front', T('Mukavva ön duvar', 'Board front wall'), rectPoints(ox, oy - c, a, c), 'wall')
  P('back', T('Mukavva arka duvar', 'Board back wall'), backPts, 'wall')
  P('left', T('Mukavva sol duvar', 'Board left wall'), rectPoints(ox - c, oy, c, bW), 'wall')
  P('right', T('Mukavva sağ duvar', 'Board right wall'), rectPoints(ox + a, oy, c, bW), 'wall')
  b.fold({ parent: `${pre}-base`, child: `${pre}-front`, ...foldHorizontal(oy, ox, ox + a, 'below') })
  b.fold({ parent: `${pre}-base`, child: `${pre}-back`, ...foldHorizontal(oy + bW, ox, ox + a, 'above') })
  b.fold({ parent: `${pre}-base`, child: `${pre}-left`, ...foldVertical(ox, oy, oy + bW, 'left') })
  b.fold({ parent: `${pre}-base`, child: `${pre}-right`, ...foldVertical(ox + a, oy, oy + bW, 'right') })
  return { minX: ox - c, minY: oy - c, maxX: ox + a + c, maxY: oy + bW + c + hh, roots: [`${pre}-base`] }
}

/**
 * Kaplama kâğıdı: merkez (a+2t)×(b+2t), dört kol c+t derinlik + turn-in;
 * yan kollarda köşe sargı kulakları, turn-in bölgesinde 45° pah.
 */
function wrapTray(b: DielineBuilder, pre: string, ox: number, oy: number, a: number, bW: number, c: number, t: number, ti: number, opts: TrayOpts = {}): Box {
  const A = a + 2 * t
  const B = bW + 2 * t
  const D = c + t
  const tab = t + 3
  const hh = opts.header?.h ?? 0
  const TIb = Math.min(ti, D * 0.9)
  const x0 = ox
  const y0 = oy
  const pts: Pt[] = [
    { x: x0, y: y0 - tab },
    { x: x0, y: y0 - D },
    { x: x0 + TIb, y: y0 - D - TIb },
    { x: x0 + A - TIb, y: y0 - D - TIb },
    { x: x0 + A, y: y0 - D },
    { x: x0 + A, y: y0 - tab },
    { x: x0 + A + D, y: y0 - tab },
    { x: x0 + A + D + TIb, y: y0 + TIb - tab + tab },
    { x: x0 + A + D + TIb, y: y0 + B - TIb },
    { x: x0 + A + D, y: y0 + B + tab },
    { x: x0 + A, y: y0 + B + tab },
    { x: x0 + A, y: y0 + B + D + hh },
    { x: x0 + A - TIb, y: y0 + B + D + hh + TIb },
    { x: x0 + TIb, y: y0 + B + D + hh + TIb },
    { x: x0, y: y0 + B + D + hh },
    { x: x0, y: y0 + B + tab },
    { x: x0 - D, y: y0 + B + tab },
    { x: x0 - D - TIb, y: y0 + B - TIb },
    { x: x0 - D - TIb, y: y0 + TIb },
    { x: x0 - D, y: y0 - tab },
  ]
  b.cut(polyPath(pts).build(), `${pre} kaplama kâğıdı`)

  // Kıvrım hatları: merkez kenarları ve duvar/turn-in geçişleri
  b.creaseLine({ x: x0, y: y0 - D }, { x: x0 + A, y: y0 - D }, 'turn-in kıvrımı')
  b.creaseLine({ x: x0, y: y0 + B + D + hh }, { x: x0 + A, y: y0 + B + D + hh }, 'turn-in kıvrımı')
  b.creaseLine({ x: x0 - D, y: y0 }, { x: x0 - D, y: y0 + B }, 'turn-in kıvrımı')
  b.creaseLine({ x: x0 + A + D, y: y0 }, { x: x0 + A + D, y: y0 + B }, 'turn-in kıvrımı')
  b.crease(rectPath(x0, y0, A, B), 'mukavva kenarı kıvrımı')

  const P = (id: string, label: I18nText, outline: Pt[], role: 'bottom' | 'wall' | 'flap', printable = true) => b.panel({ id: `${pre}-${id}`, name: `${pre}-${id}`, label, outline, role, printable })
  P('center', T('Kaplama taban', 'Wrap base'), rectPoints(x0, y0, A, B), 'bottom')
  P('front', T('Kaplama ön', 'Wrap front'), rectPoints(x0, y0 - D, A, D), 'wall')
  P('back', T('Kaplama arka', 'Wrap back'), rectPoints(x0, y0 + B, A, D + hh), 'wall')
  P('left', T('Kaplama sol', 'Wrap left'), [{ x: x0, y: y0 - tab }, { x: x0, y: y0 + B + tab }, { x: x0 - D, y: y0 + B + tab }, { x: x0 - D, y: y0 - tab }], 'wall')
  P('right', T('Kaplama sağ', 'Wrap right'), [{ x: x0 + A, y: y0 - tab }, { x: x0 + A + D, y: y0 - tab }, { x: x0 + A + D, y: y0 + B + tab }, { x: x0 + A, y: y0 + B + tab }], 'wall')
  P('front-ti', T('Ön turn-in', 'Front turn-in'), [{ x: x0, y: y0 - D }, { x: x0 + TIb, y: y0 - D - TIb }, { x: x0 + A - TIb, y: y0 - D - TIb }, { x: x0 + A, y: y0 - D }], 'flap', false)
  P('back-ti', T('Arka turn-in', 'Back turn-in'), [{ x: x0, y: y0 + B + D + hh }, { x: x0 + A, y: y0 + B + D + hh }, { x: x0 + A - TIb, y: y0 + B + D + hh + TIb }, { x: x0 + TIb, y: y0 + B + D + hh + TIb }], 'flap', false)
  P('left-ti', T('Sol turn-in', 'Left turn-in'), [{ x: x0 - D, y: y0 - tab }, { x: x0 - D, y: y0 + B + tab }, { x: x0 - D - TIb, y: y0 + B - TIb }, { x: x0 - D - TIb, y: y0 + TIb }], 'flap', false)
  P('right-ti', T('Sağ turn-in', 'Right turn-in'), [{ x: x0 + A + D, y: y0 - tab }, { x: x0 + A + D + TIb, y: y0 + TIb }, { x: x0 + A + D + TIb, y: y0 + B - TIb }, { x: x0 + A + D, y: y0 + B + tab }], 'flap', false)
  b.fold({ parent: `${pre}-center`, child: `${pre}-front`, ...foldHorizontal(y0, x0, x0 + A, 'below') })
  b.fold({ parent: `${pre}-center`, child: `${pre}-back`, ...foldHorizontal(y0 + B, x0, x0 + A, 'above') })
  b.fold({ parent: `${pre}-center`, child: `${pre}-left`, ...foldVertical(x0, y0, y0 + B, 'left') })
  b.fold({ parent: `${pre}-center`, child: `${pre}-right`, ...foldVertical(x0 + A, y0, y0 + B, 'right') })
  b.fold({ parent: `${pre}-front`, child: `${pre}-front-ti`, ...foldHorizontal(y0 - D, x0, x0 + A, 'below', 175) })
  b.fold({ parent: `${pre}-back`, child: `${pre}-back-ti`, ...foldHorizontal(y0 + B + D + hh, x0, x0 + A, 'above', 175) })
  b.fold({ parent: `${pre}-left`, child: `${pre}-left-ti`, ...foldVertical(x0 - D, y0 - tab, y0 + B + tab, 'left', 175) })
  b.fold({ parent: `${pre}-right`, child: `${pre}-right-ti`, ...foldVertical(x0 + A + D, y0 - tab, y0 + B + tab, 'right', 175) })
  if (opts.notch) {
    const nw = Math.min(A * 0.35, 40)
    const nh = Math.min(D * 0.5, 12)
    if (nw >= 12 && nh >= 5) b.cut(stadiumPath({ x: x0 + A / 2, y: y0 - D + nh * 0.9 }, nw, nh), 'başparmak deliği')
  }
  return { minX: x0 - D - TIb, minY: y0 - D - TIb, maxX: x0 + A + D + TIb, maxY: y0 + B + D + hh + TIb, roots: [`${pre}-center`] }
}

/** Tepsi seti: mukavva + kaplama yan yana. */
function trayKit(b: DielineBuilder, pre: string, ox: number, oy: number, a: number, bW: number, c: number, t: number, ti: number, opts: TrayOpts = {}): Box {
  const board = boardTray(b, `${pre}-board`, ox + c, oy + c + ti, a, bW, c, opts)
  const wx = board.maxX + GAP + c + t + ti
  const wrap = wrapTray(b, `${pre}-wrap`, wx, oy + c + ti + t, a, bW, c, t, ti, opts)
  return { minX: board.minX, minY: Math.min(board.minY, wrap.minY), maxX: wrap.maxX, maxY: Math.max(board.maxY, wrap.maxY), roots: [...(board.roots ?? []), ...(wrap.roots ?? [])] }
}

/** Boyun / kılıf bandı: dört duvar sırayla (a, b, a, b) + kaplama şeridi. */
function bandKit(b: DielineBuilder, pre: string, ox: number, oy: number, a: number, bW: number, h: number, t: number, ti: number, label: I18nText): Box {
  const widths = [a, bW, a, bW]
  let x = ox
  const ids: string[] = []
  for (let i = 0; i < 4; i++) {
    const w = widths[i] as number
    const id = `${pre}-board-${i}`
    b.cut(rectPath(x, oy, w, h), `${pre} mukavva bant`)
    b.panel({ id, name: id, label, outline: rectPoints(x, oy, w, h), role: 'wall', printable: false })
    ids.push(id)
    if (i > 0) b.fold({ parent: ids[i - 1] as string, child: id, ...foldVertical(x, oy, oy + h, 'right') })
    x += w + t
  }
  const boardMaxX = x - t
  // Kaplama şeridi: toplam çevre + bindirme, yükseklik h + 2 turn-in
  const wx = boardMaxX + GAP
  const total = 2 * (a + bW) + 8 * t + 12
  const wy = oy - ti
  b.cut(rectPath(wx, wy, total, h + 2 * ti), `${pre} kaplama şeridi`)
  b.creaseLine({ x: wx, y: oy }, { x: wx + total, y: oy }, 'turn-in kıvrımı')
  b.creaseLine({ x: wx, y: oy + h }, { x: wx + total, y: oy + h }, 'turn-in kıvrımı')
  let cx = wx + 6
  for (let i = 0; i < 4; i++) {
    cx += (widths[i] as number) + 2 * t
    b.creaseLine({ x: cx, y: wy }, { x: cx, y: wy + h + 2 * ti }, 'köşe kıvrımı')
  }
  b.panel({ id: `${pre}-wrap`, name: `${pre}-wrap`, label: T('Kaplama şeridi', 'Wrap strip'), outline: rectPoints(wx, wy, total, h + 2 * ti), role: 'wall' })
  return { minX: ox, minY: wy, maxX: wx + total, maxY: oy + h + ti, roots: [`${pre}-board-0`, `${pre}-wrap`] }
}

/** Kapak şeridi (kitap / mıknatıslı): mukavva segmentleri aralıklı + tek kaplama. */
function coverKit(b: DielineBuilder, pre: string, ox: number, oy: number, segs: { w: number; label: I18nText }[], hgt: number, t: number, ti: number, roundR = 0): Box {
  const gap = t + 1.5
  let x = ox
  const ids: string[] = []
  segs.forEach((s, i) => {
    const id = `${pre}-board-${i}`
    b.cut(rectPath(x, oy, s.w, hgt), `${pre} mukavva`)
    b.panel({ id, name: id, label: s.label, outline: rectPoints(x, oy, s.w, hgt), role: 'wall', printable: false })
    ids.push(id)
    if (i > 0) {
      const hid = `${pre}-hinge-${i}`
      b.panel({ id: hid, name: hid, label: T('Menteşe boşluğu', 'Hinge gap'), outline: rectPoints(x - gap, oy, gap, hgt), role: 'flap', printable: false })
      b.fold({ parent: ids[i - 1] as string, child: hid, ...foldVertical(x - gap, oy, oy + hgt, 'right', 45) })
      b.fold({ parent: hid, child: id, ...foldVertical(x, oy, oy + hgt, 'right', 45) })
    }
    x += s.w + gap
  })
  const boardMaxX = x - gap
  const wx = boardMaxX + GAP
  const total = boardMaxX - ox + 2 * ti
  b.cut(roundedRectPath(wx, oy - ti, total, hgt + 2 * ti, roundR).build(), `${pre} kaplama`)
  b.crease(rectPath(wx + ti, oy, total - 2 * ti, hgt), 'mukavva kenarı kıvrımı')
  let cx = wx + ti
  segs.forEach((s, i) => {
    if (i > 0) {
      b.creaseLine({ x: cx - gap, y: oy - ti }, { x: cx - gap, y: oy + hgt + ti }, 'menteşe kıvrımı')
      b.creaseLine({ x: cx, y: oy - ti }, { x: cx, y: oy + hgt + ti }, 'menteşe kıvrımı')
    }
    cx += s.w + gap
  })
  b.panel({ id: `${pre}-wrap`, name: `${pre}-wrap`, label: T('Kapak kaplaması', 'Cover wrap'), outline: rectPoints(wx, oy - ti, total, hgt + 2 * ti), role: 'lid' })
  return { minX: ox, minY: oy - ti, maxX: wx + total, maxY: oy + hgt + ti, roots: [`${pre}-board-0`, `${pre}-wrap`] }
}

const union = (a: Box, c: Box): Box => ({ minX: Math.min(a.minX, c.minX), minY: Math.min(a.minY, c.minY), maxX: Math.max(a.maxX, c.maxX), maxY: Math.max(a.maxY, c.maxY), roots: [...(a.roots ?? []), ...(c.roots ?? [])] })

// ---------------------------------------------------------------------------

function buildRigid(spec: RigidSpec, params: Record<string, ParamValue>): Dieline {
  const a = num(params, 'length')
  const bW = num(params, 'width')
  const c = spec.kind === 'swatch-card' ? 0 : num(params, 'height')
  const t = num(params, 'caliper')
  const ti = num(params, 'turnIn')
  const bleed = num(params, 'bleed')
  const b = new DielineBuilder(spec.id, { name: spec.name, caliper: t, glueFlapSide: 'none' }, params)
  const clr = t + 1 // kapak iç boşluğu (taban dış ölçüsü + hava)
  let box: Box | null = null
  let y = 0
  let lastBox: Box | null = null
  const place = (fn: (ox: number, oy: number) => Box) => {
    const r = fn(0, y + ti)
    box = box ? union(box, r) : r
    lastBox = r
    y = r.maxY + GAP
  }
  const lidA = a + 2 * t + 2 * clr
  const lidB = bW + 2 * t + 2 * clr

  switch (spec.kind) {
    case 'two-piece':
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) => trayKit(b, 'lid', ox, oy, lidA, lidB, c, t, ti))
      break
    case 'two-piece-shallow':
    case 'two-piece-notch': {
      const lidH = Math.max(8, num(params, 'lidHeight') || c * 0.5)
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) => trayKit(b, 'lid', ox, oy, lidA, lidB, lidH, t, ti, { notch: spec.kind === 'two-piece-notch' }))
      break
    }
    case 'neck': {
      const lidH = Math.max(8, num(params, 'lidHeight') || c * 0.6)
      const neckH = Math.max(6, c * 0.6)
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) => bandKit(b, 'neck', ox, oy, a - 2 * t - 1, bW - 2 * t - 1, neckH, t, ti, T('Boyun bandı', 'Neck band')))
      place((ox, oy) => trayKit(b, 'lid', ox, oy, lidA, lidB, lidH, t, ti))
      break
    }
    case 'two-piece-liner': {
      const lidH = Math.max(8, num(params, 'lidHeight') || c * 0.5)
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) => trayKit(b, 'lid', ox, oy, lidA, lidB, lidH, t, ti, { notch: true }))
      place((ox, oy) => trayKit(b, 'liner', ox, oy, a - 2 * t - 1, bW - 2 * t - 1, Math.max(5, c * 0.45), t, ti))
      break
    }
    case 'two-piece-sleeve':
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) => trayKit(b, 'lid', ox, oy, lidA, lidB, c, t, ti))
      place((ox, oy) => bandKit(b, 'sleeve', ox, oy, lidA + 2 * t + 2, lidB + 2 * t + 2, Math.max(10, c * 0.7), t, ti, T('Kılıf bandı', 'Sleeve band')))
      break
    case 'book':
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) =>
        coverKit(
          b,
          'cover',
          ox,
          oy,
          [
            { w: bW + 2 * t + 2, label: T('Ön kapak', 'Front cover') },
            { w: c + 2 * t + 2, label: T('Sırt', 'Spine') },
            { w: bW + 2 * t + 2, label: T('Arka kapak', 'Back cover') },
          ],
          a + 2 * t + 4,
          t,
          ti,
        ),
      )
      break
    case 'hinged-trays':
    case 'hinged-neck': {
      const lidH = Math.max(8, num(params, 'lidHeight') || c * 0.5)
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) => trayKit(b, 'lid', ox, oy, lidA, lidB, lidH, t, ti))
      if (spec.kind === 'hinged-neck') place((ox, oy) => bandKit(b, 'neck', ox, oy, a - 2 * t - 1, bW - 2 * t - 1, Math.max(6, c * 0.5), t, ti, T('Boyun bandı', 'Neck band')))
      // Menteşe sargısı: arka duvarları birleştiren kâğıt şerit
      place((ox, oy) => {
        const w = a + 2 * t
        const h = c + lidH + 2 * t + 2 * ti + 3
        b.cut(rectPath(ox, oy, w, h), 'menteşe sargısı')
        b.creaseLine({ x: ox, y: oy + ti + c + t }, { x: ox + w, y: oy + ti + c + t }, 'menteşe kıvrımı')
        b.creaseLine({ x: ox, y: oy + ti + c + t + 3 }, { x: ox + w, y: oy + ti + c + t + 3 }, 'menteşe kıvrımı')
        b.panel({ id: 'hinge-wrap', name: 'hinge-wrap', label: T('Menteşe sargısı', 'Hinge wrap'), outline: rectPoints(ox, oy, w, h), role: 'flap' })
        return { minX: ox, minY: oy, maxX: ox + w, maxY: oy + h, roots: ['hinge-wrap'] }
      })
      break
    }
    case 'magnetic': {
      const flap = Math.max(10, num(params, 'flapHeight') || c * 0.8)
      place((ox, oy) => trayKit(b, 'base', ox, oy, a, bW, c, t, ti))
      place((ox, oy) =>
        coverKit(
          b,
          'cover',
          ox,
          oy,
          [
            { w: c + t, label: T('Arka duvar', 'Back wall') },
            { w: bW + 2 * t + 2, label: T('Kapak', 'Lid') },
            { w: flap, label: T('Ön kanat (mıknatıs)', 'Front flap (magnet)') },
          ],
          a + 2 * t + 2,
          t,
          ti,
          Math.min(6, flap * 0.3),
        ),
      )
      // Mıknatıs yerleri: ön kanat ve taban ön duvarında
      const mr = Math.min(5, flap * 0.2)
      if (mr >= 2 && lastBox) {
        const lb = lastBox as Box
        const fx = lb.maxX - ti - flap * 0.5
        const y0 = lb.minY + ti
        const hgt = a + 2 * t + 2
        b.guide('safe', circlePath({ x: fx, y: y0 + hgt * 0.25 }, mr), 'mıknatıs yeri')
        b.guide('safe', circlePath({ x: fx, y: y0 + hgt * 0.75 }, mr), 'mıknatıs yeri')
      }
      break
    }
    case 'display-header': {
      const hh = Math.max(20, num(params, 'headerHeight') || bW * 0.6)
      const r = num(params, 'cornerRadius')
      place((ox, oy) => trayKit(b, 'tray', ox, oy, a, bW, c, t, ti, { header: { h: hh, r } }))
      break
    }
    case 'swatch-folder': {
      // İki panel a×b, sırt c; dört köşede delik d; yuvarlak köşe
      const d = Math.max(2, num(params, 'holeDiameter'))
      const total = 2 * bW + c
      b.cut(polyPath(roundedRectPts(0, 0, a, total, 6)).build(), 'numune kartı çevresi')
      b.creaseLine({ x: 0, y: bW }, { x: a, y: bW }, 'sırt kırımı')
      b.creaseLine({ x: 0, y: bW + c }, { x: a, y: bW + c }, 'sırt kırımı')
      b.panel({ id: 'front', name: 'front', label: T('Ön panel', 'Front panel'), outline: roundedBottomRectPts(0, 0, a, bW, 6, 3), role: 'wall' })
      b.root('front')
      b.panel({ id: 'spine', name: 'spine', label: T('Sırt', 'Spine'), outline: rectPoints(0, bW, a, c), role: 'wall' })
      b.fold({ parent: 'front', child: 'spine', ...foldHorizontal(bW, 0, a, 'above') })
      b.panel({ id: 'back', name: 'back', label: T('Arka panel', 'Back panel'), outline: roundedTopRectPts(0, bW + c, a, bW, 6, 3), role: 'wall' })
      b.fold({ parent: 'spine', child: 'back', ...foldHorizontal(bW + c, 0, a, 'above') })
      const m = Math.max(6, d)
      for (const [hx, hy] of [
        [m, m],
        [a - m, m],
        [m, total - m],
        [a - m, total - m],
      ]) b.cut(circlePath({ x: hx as number, y: hy as number }, d / 2), 'perçin deliği')
      box = { minX: 0, minY: 0, maxX: a, maxY: total }
      break
    }
    case 'swatch-card': {
      const d = Math.max(2, num(params, 'holeDiameter'))
      const all = roundedRectPts(0, 0, a, bW, 6)
      b.cut(polyPath(all).build(), 'numune kartı çevresi')
      b.creaseLine({ x: 0, y: bW / 2 }, { x: a, y: bW / 2 }, 'orta kırım')
      b.panel({ id: 'lower', name: 'lower', label: T('Alt yarı', 'Lower half'), outline: roundedBottomRectPts(0, 0, a, bW / 2, 6, 3), role: 'wall' })
      b.root('lower')
      b.panel({ id: 'upper', name: 'upper', label: T('Üst yarı', 'Upper half'), outline: roundedTopRectPts(0, bW / 2, a, bW / 2, 6, 3), role: 'wall' })
      b.fold({ parent: 'lower', child: 'upper', ...foldHorizontal(bW / 2, 0, a, 'above', 180) })
      const m = Math.max(6, d)
      for (const [hx, hy] of [
        [m, m],
        [a - m, m],
        [m, bW - m],
        [a - m, bW - m],
      ]) b.cut(circlePath({ x: hx as number, y: hy as number }, d / 2), 'perçin deliği')
      box = { minX: 0, minY: 0, maxX: a, maxY: bW }
      break
    }
  }
  const bx = box as Box | null
  // Bağımsız parçaları tek panel ağacında topla (çizilmeyen, sıfır açılı bağlar)
  const roots = bx?.roots ?? []
  if (roots.length > 1 && bx) {
    b.root(roots[0] as string)
    for (let i = 1; i < roots.length; i++) {
      b.fold({ parent: roots[0] as string, child: roots[i] as string, axis: [{ x: bx.minX, y: bx.minY - i }, { x: bx.maxX, y: bx.minY - i }], angle: 0, draw: false })
    }
  }
  if (bleed > 0 && bx) b.guide('bleed', rectPath(bx.minX - bleed, bx.minY - bleed, bx.maxX - bx.minX + 2 * bleed, bx.maxY - bx.minY + 2 * bleed), 'taşma payı')
  return b.build()
}

// ---------------------------------------------------------------------------

const P = (key: string, tr: string, en: string, def: number, min: number, max: number, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ kind: 'number', key, label: { tr, en }, unit: 'mm', min, max, step: 0.5, default: def, group: 'dimensions', ...extra }) as ParamDef

const paramsFor = (spec: RigidSpec): ParamDef[] => {
  const d = dctDims(spec)
  const common: ParamDef[] = [
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.8, max: 4, step: 0.1, default: 2, group: 'material' },
    P('turnIn', 'Kaplama turn-in payı (d4)', 'Wrap turn-in (d4)', 15, 5, 40, { group: 'construction' } as Partial<ParamDef>),
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ]
  const dims = [P('length', 'İç uzunluk (a)', 'Inner length (a)', d.a, 30, 800), P('width', 'İç genişlik (b)', 'Inner width (b)', d.b, 20, 800), P('height', 'İç yükseklik (c)', 'Inner height (c)', d.c, 8, 400)]
  const lidH = P('lidHeight', 'Kapak yüksekliği (e)', 'Lid height (e)', 0, 0, 400, { autoWhenZero: true, group: 'construction' } as Partial<ParamDef>)
  switch (spec.kind) {
    case 'two-piece':
    case 'two-piece-sleeve':
    case 'book':
      return [...dims, ...common]
    case 'two-piece-shallow':
    case 'two-piece-notch':
    case 'neck':
    case 'two-piece-liner':
    case 'hinged-trays':
    case 'hinged-neck':
      return [...dims, lidH, ...common]
    case 'magnetic':
      return [...dims, P('flapHeight', 'Ön kanat (h)', 'Front flap (h)', 0, 0, 300, { autoWhenZero: true, group: 'construction' } as Partial<ParamDef>), ...common]
    case 'display-header':
      return [...dims, P('headerHeight', 'Başlık yüksekliği (f)', 'Header height (f)', 0, 0, 600, { autoWhenZero: true, group: 'construction' } as Partial<ParamDef>), P('cornerRadius', 'Başlık köşe yarıçapı (r)', 'Header corner radius (r)', 20, 0, 150, { group: 'construction' } as Partial<ParamDef>), ...common]
    case 'swatch-folder':
      return [P('length', 'Genişlik (a)', 'Width (a)', d.a, 40, 800), P('width', 'Panel yüksekliği (b)', 'Panel height (b)', d.b, 20, 600), P('height', 'Sırt (c)', 'Spine (c)', d.c, 2, 100), P('holeDiameter', 'Delik çapı (d)', 'Hole diameter (d)', 5, 2, 20, { group: 'construction' } as Partial<ParamDef>), ...common]
    case 'swatch-card':
      return [P('length', 'Genişlik (a)', 'Width (a)', d.a, 40, 800), P('width', 'Yükseklik (b)', 'Height (b)', d.b, 20, 600), P('holeDiameter', 'Delik çapı (d)', 'Hole diameter (d)', 5, 2, 20, { group: 'construction' } as Partial<ParamDef>), ...common]
  }
}

export const rigidTemplate = (spec: RigidSpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: 'CUSTOM',
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, ...spec.dct],
  params: paramsFor(spec),
  build: (params) => buildRigid(spec, params),
})

const HB: MaterialKind[] = ['hardboard']

export const RIGID_SPECS: readonly RigidSpec[] = [
  {
    id: 'rigid-two-piece-full',
    code: '',
    dct: ['becf-30101'],
    name: T('Sert kutu, tam derinlik kapak', 'Rigid box, full-depth lid'),
    description: T('Taban ve tam yükseklik teleskop kapak; her parça için mukavva çapraz ve kaplama kâğıdı.', 'Base and full-height telescoping lid; board cross and wrap paper for each piece.'),
    keywords: ['sert kutu', 'rigid', 'set-up box', 'teleskop', 'kaplama'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'two-piece',
  },
  {
    id: 'rigid-neck-box',
    code: '',
    dct: ['becf-30103'],
    name: T('Omuzlu (boyunlu) sert kutu', 'Rigid shoulder-neck box'),
    description: T('Taban, boyun bandı ve alçak kapak; kapak boynun üstüne oturur, taban ile aynı hizada kapanır.', 'Base, neck band and shallow lid; the lid sits on the neck flush with the base.'),
    keywords: ['omuz', 'shoulder', 'boyun', 'neck', 'sert kutu', 'rigid'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'neck',
  },
  {
    id: 'rigid-shallow-lid-notch',
    code: '',
    dct: ['becf-30104'],
    name: T('Sert kutu, alçak kapak ve başparmak deliği', 'Rigid box, shallow lid with thumb notch'),
    description: T('Taban + alçak kapak; kapak kaplamasında başparmak deliği (kulak).', 'Base plus shallow lid with a thumb notch in the lid wrap.'),
    keywords: ['sert kutu', 'rigid', 'alçak kapak', 'başparmak', 'kulak'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'two-piece-notch',
  },
  {
    id: 'rigid-liner-box',
    code: '',
    dct: ['becf-30105'],
    name: T('Sert kutu, iç astar tepsili', 'Rigid box with inner liner tray'),
    description: T('Taban, alçak kapak ve içine oturan astar tepsi; kapakta başparmak deliği.', 'Base, shallow lid and an inner liner tray; thumb notch on the lid.'),
    keywords: ['sert kutu', 'rigid', 'astar', 'liner', 'iç tepsi'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'two-piece-liner',
  },
  {
    id: 'rigid-small-neck',
    code: '',
    dct: ['becf-30109'],
    name: T('Küçük omuzlu sert kutu', 'Small rigid neck box'),
    description: T('Küçük ölçülü taban + boyun + kapak seti; mücevher ve saat kutuları.', 'Small base + neck + lid set for jewellery and watch boxes.'),
    keywords: ['mücevher', 'jewellery', 'saat', 'omuz', 'sert kutu'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'neck',
  },
  {
    id: 'rigid-shallow-lid',
    code: '',
    dct: ['becf-3010a'],
    name: T('Sert kutu, alçak kapak', 'Rigid box with shallow lid'),
    description: T('Taban ve kısa kenarlı kapak (k); klasik hediye kutusu.', 'Base and short-walled lid (k); classic gift box.'),
    keywords: ['sert kutu', 'rigid', 'alçak kapak', 'hediye'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'two-piece-shallow',
  },
  {
    id: 'rigid-sleeve-box',
    code: '',
    dct: ['becf-3010e'],
    name: T('Sert kutu, dış kılıflı', 'Rigid box with outer sleeve'),
    description: T('Taban, kapak ve üzerine geçen kılıf bandı; premium ambalaj.', 'Base, lid and an outer sleeve band; premium packaging.'),
    keywords: ['sert kutu', 'rigid', 'kılıf', 'sleeve', 'premium'],
    category: 'covered-solid-board-boxes',
    materials: HB,
    kind: 'two-piece-sleeve',
  },
  {
    id: 'rigid-book-box',
    code: '',
    dct: ['becf-30203'],
    name: T('Kitap tipi sert kutu', 'Book-style rigid box'),
    description: T('Taban tepsi ve ön kapak / sırt / arka kapaktan oluşan kitap kapağı; tek kaplama kâğıdı.', 'Base tray and a book cover of front board, spine and back board under one wrap.'),
    keywords: ['kitap kutusu', 'book box', 'menteşe', 'sert kutu'],
    category: 'boxes-with-hinged-lid',
    materials: HB,
    kind: 'book',
  },
  {
    id: 'rigid-hinged-trays',
    code: '',
    dct: ['becf-30206'],
    name: T('Menteşeli iki tepsili sert kutu', 'Hinged two-tray rigid box'),
    description: T('Taban ve alçak kapak tepsileri arka duvardan menteşe sargısıyla bağlanır.', 'Base and shallow lid trays joined at the back wall by a hinge wrap.'),
    keywords: ['menteşe', 'hinged', 'puro', 'sert kutu'],
    category: 'boxes-with-hinged-lid',
    materials: HB,
    kind: 'hinged-trays',
  },
  {
    id: 'rigid-hinged-neck',
    code: '',
    dct: ['becf-30207'],
    name: T('Menteşeli omuzlu sert kutu', 'Hinged rigid box with neck'),
    description: T('Menteşeli taban/kapak tepsileri ve iç boyun bandı; büyük hediye ve sunum kutuları.', 'Hinged base/lid trays with an inner neck band; large gift and presentation boxes.'),
    keywords: ['menteşe', 'hinged', 'omuz', 'neck', 'sunum', 'sert kutu'],
    category: 'boxes-with-hinged-lid',
    materials: HB,
    kind: 'hinged-neck',
  },
  {
    id: 'rigid-magnetic-box',
    code: '',
    dct: ['becf-3020a'],
    name: T('Mıknatıslı kapaklı sert kutu', 'Magnetic closure rigid box'),
    description: T('Taban tepsi + arka duvar / kapak / ön kanat şeridi; ön kanatta mıknatıs yerleri.', 'Base tray plus back wall / lid / front flap strip with magnet positions on the flap.'),
    keywords: ['mıknatıs', 'magnetic', 'kapak', 'sert kutu', 'premium'],
    category: 'boxes-with-hinged-lid',
    materials: HB,
    kind: 'magnetic',
  },
  {
    id: 'rigid-flap-lid-box',
    code: '',
    dct: ['becf-3020b'],
    name: T('Ön kanatlı menteşeli sert kutu', 'Hinged rigid box with front flap'),
    description: T('Arka duvardan menteşeli kapak ve ön kanat; mıknatıssız, kanat öne sarkar.', 'Lid hinged from the back wall with a front flap; no magnets, the flap drapes over the front.'),
    keywords: ['menteşe', 'hinged', 'ön kanat', 'flap', 'sert kutu'],
    category: 'boxes-with-hinged-lid',
    materials: HB,
    kind: 'magnetic',
  },
  {
    id: 'rigid-counter-display',
    code: '',
    dct: ['becf-30702'],
    name: T('Başlıklı tezgâh üstü teşhir tepsisi', 'Counter display tray with header'),
    description: T('Sert tepsi; arka duvar yuvarlak köşeli başlık olarak yükselir. Mukavva + kaplama.', 'Rigid tray whose back wall rises into a rounded header. Board and wrap.'),
    keywords: ['teşhir', 'display', 'tezgâh', 'counter', 'başlık', 'header'],
    category: 'display-materials',
    materials: HB,
    kind: 'display-header',
  },
  {
    id: 'swatch-folder-card',
    code: '',
    dct: ['becf-30602'],
    name: T('Katlanır numune kartı', 'Folding swatch card'),
    description: T('İki panel ve sırt kırımı; köşelerde perçin delikleri. Kumaş / kaplama numune kartı.', 'Two panels with a spine crease; rivet holes in the corners. Fabric / veneer swatch card.'),
    keywords: ['numune', 'swatch', 'kart', 'perçin'],
    category: 'swatch-cards',
    materials: HB,
    kind: 'swatch-folder',
  },
  {
    id: 'swatch-card-flat',
    code: '',
    dct: ['becf-30603'],
    name: T('Düz numune kartı', 'Flat swatch card'),
    description: T('Tek panel, ortada kırım, dört perçin deliği; numune zinciri kartı.', 'Single panel with a centre crease and four rivet holes; swatch chain card.'),
    keywords: ['numune', 'swatch', 'kart', 'perçin'],
    category: 'swatch-cards',
    materials: HB,
    kind: 'swatch-card',
  },
]

export const rigidTemplates: TemplateDefinition[] = RIGID_SPECS.map(rigidTemplate)
