import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
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
  sealFlapProfile,
  type Profile,
} from '../features.ts'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * ECMA A40.20 — seal end (hububat / iki uç yapıştırma).
 *
 * Toz kapakları içeri, büyük kapaklar üzerine yapıştırılır. Tuck yok;
 * açılış genelde üst kapaktaki oyuk veya yırtma şeridinden yapılır.
 */
function buildSealEnd(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const dustChamfer = num(params, 'dustFlapChamfer')
  const cornerRadius = num(params, 'flapCornerRadius')
  const wantNotch = bool(params, 'thumbNotch')
  const notchRadius = num(params, 'thumbNotchRadius')
  const bleed = num(params, 'bleed')

  const sealParam = num(params, 'sealDepth')
  const sealDepth = sealParam > 0 ? sealParam : Math.max(10, W - caliper)
  const dustDepth = Math.max(6, Math.min(sealDepth * 0.75, W * 0.7))

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
    'ecma-a40-20',
    {
      name: { tr: 'Yapıştırmalı uçlu kutu', en: 'Seal end carton' },
      ecma: 'A40.20',
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const seal = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    sealFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction, depth: sealDepth, cornerRadius })
  const dust = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    dustFlapProfile({ x1: seg.x1, x2: seg.x2, y, direction, depth: dustDepth, chamfer: dustChamfer })

  const topProfiles: Profile[] = [
    seal(back, H, 1),
    dust(left, H, 1),
    wantNotch ? edgeWithThumbNotch(front.x1, front.x2, H, notchRadius, 1) : flatEdge(front.x1, front.x2, H),
    dust(right, H, 1),
  ]
  const bottomProfiles: Profile[] = [
    flatEdge(back.x1, back.x2, 0),
    dust(left, 0, -1),
    seal(front, 0, -1),
    dust(right, 0, -1),
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

  const flaps: [string, Profile, string, { tr: string; en: string }, 'flap' | 'dust'][] = [
    ['top-seal', topProfiles[0] as Profile, 'back', { tr: 'Üst yapıştırma kapağı', en: 'Top seal flap' }, 'flap'],
    ['top-dust-left', topProfiles[1] as Profile, 'left', { tr: 'Üst sol toz kapağı', en: 'Top left dust flap' }, 'dust'],
    ['top-dust-right', topProfiles[3] as Profile, 'right', { tr: 'Üst sağ toz kapağı', en: 'Top right dust flap' }, 'dust'],
    ['bottom-seal', bottomProfiles[2] as Profile, 'front', { tr: 'Alt yapıştırma kapağı', en: 'Bottom seal flap' }, 'flap'],
    ['bottom-dust-left', bottomProfiles[1] as Profile, 'left', { tr: 'Alt sol toz kapağı', en: 'Bottom left dust flap' }, 'dust'],
    ['bottom-dust-right', bottomProfiles[3] as Profile, 'right', { tr: 'Alt sağ toz kapağı', en: 'Bottom right dust flap' }, 'dust'],
  ]
  for (const [id, profile, parent, label, role] of flaps) {
    b.panel({ id, name: id, label, outline: profileToPolygon(profile), role, printable: role === 'flap' })
    const isTop = id.startsWith('top')
    const start = profile[0] as { p: { x: number } }
    const end = profile[profile.length - 1] as { p: { x: number } }
    b.fold({ parent, child: id, ...foldHorizontal(isTop ? H : 0, start.p.x, end.p.x, isTop ? 'above' : 'below') })
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
    b.guide('bleed', rectPath(-bleed, -sealDepth - bleed, flatWidth + 2 * bleed, H + sealDepth + 2 * bleed), 'taşma payı')
  }
  if (glueWidth > 0) b.guide('glue', rectPath(glueX1, 0, glueWidth, H), 'yapıştırma alanı')

  if (sealDepth > W + 2) {
    b.warn(
      'seal-too-deep',
      'info',
      'Yapıştırma kapağı derinlikten uzun; karşı duvarın dışına taşar.',
      'Seal flap is deeper than the box and will overlap the opposite wall.',
    )
  }

  return b.build()
}

export const sealEnd: TemplateDefinition = {
  id: 'ecma-a40-20',
  code: 'A10.10.03.03',
  standard: 'ECMA',
  name: { tr: 'Yapıştırmalı uçlu kutu (seal end)', en: 'Seal end box' },
  description: {
    tr: 'İki uç yapıştırılır; tuck yok. Hububat, toz gıda ve kutu içi dolum hatlarının klasik formu.',
    en: 'Both ends are glued shut — the cereal-box construction for filled cartons.',
  },
  category: 'standard-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['seal end', 'hububat', 'cereal', 'glue end', 'a10.10', 'gıda kutusu'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk (a)', en: 'Length (a)' }, unit: 'mm', min: 20, max: 1200, step: 0.5, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik / derinlik (b)', en: 'Width / depth (b)' }, unit: 'mm', min: 15, max: 1200, step: 0.5, default: 55, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (c)', en: 'Height (c)' }, unit: 'mm', min: 30, max: 2000, step: 0.5, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: 0.45, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 15, group: 'construction' },
    { kind: 'number', key: 'sealDepth', label: { tr: 'Yapıştırma kapağı derinliği', en: 'Seal flap depth' }, unit: 'mm', min: 0, max: 600, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction', help: { tr: '0 bırakılırsa derinlikten kalınlık payı düşülür.', en: 'Leave 0 to derive from depth minus caliper.' } },
    { kind: 'number', key: 'dustFlapChamfer', label: { tr: 'Toz kapağı pahı', en: 'Dust flap chamfer' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 4, advanced: true, group: 'construction' },
    { kind: 'number', key: 'flapCornerRadius', label: { tr: 'Kapak köşe yarıçapı', en: 'Flap corner radius' }, unit: 'mm', min: 0, max: 25, step: 0.5, default: 2, advanced: true, group: 'construction' },
    { kind: 'boolean', key: 'thumbNotch', label: { tr: 'Başparmak oyuğu', en: 'Thumb notch' }, default: true, group: 'options' },
    { kind: 'number', key: 'thumbNotchRadius', label: { tr: 'Oyuk yarıçapı', en: 'Notch radius' }, unit: 'mm', min: 3, max: 60, step: 0.5, default: 14, advanced: true, group: 'options' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildSealEnd,
}
