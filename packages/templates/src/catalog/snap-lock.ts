import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline } from '@diecut/core'
import {
  dustFlapProfile,
  edgeWithThumbNotch,
  emitProfile,
  flatEdge,
  foldHorizontal,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  profileToPolygon,
  reverseProfile,
  snapLockMajorProfile,
  snapLockMinorProfile,
  tuckClosure,
  tuckFlapProfile,
  type TuckClosure,
  type Profile,
  autoTongueDepth,
  emitTuckClosure,
} from '../features.ts'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * ECMA A20.80 — tuck top + snap lock / 1-2-3 kilitli taban.
 *
 * Üst kapak reverse tuck; altta tutkalsız kilit. Yan kapaklar önce,
 * yarıkli arka kapak sonra, kancalı ön kapak en son katlanır.
 */
function buildSnapLock(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const dustChamfer = num(params, 'dustFlapChamfer')
  const cornerRadius = num(params, 'tuckCornerRadius')
  const wantNotch = bool(params, 'thumbNotch')
  const notchRadius = num(params, 'thumbNotchRadius')
  const bleed = num(params, 'bleed')

  const tuckDepthParam = num(params, 'tuckDepth')
  // Üst kapanış: kapak (kutu derinliği) + kırımla ayrılan dil (ön duvarın içine girer).
  const lidDepth = W
  const tongueDepth = tuckDepthParam > 0 ? tuckDepthParam : autoTongueDepth(W, H)
  const tuckDepth = lidDepth + tongueDepth
  const dustDepth = Math.max(4, W - 2 * caliper - Math.max(1.5, 2 * caliper))
  const clearance = Math.max(0.5, caliper)
  const minorDepth = Math.max(8, W * 0.38)
  const majorDepth = Math.max(12, W * 0.55)
  const tabWidth = Math.min(16, L * 0.14)
  const tabHeight = Math.min(10, majorDepth * 0.28)
  const tabInset = Math.max(6, L * 0.08)

  const [back, left, front, right] = girthLayout([L, W, L, W]) as [
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
  ]
  const glueX1 = right.x2
  const glueX2 = glueX1 + glueWidth
  const flatWidth = glueWidth > 0 ? glueX2 : glueX1

  const b = new DielineBuilder(
    'ecma-a20-80',
    {
      name: { tr: 'Kilitli tabanlı kutu', en: 'Snap lock bottom carton' },
      ecma: 'A20.80',
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const closures = new Map<Profile, TuckClosure>()
  const tuck = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile => {
    const c = tuckClosure(tuckFlapProfile, { x1: seg.x1, x2: seg.x2, y, direction, depth: tongueDepth, clearance, cornerRadius, lidDepth })
    closures.set(c.outer, c)
    return c.outer
  }
  const dust = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    dustFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction, depth: dustDepth, chamfer: dustChamfer })

  const topProfiles: Profile[] = [
    tuck(back, H, 1),
    dust(left, H, 1),
    wantNotch ? edgeWithThumbNotch(front.x1, front.x2, H, notchRadius, 1) : flatEdge(front.x1, front.x2, H),
    dust(right, H, 1),
  ]

  const bottomProfiles: Profile[] = [
    snapLockMinorProfile({ x1: back.x1, x2: back.x2, y: 0, direction: -1, depth: majorDepth * 0.85, chamfer: majorDepth * 0.35 }),
    snapLockMinorProfile({ x1: left.x1, x2: left.x2, y: 0, direction: -1, depth: minorDepth, chamfer: minorDepth * 0.45 }),
    snapLockMajorProfile({
      x1: front.x1,
      x2: front.x2,
      y: 0,
      direction: -1,
      depth: majorDepth,
      tabWidth,
      tabHeight,
      tabInset,
    }),
    snapLockMinorProfile({ x1: right.x1, x2: right.x2, y: 0, direction: -1, depth: minorDepth, chamfer: minorDepth * 0.45 }),
  ]

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const profile of bottomProfiles) emitProfile(outline, profile)
  if (glueWidth > 0) {
    const glue = glueFlapProfile(glueX1, glueX2, 0, H, Math.min(3, H * 0.1))
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: glueX1, y: H })
  for (let i = topProfiles.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(topProfiles[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'gövde çevresi')

  const walls: [string, { x1: number; width: number }, { tr: string; en: string }][] = [
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
      outline: glueFlapProfile(glueX1, glueX2, 0, H, Math.min(3, H * 0.1)),
      role: 'glue',
      printable: false,
    })
  }

  const flapPanels: [string, Profile, string, { tr: string; en: string }, 'flap' | 'dust' | 'lock'][] = [
    ['top-tuck', topProfiles[0] as Profile, 'back', { tr: 'Üst kapak dili', en: 'Top tuck flap' }, 'flap'],
    ['top-dust-left', topProfiles[1] as Profile, 'left', { tr: 'Üst sol toz kapağı', en: 'Top left dust flap' }, 'dust'],
    ['top-dust-right', topProfiles[3] as Profile, 'right', { tr: 'Üst sağ toz kapağı', en: 'Top right dust flap' }, 'dust'],
    ['bottom-back', bottomProfiles[0] as Profile, 'back', { tr: 'Alt arka kilit kapağı', en: 'Bottom back lock flap' }, 'lock'],
    ['bottom-left', bottomProfiles[1] as Profile, 'left', { tr: 'Alt sol kilit kapağı', en: 'Bottom left lock flap' }, 'lock'],
    ['bottom-front', bottomProfiles[2] as Profile, 'front', { tr: 'Alt ön kilit kapağı', en: 'Bottom front lock flap' }, 'lock'],
    ['bottom-right', bottomProfiles[3] as Profile, 'right', { tr: 'Alt sağ kilit kapağı', en: 'Bottom right lock flap' }, 'lock'],
  ]

  for (const [id, profile, parent, label, role] of flapPanels) {
    const closure = closures.get(profile)
    if (closure) {
      emitTuckClosure(b, closure, { id, parent, label })
      continue
    }
    b.panel({ id, name: id, label, outline: profileToPolygon(profile), role, printable: role === 'flap' })
    const isTop = id.startsWith('top')
    const start = profile[0] as { p: { x: number } }
    const end = profile[profile.length - 1] as { p: { x: number } }
    const spec = foldHorizontal(isTop ? H : 0, start.p.x, end.p.x, isTop ? 'above' : 'below')
    b.fold({ parent, child: id, axis: spec.axis, angle: spec.angle })
  }

  const slotW = Math.min(tabWidth + 4, back.width * 0.2)
  const slotH = Math.max(3, caliper * 2)
  const slotY = -majorDepth * 0.45
  const slotInset = tabInset + tabWidth / 2
  if (back.width > slotInset * 2 + slotW * 2) {
    b.cut(stadiumPath({ x: back.x1 + slotInset, y: slotY }, slotW, slotH), 'sol kilit yarığı')
    b.cut(stadiumPath({ x: back.x2 - slotInset, y: slotY }, slotW, slotH), 'sağ kilit yarığı')
  }

  const bodyFolds: [string, string, number, 'left' | 'right'][] = [
    ['front', 'left', front.x1, 'left'],
    ['left', 'back', left.x1, 'left'],
    ['front', 'right', front.x2, 'right'],
  ]
  if (glueWidth > 0) bodyFolds.push(['right', 'glue', right.x2, 'right'])
  for (const [parent, child, x, side] of bodyFolds) {
    b.fold({ parent, child, ...foldVertical(x, 0, H, side) })
  }

  if (bleed > 0) {
    b.guide('bleed', rectPath(-bleed, -majorDepth - bleed, flatWidth + 2 * bleed, H + tuckDepth + majorDepth + 2 * bleed), 'taşma payı')
  }
  if (glueWidth > 0) b.guide('glue', rectPath(glueX1, 0, glueWidth, H), 'yapıştırma alanı')

  if (majorDepth > W) {
    b.warn(
      'lock-too-deep',
      'warning',
      'Kilit kapağı kutu derinliğinden uzun; kapanırken karşı duvara çarpar.',
      'Lock flap is deeper than the box; it will hit the opposite wall.',
    )
  }

  return b.build()
}

export const snapLockBottom: TemplateDefinition = {
  id: 'ecma-a20-80',
  code: 'A20.80',
  standard: 'ECMA',
  name: { tr: 'Kilitli tabanlı kutu (snap lock)', en: 'Snap lock bottom box' },
  description: {
    tr: 'Üstü tuck kapak, altı tutkalsız 1-2-3 kilit. Eczane, e-ticaret ve elde kurulan kısa seriler için.',
    en: 'Tuck top with a glueless 1-2-3 snap lock bottom — pharmacy, e-commerce and short-run packing.',
  },
  category: 'snap-lock-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'beta',
  keywords: ['snap lock', 'crash lock', '1-2-3', 'kilitli taban', 'a20.80', 'eczane'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk (a)', en: 'Length (a)' }, unit: 'mm', min: 20, max: 1200, step: 0.5, default: 100, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik / derinlik (b)', en: 'Width / depth (b)' }, unit: 'mm', min: 15, max: 1200, step: 0.5, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (c)', en: 'Height (c)' }, unit: 'mm', min: 20, max: 2000, step: 0.5, default: 150, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: 0.4, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 15, group: 'construction' },
    { kind: 'number', key: 'tuckDepth', label: { tr: 'Kapak dili derinliği', en: 'Tuck depth' }, unit: 'mm', min: 0, max: 600, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'dustFlapChamfer', label: { tr: 'Toz kapağı pahı', en: 'Dust flap chamfer' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 3, advanced: true, group: 'construction' },
    { kind: 'number', key: 'tuckCornerRadius', label: { tr: 'Dil köşe yarıçapı', en: 'Tuck corner radius' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 3, advanced: true, group: 'construction' },
    { kind: 'boolean', key: 'thumbNotch', label: { tr: 'Başparmak oyuğu', en: 'Thumb notch' }, default: true, group: 'options' },
    { kind: 'number', key: 'thumbNotchRadius', label: { tr: 'Oyuk yarıçapı', en: 'Notch radius' }, unit: 'mm', min: 3, max: 60, step: 0.5, default: 12, advanced: true, group: 'options' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildSnapLock,
}
