import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * FEFCO 0452 — meyve / sebze tepsisi.
 *
 * Dört köşe yapıştırmalı tepsi + uzun duvarlarda kulp oyuğu ve isteğe
 * bağlı havalandırma. Köşe kulakları istif payı kadar uzar.
 */
function buildFruitTray(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const cornerRadius = num(params, 'cornerRadius')
  const stack = num(params, 'stackTab')
  const wantHandles = bool(params, 'handHoles')
  const wantVents = bool(params, 'vents')
  const bleed = num(params, 'bleed')

  const earOuterLeft = -(H - caliper)
  const earOuterRight = L + (H - caliper)
  const wallOuterLeft = -H
  const wallOuterRight = L + H
  const bottom = -H - stack
  const top = W + H + stack

  const b = new DielineBuilder(
    'fefco-0452',
    { name: { tr: 'Meyve tepsisi', en: 'Produce tray' }, fefco: '0452', caliper, glueFlapSide: 'none' },
    params,
  )

  const tab = Math.max(0, stack)
  const tabW = Math.min(18, L * 0.12)

  const corners: Point[] = [
    { x: earOuterLeft, y: bottom + tab },
    { x: 0, y: bottom + tab },
    { x: tabW, y: bottom },
    { x: L - tabW, y: bottom },
    { x: L, y: bottom + tab },
    { x: earOuterRight, y: bottom + tab },
    { x: earOuterRight, y: 0 },
    { x: wallOuterRight, y: 0 },
    { x: wallOuterRight, y: W },
    { x: earOuterRight, y: W },
    { x: earOuterRight, y: top - tab },
    { x: L, y: top - tab },
    { x: L - tabW, y: top },
    { x: tabW, y: top },
    { x: 0, y: top - tab },
    { x: earOuterLeft, y: top - tab },
    { x: earOuterLeft, y: W },
    { x: wallOuterLeft, y: W },
    { x: wallOuterLeft, y: 0 },
    { x: earOuterLeft, y: 0 },
  ]

  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i <= corners.length; i++) {
    const corner = corners[i % corners.length] as Point
    const next = corners[(i + 1) % corners.length] as Point
    if (i < corners.length) outline.filletTo(corner, next, Math.min(cornerRadius, 3))
  }
  outline.close()
  b.cut(outline.build(), 'tepsi çevresi')

  b.cutLine({ x: 0, y: 0 }, { x: earOuterLeft, y: 0 }, 'ön-sol kulak yarığı')
  b.cutLine({ x: L, y: 0 }, { x: earOuterRight, y: 0 }, 'ön-sağ kulak yarığı')
  b.cutLine({ x: 0, y: W }, { x: earOuterLeft, y: W }, 'arka-sol kulak yarığı')
  b.cutLine({ x: L, y: W }, { x: earOuterRight, y: W }, 'arka-sağ kulak yarığı')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H - tab, L, H + tab), role: 'wall' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar', en: 'Back wall' }, outline: rectPoints(0, W, L, H + tab), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })

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

  if (wantHandles && L >= 90 && H >= 28) {
    const hw = Math.min(80, L * 0.4)
    const hh = Math.min(28, H * 0.45)
    b.cut(stadiumPath({ x: L / 2, y: -H * 0.55 }, hw, hh), 'ön kulp')
    b.cut(stadiumPath({ x: L / 2, y: W + H * 0.55 }, hw, hh), 'arka kulp')
  }

  if (wantVents && W >= 80 && H >= 25) {
    const vw = Math.min(18, H * 0.35)
    const vh = Math.min(36, W * 0.18)
    b.cut(stadiumPath({ x: -H * 0.5, y: W * 0.28 }, vw, vh), 'sol havalandırma')
    b.cut(stadiumPath({ x: -H * 0.5, y: W * 0.72 }, vw, vh), 'sol havalandırma')
    b.cut(stadiumPath({ x: L + H * 0.5, y: W * 0.28 }, vw, vh), 'sağ havalandırma')
    b.cut(stadiumPath({ x: L + H * 0.5, y: W * 0.72 }, vw, vh), 'sağ havalandırma')
  }

  if (bleed > 0) {
    b.guide('bleed', rectPath(wallOuterLeft - bleed, bottom - bleed, wallOuterRight - wallOuterLeft + 2 * bleed, top - bottom + 2 * bleed), 'taşma payı')
  }

  return b.build()
}

export const fruitTray: TemplateDefinition = {
  id: 'fefco-0452',
  code: '0452',
  standard: 'FEFCO',
  name: { tr: 'Meyve / sebze tepsisi', en: 'Produce tray' },
  description: {
    tr: 'Dört köşe yapıştırmalı, kulplu ve havalandırmalı istif tepsisi. Yaş meyve-sebze kasasının temel formu.',
    en: 'Four-corner glued stacking tray with hand holes and vents — the produce crate.',
  },
  category: 'tray-boxes',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['0452', 'meyve', 'sebze', 'tepsi', 'produce', 'kasası', 'kulp'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 80, max: 1500, step: 1, default: 400, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 80, max: 1500, step: 1, default: 300, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Duvar yüksekliği', en: 'Wall height' }, unit: 'mm', min: 20, max: 250, step: 1, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 12, step: 0.1, default: 3, group: 'material' },
    { kind: 'number', key: 'stackTab', label: { tr: 'İstif kulağı', en: 'Stacking tab' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 10, group: 'construction' },
    { kind: 'boolean', key: 'handHoles', label: { tr: 'Kulp oyuğu', en: 'Hand holes' }, default: true, group: 'options' },
    { kind: 'boolean', key: 'vents', label: { tr: 'Havalandırma', en: 'Vents' }, default: true, group: 'options' },
    { kind: 'number', key: 'cornerRadius', label: { tr: 'Dış köşe yarıçapı', en: 'Outer corner radius' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 4, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildFruitTray,
}
