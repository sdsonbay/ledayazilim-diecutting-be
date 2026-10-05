import { PathBuilder, distance, flattenPath, type DielineBuilder, type Point } from '@diecut/core'

/**
 * Kutu template'lerinin ortak geometri sözlüğü.
 *
 * Bir "profil", bir kırım hattı üzerindeki iki çapa noktası arasında
 * dolaşan köşe listesidir (ör. bir tuck dili, bir toz kapağı). Profiller
 * soldan sağa tanımlanır; çevre yolunu çizerken üst kenarda ters yönde
 * dolaşıldığı için `reverseProfile` ile çevrilirler.
 */
export interface Corner {
  p: Point
  /** Köşe yuvarlama yarıçapı (mm). */
  r?: number
  /** Bu noktaya bir önceki noktadan yayla gelinsin. */
  arc?: { radius: number; ccw: boolean }
}

export type Profile = Corner[]

export function reverseProfile(profile: Profile): Profile {
  const out: Profile = []
  for (let i = profile.length - 1; i >= 0; i--) {
    const current = profile[i] as Corner
    const incoming = profile[i + 1]?.arc
    out.push({
      p: current.p,
      ...(current.r !== undefined ? { r: current.r } : {}),
      ...(incoming ? { arc: { radius: incoming.radius, ccw: !incoming.ccw } } : {}),
    })
  }
  return out
}

/**
 * Profili yol kurucuya işler. İmlecin profilin ilk noktasında olduğu
 * varsayılır; `moveFirst` ile oraya taşınabilir.
 */
export function emitProfile(builder: PathBuilder, profile: Profile, moveFirst = false): void {
  const first = profile[0]
  if (!first) return
  if (moveFirst) builder.moveTo(first.p)

  for (let i = 1; i < profile.length; i++) {
    const corner = profile[i] as Corner
    const next = profile[i + 1]
    if (corner.arc) {
      builder.arcTo(corner.p, corner.arc.radius, corner.arc.ccw)
    } else if (corner.r && next) {
      builder.filletTo(corner.p, next.p, corner.r)
    } else {
      builder.lineTo(corner.p)
    }
  }
}

/**
 * Alt ve üst kenar profillerinden 3D panel poligonu.
 * Bıçak izindeki kavis / V, katlama mesh’ine de aynı şekilde geçer.
 */
export function panelFromEdges(bottom: Profile, top: Profile, tolerance = 0.12): Point[] {
  const topRev = reverseProfile(top)
  const start = bottom[0]?.p
  const topRight = topRev[0]?.p
  if (!start || !topRight) return []
  const path = new PathBuilder()
  emitProfile(path, bottom, true)
  if (distance(path.current, topRight) > 1e-4) path.lineTo(topRight)
  emitProfile(path, topRev)
  path.close()
  const chain = flattenPath(path.build(), tolerance)[0] ?? []
  if (chain.length >= 2) {
    const a = chain[0]
    const z = chain[chain.length - 1]
    if (a && z && distance(a, z) < 0.45) chain.pop()
  }
  return chain
}

export const profileToPolygon = (profile: Profile): Point[] => profile.map((c) => c.p)

/** Düz kenar — kapak olmayan panel uçları. */
export function flatEdge(x1: number, x2: number, y: number): Profile {
  return [{ p: { x: x1, y } }, { p: { x: x2, y } }]
}

/**
 * Düz kenarın ortasına yarım daire başparmak oyuğu açar.
 *
 * `direction = 1` oyuğu aşağı (−y), `-1` yukarı (+y) doğru açar. Oyuk daima
 * panelin gövdesine doğru bakmalı: üst kenarda 1, alt kenarda -1.
 */
export function edgeWithThumbNotch(x1: number, x2: number, y: number, radius: number, direction: 1 | -1): Profile {
  const cx = (x1 + x2) / 2
  if (radius <= 0 || radius * 2 >= x2 - x1) return flatEdge(x1, x2, y)
  const ccw = direction === 1
  return [
    { p: { x: x1, y } },
    { p: { x: cx - radius, y } },
    { p: { x: cx + radius, y }, arc: { radius, ccw } },
    { p: { x: x2, y } },
  ]
}

export interface TuckFlapOptions {
  x1: number
  x2: number
  /** Kırım hattının y değeri. */
  y: number
  /** +1 üst kapak, -1 alt kapak. */
  direction: 1 | -1
  depth: number
  /** Dilin yanlardan içeri kaçırılması — kutunun içine rahat girmesi için. */
  clearance: number
  cornerRadius: number
}

/**
 * Tuck dili: tabanda tam panel genişliğinde başlar, omuzlardan içeri
 * daralır ve uçta yuvarlatılmış köşelerle biter. (Açılı dil.)
 */
export function tuckFlapProfile(o: TuckFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, clearance, cornerRadius } = o
  const shoulder = Math.min(3, depth * 0.3)
  const innerLeft = x1 + clearance
  const innerRight = x2 - clearance
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: innerLeft, y: y + d * shoulder } },
    { p: { x: innerLeft, y: tip }, r: cornerRadius },
    { p: { x: innerRight, y: tip }, r: cornerRadius },
    { p: { x: innerRight, y: y + d * shoulder } },
    { p: { x: x2, y } },
  ]
}

/** Neredeyse dikdörtgen dil — omuz açısı yok, yalnızca hafif kaçırma. */
export function uniTuckProfile(o: TuckFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, clearance, cornerRadius } = o
  const inset = Math.min(Math.max(0.4, clearance * 0.45), 1.6)
  const rise = Math.min(2, depth * 0.08)
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: x1 + inset, y: y + d * rise } },
    { p: { x: x1 + inset, y: tip }, r: cornerRadius },
    { p: { x: x2 - inset, y: tip }, r: cornerRadius },
    { p: { x: x2 - inset, y: y + d * rise } },
    { p: { x: x2, y } },
  ]
}

/** Sürtünmeli giriş dili: daha geniş omuz, daha fazla yan boşluk. */
export function frictionTuckProfile(o: TuckFlapOptions): Profile {
  return tuckFlapProfile({
    ...o,
    clearance: o.clearance * 1.85,
    cornerRadius: Math.max(o.cornerRadius, 4),
  })
}

/**
 * Dilli kilit (sit lock): boyunda daralma, sonra kilit kulağı.
 * Kulaklar panel genişliğini aşmaz; yan toz kapaklarıyla 2D’de çakışmaz.
 */
export function sitLockTuckProfile(o: TuckFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, clearance, cornerRadius } = o
  const w = x2 - x1
  const neckInset = Math.max(clearance, Math.min(5.5, w * 0.09))
  const earInset = Math.max(0.5, clearance * 0.2)
  const neckH = Math.min(7.5, depth * 0.22)
  const earH = Math.min(5.5, depth * 0.15)
  const after = Math.min(2.8, depth * 0.07)
  const neck = y + d * neckH
  const earTip = y + d * (neckH + earH)
  const afterEar = y + d * (neckH + earH + after)
  const tip = y + d * depth
  const nl = x1 + neckInset
  const nr = x2 - neckInset
  const el = x1 + earInset
  const er = x2 - earInset
  const il = x1 + clearance
  const ir = x2 - clearance
  return [
    { p: { x: x1, y } },
    { p: { x: nl, y: neck } },
    { p: { x: el, y: neck } },
    { p: { x: el, y: earTip } },
    { p: { x: il, y: afterEar } },
    { p: { x: il, y: tip }, r: cornerRadius },
    { p: { x: ir, y: tip }, r: cornerRadius },
    { p: { x: ir, y: afterEar } },
    { p: { x: er, y: earTip } },
    { p: { x: er, y: neck } },
    { p: { x: nr, y: neck } },
    { p: { x: x2, y } },
  ]
}

export type TuckFlapStyle = 'angled' | 'uni' | 'friction'

export function tuckByStyle(style: string, o: TuckFlapOptions, sitLock: boolean): Profile {
  if (sitLock) {
    // Kilit kulakları her biçimde var; sürtünmeli dilde gövde daha dar ve köşeler daha yuvarlak.
    if (style === 'friction') return sitLockTuckProfile({ ...o, clearance: o.clearance * 1.85, cornerRadius: Math.max(o.cornerRadius, 4) })
    return sitLockTuckProfile(o)
  }
  if (style === 'uni') return uniTuckProfile(o)
  if (style === 'friction') return frictionTuckProfile(o)
  return tuckFlapProfile(o)
}

/**
 * Tuck kapanışı: kutunun derinliği kadar kapak paneli + kırımla ayrılan dil.
 * Kapak kutunun ağzını örter, dil karşı duvarın İÇİNE girer. (Dil ile kapak tek panel
 * olursa ortada kırım olmadığı için dil kutunun dışında kalır.)
 */
export interface TuckClosure {
  /** Çevre için profil: kapağın yanları + dil. */
  outer: Profile
  lid: Point[]
  tongue: Profile
  /** Kapak–dil kırımının y değeri. */
  lidEdgeY: number
  x1: number
  x2: number
  y: number
  direction: 1 | -1
}

export function tuckClosure(tongueOf: (o: TuckFlapOptions) => Profile, o: TuckFlapOptions & { lidDepth: number }): TuckClosure {
  const lidEdgeY = o.y + o.direction * o.lidDepth
  const tongue = tongueOf({ ...o, y: lidEdgeY })
  return {
    outer: [{ p: { x: o.x1, y: o.y } }, ...tongue, { p: { x: o.x2, y: o.y } }],
    lid: [
      { x: o.x1, y: o.y },
      { x: o.x2, y: o.y },
      { x: o.x2, y: lidEdgeY },
      { x: o.x1, y: lidEdgeY },
    ],
    tongue,
    lidEdgeY,
    x1: o.x1,
    x2: o.x2,
    y: o.y,
    direction: o.direction,
  }
}

/** Otomatik dil derinliği: derinliğin ~%35'i, 8–25 mm, gövde yüksekliğinin yarısını aşmaz. */
export const autoTongueDepth = (depth: number, height: number): number => Math.max(8, Math.min(25, depth * 0.35, height * 0.5))

/** Kapak + dil panellerini ve iki kırımı (gövde→kapak, kapak→dil) ekler. Dil kimliği `${id}-tongue`. */
export function emitTuckClosure(
  b: DielineBuilder,
  c: TuckClosure,
  o: { id: string; parent: string; label: { tr: string; en: string }; role?: 'flap' | 'lid' },
): void {
  const side = c.direction === 1 ? 'above' : 'below'
  b.panel({ id: o.id, name: o.id, label: o.label, outline: c.lid, role: o.role ?? 'flap', printable: true })
  b.fold({ parent: o.parent, child: o.id, ...foldHorizontal(c.y, c.x1, c.x2, side) })
  const tongueId = `${o.id}-tongue`
  b.panel({
    id: tongueId,
    name: tongueId,
    label: { tr: `${o.label.tr} — dil`, en: `${o.label.en} — tongue` },
    outline: profileToPolygon(c.tongue),
    role: 'lock',
    printable: true,
  })
  b.fold({ parent: o.id, child: tongueId, ...foldHorizontal(c.lidEdgeY, c.x1, c.x2, side) })
}

export interface DustFlapOptions {
  x1: number
  x2: number
  y: number
  direction: 1 | -1
  depth: number
  chamfer: number
}

/**
 * Toz kapağı: uçtaki iki köşesi 45° pahlanır, böylece kutu kapanırken
 * tuck diline takılmaz. (Normal kanat.)
 */
export function dustFlapProfile(o: DustFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, chamfer } = o
  const c = Math.min(chamfer, depth * 0.6, (x2 - x1) * 0.4)
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: x1, y: tip - d * c } },
    { p: { x: x1 + c, y: tip } },
    { p: { x: x2 - c, y: tip } },
    { p: { x: x2, y: tip - d * c } },
    { p: { x: x2, y } },
  ]
}

/** Tam açılı yan kanat: menteşeden uca tek pah. */
export function angledDustFlapProfile(o: DustFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, chamfer } = o
  const c = Math.min(chamfer > 0 ? Math.max(chamfer, depth * 0.55) : depth * 0.85, depth * 0.95, (x2 - x1) * 0.45)
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: x1 + c, y: tip } },
    { p: { x: x2 - c, y: tip } },
    { p: { x: x2, y } },
  ]
}

/** Ucu yuvarlatılmış yan kanat. */
export function roundedDustFlapProfile(o: DustFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth } = o
  const r = Math.min(depth * 0.5, (x2 - x1) * 0.22, 8)
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: x1, y: tip }, r },
    { p: { x: x2, y: tip }, r },
    { p: { x: x2, y } },
  ]
}

export type DustFlapStyle = 'normal' | 'angled' | 'rounded' | 'slit'

export function dustByStyle(style: string, o: DustFlapOptions): Profile {
  if (style === 'angled') return angledDustFlapProfile(o)
  if (style === 'rounded') return roundedDustFlapProfile(o)
  return dustFlapProfile(o)
}

export interface FoldSpec {
  axis: [Point, Point]
  angle: number
}

/**
 * Dikey kırım. Eksen daima +y yönünde tanımlanır; işaret, çocuk panelin
 * hangi tarafta olduğuna göre belirlenir. Böylece 3D'de tüm katlamalar
 * aynı yöne (baskılı yüz dışarıda kalacak şekilde) döner.
 */
export function foldVertical(x: number, yFrom: number, yTo: number, childSide: 'left' | 'right', degrees = 90): FoldSpec {
  return {
    axis: [
      { x, y: Math.min(yFrom, yTo) },
      { x, y: Math.max(yFrom, yTo) },
    ],
    angle: childSide === 'right' ? degrees : -degrees,
  }
}

/** Yatay kırım. Eksen daima +x yönünde tanımlanır. */
export function foldHorizontal(y: number, xFrom: number, xTo: number, childSide: 'above' | 'below', degrees = 90): FoldSpec {
  return {
    axis: [
      { x: Math.min(xFrom, xTo), y },
      { x: Math.max(xFrom, xTo), y },
    ],
    angle: childSide === 'above' ? -degrees : degrees,
  }
}

/** Eğik (45° gibi) kırım — otomatik taban körüklerinde kullanılır. */
export function foldDiagonal(a: Point, b: Point, degrees: number): FoldSpec {
  return { axis: [a, b], angle: degrees }
}

/** Sıralı panel genişliklerinden x sınırlarını üretir. */
export function girthLayout(widths: readonly number[], startX = 0): { x1: number; x2: number; width: number }[] {
  const out: { x1: number; x2: number; width: number }[] = []
  let x = startX
  for (const w of widths) {
    out.push({ x1: x, x2: x + w, width: w })
    x += w
  }
  return out
}

/**
 * Yapıştırma payı: iki ucu pahlanmış yamuk. Pah, kutu yapıştırılırken
 * payın dışarı taşmasını ve makinede takılmasını önler.
 */
/**
 * Panel kenarına doğru içbükey yay. Yastık kutu uçlarında kullanılır.
 * `direction = 1` üst kenar (yay panele doğru, −y), `-1` alt kenar (+y).
 */
export function bowedEdge(x1: number, x2: number, y: number, direction: 1 | -1, bulge: number): Profile {
  const chord = Math.abs(x2 - x1)
  const s = Math.min(Math.max(0, bulge), chord * 0.42)
  if (s < 0.4) return flatEdge(x1, x2, y)
  const r = (chord * chord) / (8 * s) + s / 2
  return [
    { p: { x: x1, y } },
    { p: { x: x2, y }, arc: { radius: r, ccw: direction === 1 } },
  ]
}

export function glueFlapProfile(xInner: number, xOuter: number, yBottom: number, yTop: number, taper: number): Point[] {
  const t = Math.min(taper, (yTop - yBottom) * 0.3)
  return [
    { x: xInner, y: yBottom },
    { x: xOuter, y: yBottom + t },
    { x: xOuter, y: yTop - t },
    { x: xInner, y: yTop },
  ]
}

export interface HangTabOptions {
  x1: number
  x2: number
  y: number
  direction: 1 | -1
  height: number
  /** Askı ile komşu toz kapağı arasındaki yarık — çift bıçağı önler. */
  gap: number
  cornerRadius?: number
}

/** Askı kulağı: panelin üstünden yükselen, yanlardan yarıklı dikdörtgen. */
export function hangTabProfile(o: HangTabOptions): Profile {
  const { x1, x2, y, direction: d, height, gap, cornerRadius = 2 } = o
  const inset = Math.min(gap, (x2 - x1) * 0.2)
  const tip = y + d * height
  return [
    { p: { x: x1, y } },
    { p: { x: x1 + inset, y } },
    { p: { x: x1 + inset, y: tip }, r: cornerRadius },
    { p: { x: x2 - inset, y: tip }, r: cornerRadius },
    { p: { x: x2 - inset, y } },
    { p: { x: x2, y } },
  ]
}

export interface SnapLockMinorOptions {
  x1: number
  x2: number
  y: number
  direction: 1 | -1
  depth: number
  chamfer: number
}

/** Snap lock yan kapağı: uçları 45° kesilmiş kısa dil. */
export function snapLockMinorProfile(o: SnapLockMinorOptions): Profile {
  const { x1, x2, y, direction: d, depth, chamfer } = o
  const c = Math.min(chamfer, depth * 0.85, (x2 - x1) * 0.4)
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: x1 + c, y: tip } },
    { p: { x: x2 - c, y: tip } },
    { p: { x: x2, y } },
  ]
}

export interface SnapLockMajorOptions {
  x1: number
  x2: number
  y: number
  direction: 1 | -1
  depth: number
  /** Kilit kancasının genişliği. */
  tabWidth: number
  tabHeight: number
  /** Kancanın yanlardan içeri kaçırılması. */
  tabInset: number
}

/**
 * Snap lock ana kapağı: uçta iki kanca. 1-2-3 kilitte son katlanan dil;
 * kancalar karşı kapağın yarığına girer.
 */
export function snapLockMajorProfile(o: SnapLockMajorOptions): Profile {
  const { x1, x2, y, direction: d, depth, tabWidth, tabHeight, tabInset } = o
  const width = x2 - x1
  const inset = Math.min(tabInset, width * 0.2)
  const tw = Math.min(tabWidth, (width - 2 * inset) * 0.35)
  const th = Math.min(tabHeight, depth * 0.35)
  const body = depth - th
  const tip = y + d * depth
  const neck = y + d * body
  return [
    { p: { x: x1, y } },
    { p: { x: x1, y: neck } },
    { p: { x: x1 + inset, y: neck } },
    { p: { x: x1 + inset, y: tip } },
    { p: { x: x1 + inset + tw, y: tip } },
    { p: { x: x1 + inset + tw, y: neck } },
    { p: { x: x2 - inset - tw, y: neck } },
    { p: { x: x2 - inset - tw, y: tip } },
    { p: { x: x2 - inset, y: tip } },
    { p: { x: x2 - inset, y: neck } },
    { p: { x: x2, y: neck } },
    { p: { x: x2, y } },
  ]
}

export interface AutoBottomFlapOptions {
  x1: number
  x2: number
  y: number
  direction: 1 | -1
  depth: number
  /** 45° kesimin boyu; komşu kapakla V boşluğu açar. */
  bevel: number
  /** 'left' = sol 45°, 'right' = sağ 45°, 'both' = iki yan (orta kapaklar). */
  bevelSide: 'left' | 'right' | 'both'
}

/**
 * Otomatik taban kapağı. Komşu kapaklarla çarpışmasın diye uçlar 45° kesilir;
 * diyagonal kırım ayrı panel olarak eklenir.
 */
export function autoBottomFlapProfile(o: AutoBottomFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, bevelSide } = o
  const bevel = Math.min(o.bevel, depth * 0.95, (x2 - x1) * 0.45)
  const tip = y + d * depth
  const leftBevel = bevelSide === 'left' || bevelSide === 'both'
  const rightBevel = bevelSide === 'right' || bevelSide === 'both'
  const pts: Profile = [{ p: { x: x1, y } }]
  if (leftBevel) pts.push({ p: { x: x1 + bevel, y: tip } })
  else pts.push({ p: { x: x1, y: tip } })
  if (rightBevel) pts.push({ p: { x: x2 - bevel, y: tip } })
  else pts.push({ p: { x: x2, y: tip } })
  pts.push({ p: { x: x2, y } })
  return pts
}

export interface SealFlapOptions {
  x1: number
  x2: number
  y: number
  direction: 1 | -1
  depth: number
  cornerRadius: number
}

/** Yapıştırmalı uç kapağı (hububat / seal end) — neredeyse tam dikdörtgen. */
export function sealFlapProfile(o: SealFlapOptions): Profile {
  const { x1, x2, y, direction: d, depth, cornerRadius } = o
  const inset = Math.min(1.5, (x2 - x1) * 0.02)
  const tip = y + d * depth
  return [
    { p: { x: x1, y } },
    { p: { x: x1 + inset, y: tip }, r: cornerRadius },
    { p: { x: x2 - inset, y: tip }, r: cornerRadius },
    { p: { x: x2, y } },
  ]
}
