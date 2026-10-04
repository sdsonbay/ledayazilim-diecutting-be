import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import {
  dustFlapProfile,
  emitProfile,
  foldHorizontal,
  foldVertical,
  girthLayout,
  profileToPolygon,
  reverseProfile,
  tuckFlapProfile,
  type Profile,
} from '../features.ts'
import { num, str, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * FEFCO 0210 — roll end tuck top (RETT).
 * Alt kapaklar yarık (RSC), üstte tuck + toz.
 */
function buildRollEnd(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const basis = str(params, 'dimensionBasis')
  const jointWidth = num(params, 'jointFlap')
  const bleed = num(params, 'bleed')
  const inside = basis === 'inside'
  const panelL = inside ? L + caliper : L
  const panelW = inside ? W + caliper : W
  const bodyHeight = inside ? H + caliper : H
  const minorDepth = Math.max(5, panelW / 2)
  const tuckDepth = Math.max(12, panelW * 0.55)
  const dustDepth = Math.max(8, tuckDepth - 4)
  const slot = caliper
  const slotRadius = Math.min(slot / 2, 2)

  const segments = girthLayout([panelL, panelW, panelL, panelW])
  const girthEnd = (segments[3] as { x2: number }).x2
  const jointEnd = girthEnd + jointWidth
  const jointChamfer = Math.min(4, bodyHeight * 0.1)

  const b = new DielineBuilder(
    'fefco-0210',
    { name: { tr: 'Tuck kapaklı koli', en: 'Roll end tuck top' }, fefco: '0210', caliper, glueFlapSide: jointWidth > 0 ? 'right' : 'none' },
    params,
  )

  const slotted = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1, depth: number): Profile => {
    const inner1 = seg.x1 + slot / 2
    const inner2 = seg.x2 - slot / 2
    const tip = y + direction * depth
    return [
      { p: { x: seg.x1, y } },
      { p: { x: inner1, y }, r: slotRadius },
      { p: { x: inner1, y: tip } },
      { p: { x: inner2, y: tip } },
      { p: { x: inner2, y }, r: slotRadius },
      { p: { x: seg.x2, y } },
    ]
  }

  const topProfiles = segments.map((s, i) =>
    i % 2 === 0
      ? tuckFlapProfile({ x1: s.x1, x2: s.x2, y: bodyHeight, direction: 1, depth: tuckDepth, clearance: caliper, cornerRadius: 3 })
      : dustFlapProfile({ x1: s.x1, x2: s.x2, y: bodyHeight, direction: 1, depth: dustDepth, chamfer: 4 }),
  )
  const bottomProfiles = segments.map((s) => slotted(s, 0, -1, minorDepth))

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const profile of bottomProfiles) emitProfile(outline, profile)
  if (jointWidth > 0) {
    outline.lineTo({ x: jointEnd, y: jointChamfer })
    outline.lineTo({ x: jointEnd, y: bodyHeight - jointChamfer })
  }
  outline.lineTo({ x: girthEnd, y: bodyHeight })
  for (let i = topProfiles.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(topProfiles[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'gövde çevresi')

  const wallNames: [string, { tr: string; en: string }][] = [
    ['front', { tr: 'Ön', en: 'Front' }],
    ['right', { tr: 'Sağ', en: 'Right' }],
    ['back', { tr: 'Arka', en: 'Back' }],
    ['left', { tr: 'Sol', en: 'Left' }],
  ]
  segments.forEach((seg, i) => {
    const [id, label] = wallNames[i] as [string, { tr: string; en: string }]
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, bodyHeight), role: 'wall' })
  })
  b.root('front')
  if (jointWidth > 0) {
    b.panel({
      id: 'joint',
      name: 'joint',
      label: { tr: 'Birleşim payı', en: "Manufacturer's joint" },
      outline: [
        { x: girthEnd, y: 0 },
        { x: jointEnd, y: jointChamfer },
        { x: jointEnd, y: bodyHeight - jointChamfer },
        { x: girthEnd, y: bodyHeight },
      ],
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'left', child: 'joint', ...foldVertical(girthEnd, 0, bodyHeight, 'right') })
  }

  segments.forEach((seg, i) => {
    const wall = (wallNames[i] as [string, unknown])[0]
    b.panel({
      id: `top-${wall}`,
      name: `top-${wall}`,
      label: { tr: i % 2 === 0 ? 'Tuck kapak' : 'Toz kapağı', en: i % 2 === 0 ? 'Tuck flap' : 'Dust flap' },
      outline: profileToPolygon(topProfiles[i] as Profile),
      role: 'flap',
    })
    b.fold({ parent: wall, child: `top-${wall}`, ...foldHorizontal(bodyHeight, seg.x1, seg.x2, 'above') })
    b.panel({
      id: `bottom-${wall}`,
      name: `bottom-${wall}`,
      label: { tr: 'Alt kapak', en: 'Bottom flap' },
      outline: profileToPolygon(bottomProfiles[i] as Profile),
      role: 'flap',
    })
    b.fold({ parent: wall, child: `bottom-${wall}`, ...foldHorizontal(0, seg.x1, seg.x2, 'below') })
  })

  const bodyFolds: [string, string, number][] = [
    ['front', 'right', (segments[1] as { x1: number }).x1],
    ['right', 'back', (segments[2] as { x1: number }).x1],
    ['back', 'left', (segments[3] as { x1: number }).x1],
  ]
  for (const [parent, child, x] of bodyFolds) {
    b.fold({ parent, child, ...foldVertical(x, 0, bodyHeight, 'right') })
  }

  if (bleed > 0) {
    b.guide('bleed', rectPath(-bleed, -minorDepth - bleed, jointEnd + 2 * bleed, bodyHeight + tuckDepth + minorDepth + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const rollEndTuckTop: TemplateDefinition = {
  id: 'fefco-0210',
  code: '0210',
  standard: 'FEFCO',
  name: { tr: 'Tuck kapaklı koli (0210)', en: 'Roll end tuck top (0210)' },
  description: {
    tr: 'Altı yarık kapak, üstü tuck. E-ticaret ve perakende oluklu — tutkalsız kapanır.',
    en: 'Slotted bottom, tuck top — retail corrugated that closes without tape on the lid.',
  },
  category: 'tuck-end-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['0210', 'rett', 'tuck', 'koli', 'e-ticaret', 'oluklu'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 250, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 800, step: 1, default: 150, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 40, max: 800, step: 1, default: 180, group: 'dimensions' },
    {
      kind: 'enum',
      key: 'dimensionBasis',
      label: { tr: 'Ölçü esası', en: 'Dimension basis' },
      default: 'inside',
      group: 'dimensions',
      options: [
        { value: 'inside', label: { tr: 'İç ölçü', en: 'Inside' } },
        { value: 'outside', label: { tr: 'Dış ölçü', en: 'Outside' } },
      ],
    },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.5, max: 12, step: 0.1, default: 3, group: 'material' },
    { kind: 'number', key: 'jointFlap', label: { tr: 'Birleşim payı', en: "Manufacturer's joint" }, unit: 'mm', min: 0, max: 80, step: 1, default: 35, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildRollEnd,
}
