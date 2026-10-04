import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'
import { addCrossTray } from './cross-tray.ts'

function buildWindowTray(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const winL = num(params, 'windowLength')
  const winW = num(params, 'windowWidth')
  const bleed = num(params, 'bleed')
  const wL = winL > 0 ? winL : L * 0.55
  const wW = winW > 0 ? winW : W * 0.45

  const b = new DielineBuilder(
    'window-tray',
    { name: { tr: 'Pencereli tepsi', en: 'Window tray' }, caliper, glueFlapSide: 'none' },
    params,
  )
  const bounds = addCrossTray(b, '', { x: 0, y: 0 }, L, W, H, caliper, 4, true)
  if (wL >= 12 && wW >= 10) {
    b.cut(stadiumPath({ x: L / 2, y: W / 2 }, wL, wW), 'pencere')
  }
  if (bleed > 0) {
    b.guide(
      'bleed',
      rectPath(bounds.minX - bleed, bounds.minY - bleed, bounds.maxX - bounds.minX + 2 * bleed, bounds.maxY - bounds.minY + 2 * bleed),
      'taşma payı',
    )
  }
  return b.build()
}

export const windowTray: TemplateDefinition = {
  id: 'window-tray',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Pencereli tepsi', en: 'Window tray' },
  description: {
    tr: 'Dört köşe tepsi, tabanda oval pencere. Pastane, hediye ve vitrin ambalajı.',
    en: 'Four-corner tray with an oval window in the base — bakery, gifts and display.',
  },
  category: 'special-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['pencere', 'window', 'tepsi', 'vitrin', 'özel'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 600, step: 1, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 600, step: 1, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Duvar yüksekliği', en: 'Wall height' }, unit: 'mm', min: 15, max: 120, step: 1, default: 35, group: 'dimensions' },
    { kind: 'number', key: 'windowLength', label: { tr: 'Pencere uzunluğu', en: 'Window length' }, unit: 'mm', min: 0, max: 400, step: 1, default: 0, autoWhenZero: true, group: 'options' },
    { kind: 'number', key: 'windowWidth', label: { tr: 'Pencere genişliği', en: 'Window width' }, unit: 'mm', min: 0, max: 400, step: 1, default: 0, autoWhenZero: true, group: 'options' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 4, step: 0.05, default: 0.4, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildWindowTray,
}

function buildEasel(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const H = num(params, 'height')
  const stand = num(params, 'standDepth')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const D = stand > 0 ? stand : Math.max(40, H * 0.35)

  const b = new DielineBuilder(
    'easel-display',
    { name: { tr: 'Şövale display', en: 'Easel display' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: L, y: 0 },
    { x: L, y: H },
    { x: L * 0.65, y: H },
    { x: L * 0.65, y: H + D },
    { x: L * 0.35, y: H + D },
    { x: L * 0.35, y: H },
    { x: 0, y: H },
  ]
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  outline.close()
  b.cut(outline.build(), 'şövale çevresi')

  b.panel({ id: 'face', name: 'face', label: { tr: 'Yüz', en: 'Face' }, outline: rectPoints(0, 0, L, H), role: 'wall' })
  b.root('face')
  b.panel({
    id: 'stand',
    name: 'stand',
    label: { tr: 'Ayak', en: 'Stand' },
    outline: [
      { x: L * 0.35, y: H },
      { x: L * 0.65, y: H },
      { x: L * 0.65, y: H + D },
      { x: L * 0.35, y: H + D },
    ],
    role: 'flap',
  })
  b.fold({ parent: 'face', child: 'stand', ...foldHorizontal(H, L * 0.35, L * 0.65, 'above') })

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, L + 2 * bleed, H + D + 2 * bleed), 'taşma payı')
  return b.build()
}

export const easelDisplay: TemplateDefinition = {
  id: 'easel-display',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Şövale / easel display', en: 'Easel display' },
  description: {
    tr: 'Dik duran kart + arka ayak. Tezgâh kartı, fiyat ve kampanya display’i.',
    en: 'Upright card with a back stand — counter cards and promotions.',
  },
  category: 'display-materials',
  materials: ['hardboard', 'carton'],
  maturity: 'beta',
  keywords: ['easel', 'şövale', 'display', 'tezgâh kartı', 'ayak'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 400, step: 1, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yüz yüksekliği', en: 'Face height' }, unit: 'mm', min: 40, max: 500, step: 1, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'standDepth', label: { tr: 'Ayak derinliği', en: 'Stand depth' }, unit: 'mm', min: 0, max: 200, step: 1, default: 0, autoWhenZero: true, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.3, max: 4, step: 0.05, default: 0.6, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 2, advanced: true, group: 'prepress' },
  ],
  build: buildEasel,
}

function buildPostalTag(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')

  const b = new DielineBuilder(
    'tag-postal',
    { name: { tr: 'Posta kilitli etiket', en: 'Postal lock tag' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const r = 4
  const outline = new PathBuilder()
  outline.moveTo({ x: r, y: 0 })
  outline.lineTo({ x: L - r, y: 0 })
  outline.filletTo({ x: L, y: 0 }, { x: L, y: H }, r)
  outline.lineTo({ x: L, y: H - r })
  outline.filletTo({ x: L, y: H }, { x: 0, y: H }, r)
  outline.lineTo({ x: r, y: H })
  outline.filletTo({ x: 0, y: H }, { x: 0, y: 0 }, r)
  outline.lineTo({ x: 0, y: r })
  outline.filletTo({ x: 0, y: 0 }, { x: L, y: 0 }, r)
  outline.close()
  b.cut(outline.build(), 'etiket çevresi')
  b.panel({ id: 'face', name: 'face', label: { tr: 'Etiket', en: 'Tag' }, outline: rectPoints(0, 0, L, H), role: 'wall' })
  b.root('face')
  const slotW = Math.min(22, L * 0.4)
  if (slotW >= 12 && H >= 40) {
    b.cut(stadiumPath({ x: L / 2, y: H - 12 }, slotW, 4), 'üst kilit')
    b.cut(stadiumPath({ x: L / 2, y: 12 }, slotW, 4), 'alt kilit')
  }
  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, L + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

export const postalTag: TemplateDefinition = {
  id: 'tag-postal',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Posta kilitli etiket', en: 'Postal lock tag' },
  description: {
    tr: 'Üst ve alt stadium kilit oyuğu. DCT postal lock etiketleri.',
    en: 'Top and bottom stadium lock slots — postal lock tags.',
  },
  category: 'tags',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['postal', 'kilit', 'etiket', 'tag', 'askı'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 25, max: 200, step: 0.5, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 40, max: 300, step: 0.5, default: 90, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 3, step: 0.05, default: 0.5, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 2, advanced: true, group: 'prepress' },
  ],
  build: buildPostalTag,
}
