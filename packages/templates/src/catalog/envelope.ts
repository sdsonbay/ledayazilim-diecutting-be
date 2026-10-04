import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Cüzdan kapaklı zarf — yan kanatlar, alt kapak, üst yapıştırmalı dil.
 */
function buildEnvelope(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const caliper = num(params, 'caliper')
  const sideParam = num(params, 'sideFlap')
  const bottomParam = num(params, 'bottomFlap')
  const topParam = num(params, 'topFlap')
  const bleed = num(params, 'bleed')
  const side = sideParam > 0 ? sideParam : Math.max(18, W * 0.35)
  const bottom = bottomParam > 0 ? bottomParam : Math.max(22, W * 0.4)
  const top = topParam > 0 ? topParam : Math.max(28, W * 0.5)

  const b = new DielineBuilder(
    'envelope-wallet',
    { name: { tr: 'Zarf', en: 'Envelope' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const corners: Point[] = [
    { x: 0, y: -bottom },
    { x: L, y: -bottom },
    { x: L, y: 0 },
    { x: L + side, y: side * 0.35 },
    { x: L + side, y: W - side * 0.35 },
    { x: L, y: W },
    { x: L * 0.5, y: W + top },
    { x: 0, y: W },
    { x: -side, y: W - side * 0.35 },
    { x: -side, y: side * 0.35 },
    { x: 0, y: 0 },
  ]
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  outline.close()
  b.cut(outline.build(), 'zarf çevresi')

  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka', en: 'Back' }, outline: rectPoints(0, 0, L, W), role: 'wall' })
  b.root('back')
  b.panel({ id: 'bottom', name: 'bottom', label: { tr: 'Alt kapak', en: 'Bottom flap' }, outline: rectPoints(0, -bottom, L, bottom), role: 'flap' })
  b.panel({
    id: 'left',
    name: 'left',
    label: { tr: 'Sol kanat', en: 'Left flap' },
    outline: [
      { x: 0, y: 0 },
      { x: 0, y: W },
      { x: -side, y: W - side * 0.35 },
      { x: -side, y: side * 0.35 },
    ],
    role: 'flap',
  })
  b.panel({
    id: 'right',
    name: 'right',
    label: { tr: 'Sağ kanat', en: 'Right flap' },
    outline: [
      { x: L, y: 0 },
      { x: L + side, y: side * 0.35 },
      { x: L + side, y: W - side * 0.35 },
      { x: L, y: W },
    ],
    role: 'flap',
  })
  b.panel({
    id: 'top',
    name: 'top',
    label: { tr: 'Üst dil', en: 'Top flap' },
    outline: [
      { x: 0, y: W },
      { x: L, y: W },
      { x: L * 0.5, y: W + top },
    ],
    role: 'flap',
  })

  b.fold({ parent: 'back', child: 'bottom', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'back', child: 'top', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'back', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'back', child: 'right', ...foldVertical(L, 0, W, 'right') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-side - bleed, -bottom - bleed, L + 2 * side + 2 * bleed, W + top + bottom + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const walletEnvelope: TemplateDefinition = {
  id: 'envelope-wallet',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Cüzdan kapaklı zarf', en: 'Wallet flap envelope' },
  description: {
    tr: 'Yan kanatlar + alt kapak + üçgen üst dil. Davetiye, evrak ve e-ticaret zarfı.',
    en: 'Side flaps, bottom flap and a triangular lick — invitations, documents, mailers.',
  },
  category: 'envelopes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['zarf', 'envelope', 'davetiye', 'evrak', 'cüzdan kapak'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 500, step: 1, default: 220, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 40, max: 400, step: 1, default: 110, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 2, step: 0.05, default: 0.25, group: 'material' },
    { kind: 'number', key: 'sideFlap', label: { tr: 'Yan kanat', en: 'Side flap' }, unit: 'mm', min: 0, max: 120, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bottomFlap', label: { tr: 'Alt kapak', en: 'Bottom flap' }, unit: 'mm', min: 0, max: 150, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'topFlap', label: { tr: 'Üst dil', en: 'Top flap' }, unit: 'mm', min: 0, max: 150, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildEnvelope,
}
