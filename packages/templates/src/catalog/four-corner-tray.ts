import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Dört köşe yapıştırmalı tepsi (ECMA A60.30 ailesi).
 *
 * Taban ortada; ön/arka duvarların uçlarındaki kulaklar 90° içe katlanır,
 * yan duvarlar kalkıp bu kulakların üstüne yapıştırılır. Meyve, fırın ve
 * hazır yemek ambalajlarının temel formu.
 *
 * Kulaklar yan duvarlardan bir malzeme kalınlığı kadar içeride biter;
 * bu pay olmadan kutu kapanırken köşeler birbirine biner.
 */
function buildTray(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const cornerRadius = num(params, 'cornerRadius')
  const bleed = num(params, 'bleed')

  const earOuterLeft = -(H - caliper)
  const earOuterRight = L + (H - caliper)
  const wallOuterLeft = -H
  const wallOuterRight = L + H
  const bottom = -H
  const top = W + H

  const b = new DielineBuilder(
    'tray-4corner-glued',
    {
      name: { tr: 'Dört köşe yapıştırmalı tepsi', en: 'Four corner glued tray' },
      ecma: 'A60.30',
      caliper,
      glueFlapSide: 'none',
    },
    params,
  )

  const corners: Point[] = [
    { x: earOuterLeft, y: bottom },
    { x: earOuterRight, y: bottom },
    { x: earOuterRight, y: 0 },
    { x: wallOuterRight, y: 0 },
    { x: wallOuterRight, y: W },
    { x: earOuterRight, y: W },
    { x: earOuterRight, y: top },
    { x: earOuterLeft, y: top },
    { x: earOuterLeft, y: W },
    { x: wallOuterLeft, y: W },
    { x: wallOuterLeft, y: 0 },
    { x: earOuterLeft, y: 0 },
  ]
  // Dış köşeler yuvarlatılır; iç basamaklar keskin kalır.
  const roundedIndices = new Set([0, 1, 6, 7])

  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i <= corners.length; i++) {
    const corner = corners[i % corners.length] as Point
    const next = corners[(i + 1) % corners.length] as Point
    if (i < corners.length && roundedIndices.has(i)) outline.filletTo(corner, next, cornerRadius)
    else if (i < corners.length) outline.lineTo(corner)
  }
  outline.close()
  b.cut(outline.build(), 'tepsi çevresi')

  // Kulakları yan duvarlardan ayıran yarıklar.
  b.cutLine({ x: 0, y: 0 }, { x: earOuterLeft, y: 0 }, 'ön-sol kulak yarığı')
  b.cutLine({ x: L, y: 0 }, { x: earOuterRight, y: 0 }, 'ön-sağ kulak yarığı')
  b.cutLine({ x: 0, y: W }, { x: earOuterLeft, y: W }, 'arka-sol kulak yarığı')
  b.cutLine({ x: L, y: W }, { x: earOuterRight, y: W }, 'arka-sağ kulak yarığı')

  b.panel({
    id: 'base',
    name: 'base',
    label: { tr: 'Taban', en: 'Base' },
    outline: rectPoints(0, 0, L, W),
    role: 'bottom',
  })
  b.root('base')

  const walls: [string, Point[], { tr: string; en: string }][] = [
    ['front', rectPoints(0, -H, L, H), { tr: 'Ön duvar', en: 'Front wall' }],
    ['back', rectPoints(0, W, L, H), { tr: 'Arka duvar', en: 'Back wall' }],
    ['left', rectPoints(-H, 0, H, W), { tr: 'Sol duvar', en: 'Left wall' }],
    ['right', rectPoints(L, 0, H, W), { tr: 'Sağ duvar', en: 'Right wall' }],
  ]
  for (const [id, outlinePoints, label] of walls) {
    b.panel({ id, name: id, label, outline: outlinePoints, role: 'wall' })
  }

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })

  const ears: [string, string, Point[], number, number, number, 'left' | 'right'][] = [
    ['ear-front-left', 'front', rectPoints(earOuterLeft, -H, H - caliper, H), 0, -H, 0, 'left'],
    ['ear-front-right', 'front', rectPoints(L, -H, H - caliper, H), L, -H, 0, 'right'],
    ['ear-back-left', 'back', rectPoints(earOuterLeft, W, H - caliper, H), 0, W, W + H, 'left'],
    ['ear-back-right', 'back', rectPoints(L, W, H - caliper, H), L, W, W + H, 'right'],
  ]
  for (const [id, parent, outlinePoints, x, y1, y2, side] of ears) {
    b.panel({
      id,
      name: id,
      label: { tr: 'Köşe kulağı', en: 'Corner ear' },
      outline: outlinePoints,
      role: 'glue',
      printable: false,
    })
    b.fold({ parent, child: id, ...foldVertical(x, y1, y2, side) })
  }

  if (bleed > 0) {
    b.guide('bleed', rectPath(wallOuterLeft - bleed, bottom - bleed, wallOuterRight - wallOuterLeft + 2 * bleed, top - bottom + 2 * bleed), 'taşma payı')
  }

  if (H > Math.min(L, W) / 2) {
    b.warn(
      'tall-tray',
      'info',
      'Duvar yüksekliği taban ölçüsüne göre büyük; açık ölçü hızla büyür ve tabakadan az sayıda kutu çıkar.',
      'Wall height is large relative to the base; the flat size grows quickly and yield per sheet drops.',
    )
  }

  return b.build()
}

export const fourCornerTray: TemplateDefinition = {
  id: 'tray-4corner-glued',
  code: 'A60.30',
  standard: 'ECMA',
  name: { tr: 'Dört köşe yapıştırmalı tepsi', en: 'Four corner glued tray' },
  description: {
    tr: 'Ön ve arka duvarların kulakları içe katlanır, yan duvarlar üzerlerine yapıştırılır. Gıda, meyve ve hazır yemek ambalajlarının temel formu.',
    en: 'Ears on the front and back walls fold inward and the side walls are glued over them — the base form for food and produce trays.',
  },
  category: 'tray-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'stable',
  keywords: ['tepsi', 'tray', 'dört köşe', 'meyve kasası', 'gıda ambalajı'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 30, max: 1500, step: 1, default: 250, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 30, max: 1500, step: 1, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Duvar yüksekliği', en: 'Wall height' }, unit: 'mm', min: 10, max: 400, step: 1, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: 0.5, group: 'material' },
    { kind: 'number', key: 'cornerRadius', label: { tr: 'Dış köşe yarıçapı', en: 'Outer corner radius' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 4, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildTray,
}
