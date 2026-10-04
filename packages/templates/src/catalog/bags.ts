import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline } from '@diecut/core'
import {
  emitProfile,
  foldHorizontal,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  reverseProfile,
  type Profile,
} from '../features.ts'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'
import { addCrossTray, linkTwoPiece } from './cross-tray.ts'

function buildMatchbox(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const fit = num(params, 'fitClearance')
  const glueWidth = num(params, 'glueFlap')
  const bleed = num(params, 'bleed')
  const sW = W + 2 * caliper + fit
  const sH = H + 2 * caliper + fit
  const sL = L + fit
  const gap = 20

  const b = new DielineBuilder(
    'matchbox',
    { name: { tr: 'Kibrit kutusu', en: 'Matchbox' }, caliper, glueFlapSide: glueWidth > 0 ? 'right' : 'none' },
    params,
  )

  const drawer = addCrossTray(b, 'drawer', { x: 0, y: 0 }, L, W, H, caliper, 2, true)
  const ox = drawer.maxX + gap + sH
  const segments = girthLayout([sW, sH, sW, sH], ox)
  const girthEnd = (segments[3] as { x2: number }).x2
  const glueEnd = girthEnd + glueWidth
  const taper = Math.min(3, sL * 0.1)

  const outline = new PathBuilder()
  outline.moveTo({ x: ox, y: 0 })
  outline.lineTo({ x: girthEnd, y: 0 })
  if (glueWidth > 0) {
    const glue = glueFlapProfile(girthEnd, glueEnd, 0, sL, taper)
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: girthEnd, y: sL })
  outline.lineTo({ x: ox, y: sL })
  outline.close()
  b.cut(outline.build(), 'kılıf çevresi')

  const names: [string, { tr: string; en: string }][] = [
    ['sleeve-top', { tr: 'Kılıf üst', en: 'Sleeve top' }],
    ['sleeve-side-a', { tr: 'Kılıf yan', en: 'Sleeve side' }],
    ['sleeve-bottom', { tr: 'Kılıf alt', en: 'Sleeve bottom' }],
    ['sleeve-side-b', { tr: 'Kılıf yan', en: 'Sleeve side' }],
  ]
  segments.forEach((seg, i) => {
    const [id, label] = names[i] as [string, { tr: string; en: string }]
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, sL), role: 'wall' })
  })
  b.fold({ parent: 'sleeve-top', child: 'sleeve-side-a', ...foldVertical((segments[1] as { x1: number }).x1, 0, sL, 'right') })
  b.fold({ parent: 'sleeve-side-a', child: 'sleeve-bottom', ...foldVertical((segments[2] as { x1: number }).x1, 0, sL, 'right') })
  b.fold({ parent: 'sleeve-bottom', child: 'sleeve-side-b', ...foldVertical((segments[3] as { x1: number }).x1, 0, sL, 'right') })
  if (glueWidth > 0) {
    b.panel({
      id: 'sleeve-glue',
      name: 'sleeve-glue',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(girthEnd, glueEnd, 0, sL, taper),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'sleeve-side-b', child: 'sleeve-glue', ...foldVertical(girthEnd, 0, sL, 'right') })
  }
  linkTwoPiece(b, 'drawer-base', 'sleeve-top', { x: drawer.maxX, y: 0 }, { x: drawer.maxX, y: W })

  if (bleed > 0) {
    b.guide('bleed', rectPath(drawer.minX - bleed, Math.min(drawer.minY, 0) - bleed, glueEnd - drawer.minX + 2 * bleed, Math.max(drawer.maxY, sL) - Math.min(drawer.minY, 0) + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const matchbox: TemplateDefinition = {
  id: 'matchbox',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Kibrit kutusu (çekmece + kılıf)', en: 'Matchbox (drawer + sleeve)' },
  description: {
    tr: 'İç tepsi ve üzerine geçen dört panelli kılıf. Mücevher, USB, kart ve küçük hediye.',
    en: 'Inner tray plus a four-panel sleeve — jewellery, USB, cards and small gifts.',
  },
  category: 'special-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['kibrit', 'matchbox', 'çekmece', 'kılıf', 'standart'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Çekmece uzunluğu', en: 'Drawer length' }, unit: 'mm', min: 30, max: 400, step: 1, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Çekmece genişliği', en: 'Drawer width' }, unit: 'mm', min: 20, max: 300, step: 1, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Çekmece yüksekliği', en: 'Drawer height' }, unit: 'mm', min: 8, max: 80, step: 1, default: 18, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 4, step: 0.05, default: 0.4, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Kılıf yapıştırma payı', en: 'Sleeve glue flap' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 12, group: 'construction' },
    { kind: 'number', key: 'fitClearance', label: { tr: 'Kılıf payı', en: 'Sleeve fit' }, unit: 'mm', min: 0, max: 8, step: 0.5, default: 0.8, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildMatchbox,
}

function buildTote(kind: 'tote' | 'sos', params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const bleed = num(params, 'bleed')
  const handles = kind === 'tote' ? bool(params, 'handles') : false
  const gusset = W / 2
  const flap = gusset
  const id = kind === 'tote' ? 'tote-bag' : 'sos-bag'

  const [g1, front, g2, back] = girthLayout([gusset, L, gusset, L]) as [
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
  ]
  const glueX1 = back.x2
  const glueX2 = glueX1 + glueWidth
  const segs = [g1, front, g2, back]

  const b = new DielineBuilder(
    id,
    {
      name: kind === 'tote' ? { tr: 'Karton çanta', en: 'Carton tote' } : { tr: 'SOS çanta', en: 'SOS bag' },
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const flapAt = (seg: { x1: number; x2: number }, y: number, d: 1 | -1): Profile => [
    { p: { x: seg.x1, y } },
    { p: { x: seg.x1 + 2, y: y + d * flap } },
    { p: { x: seg.x2 - 2, y: y + d * flap } },
    { p: { x: seg.x2, y } },
  ]
  const bottomP = segs.map((s) => flapAt(s, 0, -1))
  const topP = segs.map((s) => [
    { p: { x: s.x1, y: H } },
    { p: { x: s.x2, y: H } },
  ] satisfies Profile)

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const p of bottomP) emitProfile(outline, p)
  if (glueWidth > 0) {
    const glue = glueFlapProfile(glueX1, glueX2, 0, H, Math.min(4, H * 0.08))
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: glueX1, y: H })
  for (let i = topP.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(topP[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'çanta çevresi')

  const walls: [string, { x1: number; width: number }, { tr: string; en: string }][] = [
    ['gusset-left', g1, { tr: 'Sol körük', en: 'Left gusset' }],
    ['front', front, { tr: 'Ön', en: 'Front' }],
    ['gusset-right', g2, { tr: 'Sağ körük', en: 'Right gusset' }],
    ['back', back, { tr: 'Arka', en: 'Back' }],
  ]
  for (const [wid, seg, label] of walls) {
    b.panel({ id: wid, name: wid, label, outline: rectPoints(seg.x1, 0, seg.width, H), role: 'wall' })
  }
  b.root('front')
  b.fold({ parent: 'front', child: 'gusset-left', ...foldVertical(front.x1, 0, H, 'left') })
  b.fold({ parent: 'front', child: 'gusset-right', ...foldVertical(front.x2, 0, H, 'right') })
  b.fold({ parent: 'gusset-right', child: 'back', ...foldVertical(g2.x2, 0, H, 'right') })
  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(glueX1, glueX2, 0, H, Math.min(4, H * 0.08)),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'back', child: 'glue', ...foldVertical(glueX1, 0, H, 'right') })
  }

  segs.forEach((seg, i) => {
    const wall = (walls[i] as [string, unknown, unknown])[0]
    const pid = `${wall}-bottom`
    b.panel({
      id: pid,
      name: pid,
      label: { tr: 'Taban kapağı', en: 'Bottom flap' },
      outline: [
        { x: seg.x1, y: 0 },
        { x: seg.x1 + 2, y: -flap },
        { x: seg.x2 - 2, y: -flap },
        { x: seg.x2, y: 0 },
      ],
      role: 'flap',
    })
    b.fold({ parent: wall, child: pid, ...foldHorizontal(0, seg.x1, seg.x2, 'below') })
  })

  if (handles) {
    const slotW = Math.min(28, L * 0.35)
    const y = H - 18
    if (slotW >= 14 && H >= 80) {
      b.cut(stadiumPath({ x: (front.x1 + front.x2) / 2, y }, slotW, 6), 'ön kulp')
      b.cut(stadiumPath({ x: (back.x1 + back.x2) / 2, y }, slotW, 6), 'arka kulp')
    }
  }

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -flap - bleed, glueX2 + 2 * bleed, H + flap + 2 * bleed), 'taşma payı')
  return b.build()
}

const bagParams = (handles: boolean): TemplateDefinition['params'] => [
  { kind: 'number', key: 'length', label: { tr: 'Ağız genişliği', en: 'Face width' }, unit: 'mm', min: 60, max: 500, step: 1, default: 220, group: 'dimensions' },
  { kind: 'number', key: 'width', label: { tr: 'Körük / derinlik', en: 'Gusset / depth' }, unit: 'mm', min: 40, max: 250, step: 1, default: 80, group: 'dimensions' },
  { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 80, max: 600, step: 1, default: 280, group: 'dimensions' },
  { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 4, step: 0.05, default: 0.35, group: 'material' },
  { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 15, group: 'construction' },
  ...(handles
    ? [{ kind: 'boolean' as const, key: 'handles', label: { tr: 'Kulp oyuğu', en: 'Handle holes' }, default: true, group: 'options' }]
    : []),
  { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
]

export const toteBag: TemplateDefinition = {
  id: 'tote-bag',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Karton çanta', en: 'Carton tote bag' },
  description: {
    tr: 'Körüklü düz tabanlı çanta, isteğe bağlı kulp oyuğu. Butik, alışveriş ve hediye.',
    en: 'Gusseted flat-bottom bag with optional handle holes — retail and gift.',
  },
  category: 'carton-bags-pillows',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['çanta', 'bag', 'tote', 'alışveriş', 'kulp', 'körük'],
  params: bagParams(true),
  build: (p) => buildTote('tote', p),
}

export const sosBag: TemplateDefinition = {
  id: 'sos-bag',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'SOS çanta', en: 'SOS bag' },
  description: {
    tr: 'Kendiliğinden açılan körüklü çanta. Fırın, market ve take-away.',
    en: 'Self-opening satchel — bakery, grocery and take-away.',
  },
  category: 'carton-bags-pillows',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['sos', 'çanta', 'fırın', 'market', 'takeaway', 'körük'],
  params: bagParams(false),
  build: (p) => buildTote('sos', p),
}
