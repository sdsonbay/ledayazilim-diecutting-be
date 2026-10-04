import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import {
  autoBottomFlapProfile,
  dustFlapProfile,
  edgeWithThumbNotch,
  emitProfile,
  flatEdge,
  foldDiagonal,
  foldHorizontal,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  profileToPolygon,
  reverseProfile,
  tuckFlapProfile,
  type Profile,
} from '../features.ts'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * ECMA A21.20 — tuck top auto bottom (yapıştırmalı otomatik taban).
 *
 * Üst reverse tuck. Alt kapaklar 45° kesimli; ön ve arka kapaklardaki
 * üçgen dil makinede yan kapağa yapıştırılır, kutu açılınca taban kilitlenir.
 */
function buildAutoBottom(params: Record<string, ParamValue>): Dieline {
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
  const tuckDepth = tuckDepthParam > 0 ? tuckDepthParam : Math.max(6, W - 2 * caliper)
  const dustDepth = Math.max(4, tuckDepth - Math.max(1.5, 2 * caliper))
  const clearance = Math.max(0.5, caliper)
  const bottomDepth = Math.max(10, Math.min(L, W) * 0.5 - caliper)
  const bevel = Math.min(bottomDepth * 0.92, L * 0.4, W * 0.45)

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
    'ecma-a21-20',
    {
      name: { tr: 'Otomatik tabanlı kutu', en: 'Tuck top auto bottom carton' },
      ecma: 'A21.20',
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const tuck = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    tuckFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction, depth: tuckDepth, clearance, cornerRadius })
  const dust = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    dustFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction, depth: dustDepth, chamfer: dustChamfer })

  const topProfiles: Profile[] = [
    tuck(back, H, 1),
    dust(left, H, 1),
    wantNotch ? edgeWithThumbNotch(front.x1, front.x2, H, notchRadius, 1) : flatEdge(front.x1, front.x2, H),
    dust(right, H, 1),
  ]

  const bottomProfiles: Profile[] = [
    autoBottomFlapProfile({ x1: back.x1, x2: back.x2, y: 0, direction: -1, depth: bottomDepth, bevel, bevelSide: 'left' }),
    autoBottomFlapProfile({ x1: left.x1, x2: left.x2, y: 0, direction: -1, depth: bottomDepth, bevel, bevelSide: 'both' }),
    autoBottomFlapProfile({ x1: front.x1, x2: front.x2, y: 0, direction: -1, depth: bottomDepth, bevel, bevelSide: 'right' }),
    autoBottomFlapProfile({ x1: right.x1, x2: right.x2, y: 0, direction: -1, depth: bottomDepth, bevel, bevelSide: 'both' }),
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

  const topFlaps: [string, Profile, string, { tr: string; en: string }, 'flap' | 'dust'][] = [
    ['top-tuck', topProfiles[0] as Profile, 'back', { tr: 'Üst kapak dili', en: 'Top tuck flap' }, 'flap'],
    ['top-dust-left', topProfiles[1] as Profile, 'left', { tr: 'Üst sol toz kapağı', en: 'Top left dust flap' }, 'dust'],
    ['top-dust-right', topProfiles[3] as Profile, 'right', { tr: 'Üst sağ toz kapağı', en: 'Top right dust flap' }, 'dust'],
  ]
  for (const [id, profile, parent, label, role] of topFlaps) {
    b.panel({ id, name: id, label, outline: profileToPolygon(profile), role, printable: role === 'flap' })
    const start = profile[0] as { p: { x: number } }
    const end = profile[profile.length - 1] as { p: { x: number } }
    b.fold({ parent, child: id, ...foldHorizontal(H, start.p.x, end.p.x, 'above') })
  }

  const bottomWalls = [
    ['bottom-back', back, 'back', { tr: 'Alt arka kapak', en: 'Bottom back flap' }],
    ['bottom-left', left, 'left', { tr: 'Alt sol kapak', en: 'Bottom left flap' }],
    ['bottom-front', front, 'front', { tr: 'Alt ön kapak', en: 'Bottom front flap' }],
    ['bottom-right', right, 'right', { tr: 'Alt sağ kapak', en: 'Bottom right flap' }],
  ] as const

  bottomWalls.forEach(([id, seg, parent, label], i) => {
    const profile = bottomProfiles[i] as Profile
    const main: Point[] = profileToPolygon(profile)
    b.panel({ id, name: id, label, outline: main, role: 'bottom', printable: false })
    b.fold({ parent, child: id, ...foldHorizontal(0, seg.x1, seg.x2, 'below') })

    // Ön ve arka kapaklarda yapıştırma üçgeni (crash lock).
    if (id === 'bottom-front' || id === 'bottom-back') {
      const fromLeft = id === 'bottom-front'
      const a: Point = { x: fromLeft ? seg.x1 : seg.x2, y: 0 }
      const c: Point = { x: fromLeft ? seg.x1 + bevel : seg.x2 - bevel, y: -bottomDepth }
      const d: Point = { x: fromLeft ? seg.x1 : seg.x2, y: -bottomDepth }
      const lockId = `${id}-lock`
      b.panel({
        id: lockId,
        name: lockId,
        label: { tr: 'Otomatik taban yapıştırma dili', en: 'Auto bottom glue tab' },
        outline: [a, d, c],
        role: 'glue',
        printable: false,
      })
      const spec = foldDiagonal(a, c, fromLeft ? 180 : -180)
      b.fold({ parent: id, child: lockId, axis: spec.axis, angle: spec.angle })
    }
  })

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
    b.guide('bleed', rectPath(-bleed, -bottomDepth - bleed, flatWidth + 2 * bleed, H + tuckDepth + bottomDepth + 2 * bleed), 'taşma payı')
  }
  if (glueWidth > 0) b.guide('glue', rectPath(glueX1, 0, glueWidth, H), 'yapıştırma alanı')

  return b.build()
}

export const tuckTopAutoBottom: TemplateDefinition = {
  id: 'ecma-a21-20',
  code: 'A21.20',
  standard: 'ECMA',
  name: { tr: 'Otomatik tabanlı kutu (tuck top)', en: 'Tuck top auto bottom box' },
  description: {
    tr: 'Üstü tuck kapak, altı yapıştırmalı otomatik taban. Makinede yapıştırılır, sahada tek hareketle açılır.',
    en: 'Tuck top with a glued crash-lock base that pops open on the packing line.',
  },
  category: 'tuck-top-auto-bottom-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'beta',
  keywords: ['auto bottom', 'ttab', 'crash lock', 'otomatik taban', 'a21.20'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk (a)', en: 'Length (a)' }, unit: 'mm', min: 25, max: 1200, step: 0.5, default: 100, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik / derinlik (b)', en: 'Width / depth (b)' }, unit: 'mm', min: 20, max: 1200, step: 0.5, default: 60, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (c)', en: 'Height (c)' }, unit: 'mm', min: 25, max: 2000, step: 0.5, default: 140, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: 0.45, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 15, group: 'construction' },
    { kind: 'number', key: 'tuckDepth', label: { tr: 'Kapak dili derinliği', en: 'Tuck depth' }, unit: 'mm', min: 0, max: 600, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'dustFlapChamfer', label: { tr: 'Toz kapağı pahı', en: 'Dust flap chamfer' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 3, advanced: true, group: 'construction' },
    { kind: 'number', key: 'tuckCornerRadius', label: { tr: 'Dil köşe yarıçapı', en: 'Tuck corner radius' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 3, advanced: true, group: 'construction' },
    { kind: 'boolean', key: 'thumbNotch', label: { tr: 'Başparmak oyuğu', en: 'Thumb notch' }, default: true, group: 'options' },
    { kind: 'number', key: 'thumbNotchRadius', label: { tr: 'Oyuk yarıçapı', en: 'Notch radius' }, unit: 'mm', min: 3, max: 60, step: 0.5, default: 12, advanced: true, group: 'options' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildAutoBottom,
}
