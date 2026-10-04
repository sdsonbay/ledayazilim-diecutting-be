import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, str, type ParamValue, type TemplateDefinition } from '../types.ts'

type Piece = 'base' | 'lid'

function addTray(
  b: DielineBuilder,
  prefix: string,
  origin: Point,
  L: number,
  W: number,
  H: number,
  caliper: number,
  cornerRadius: number,
  isRoot: boolean,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const ox = origin.x
  const oy = origin.y
  const p = (id: string) => (prefix ? `${prefix}-${id}` : id)
  const earOuterLeft = ox - (H - caliper)
  const earOuterRight = ox + L + (H - caliper)
  const wallOuterLeft = ox - H
  const wallOuterRight = ox + L + H
  const bottom = oy - H
  const top = oy + W + H

  const corners: Point[] = [
    { x: earOuterLeft, y: bottom },
    { x: earOuterRight, y: bottom },
    { x: earOuterRight, y: oy },
    { x: wallOuterRight, y: oy },
    { x: wallOuterRight, y: oy + W },
    { x: earOuterRight, y: oy + W },
    { x: earOuterRight, y: top },
    { x: earOuterLeft, y: top },
    { x: earOuterLeft, y: oy + W },
    { x: wallOuterLeft, y: oy + W },
    { x: wallOuterLeft, y: oy },
    { x: earOuterLeft, y: oy },
  ]
  const rounded = new Set([0, 1, 6, 7])
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i <= corners.length; i++) {
    const corner = corners[i % corners.length] as Point
    const next = corners[(i + 1) % corners.length] as Point
    if (i < corners.length && rounded.has(i)) outline.filletTo(corner, next, cornerRadius)
    else if (i < corners.length) outline.lineTo(corner)
  }
  outline.close()
  b.cut(outline.build(), prefix ? `${prefix} çevresi` : 'tepsi çevresi')

  b.cutLine({ x: ox, y: oy }, { x: earOuterLeft, y: oy }, `${prefix} ön-sol yarık`)
  b.cutLine({ x: ox + L, y: oy }, { x: earOuterRight, y: oy }, `${prefix} ön-sağ yarık`)
  b.cutLine({ x: ox, y: oy + W }, { x: earOuterLeft, y: oy + W }, `${prefix} arka-sol yarık`)
  b.cutLine({ x: ox + L, y: oy + W }, { x: earOuterRight, y: oy + W }, `${prefix} arka-sağ yarık`)

  const baseId = p('base')
  b.panel({
    id: baseId,
    name: baseId,
    label: prefix === 'lid' ? { tr: 'Kapak tabanı', en: 'Lid base' } : { tr: 'Taban', en: 'Base' },
    outline: rectPoints(ox, oy, L, W),
    role: 'bottom',
  })
  if (isRoot) b.root(baseId)

  const walls: [string, Point[], { tr: string; en: string }][] = [
    [p('front'), rectPoints(ox, oy - H, L, H), { tr: 'Ön duvar', en: 'Front wall' }],
    [p('back'), rectPoints(ox, oy + W, L, H), { tr: 'Arka duvar', en: 'Back wall' }],
    [p('left'), rectPoints(ox - H, oy, H, W), { tr: 'Sol duvar', en: 'Left wall' }],
    [p('right'), rectPoints(ox + L, oy, H, W), { tr: 'Sağ duvar', en: 'Right wall' }],
  ]
  for (const [id, outlinePoints, label] of walls) {
    b.panel({ id, name: id, label, outline: outlinePoints, role: 'wall' })
  }

  b.fold({ parent: baseId, child: p('front'), ...foldHorizontal(oy, ox, ox + L, 'below') })
  b.fold({ parent: baseId, child: p('back'), ...foldHorizontal(oy + W, ox, ox + L, 'above') })
  b.fold({ parent: baseId, child: p('left'), ...foldVertical(ox, oy, oy + W, 'left') })
  b.fold({ parent: baseId, child: p('right'), ...foldVertical(ox + L, oy, oy + W, 'right') })

  const ears: [string, string, Point[], number, number, number, 'left' | 'right'][] = [
    [p('ear-front-left'), p('front'), rectPoints(earOuterLeft, oy - H, H - caliper, H), ox, oy - H, oy, 'left'],
    [p('ear-front-right'), p('front'), rectPoints(ox + L, oy - H, H - caliper, H), ox + L, oy - H, oy, 'right'],
    [p('ear-back-left'), p('back'), rectPoints(earOuterLeft, oy + W, H - caliper, H), ox, oy + W, oy + W + H, 'left'],
    [p('ear-back-right'), p('back'), rectPoints(ox + L, oy + W, H - caliper, H), ox + L, oy + W, oy + W + H, 'right'],
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

  return { minX: wallOuterLeft, minY: bottom, maxX: wallOuterRight, maxY: top }
}

/**
 * FEFCO 0301 — teleskop kutu (ayrı kapak + taban).
 *
 * İki dört-köşe tepsi yan yana. Kapak, tabandan kalınlık + pay kadar büyük.
 * `piece` ile yalnızca taban veya kapak da üretilebilir.
 */
function buildTelescope(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const fit = num(params, 'fitClearance')
  const lidHParam = num(params, 'lidHeight')
  const cornerRadius = num(params, 'cornerRadius')
  const bleed = num(params, 'bleed')
  const piece = str(params, 'piece') as Piece | 'both'

  const lidH = lidHParam > 0 ? lidHParam : Math.max(20, H * 0.55)
  const lidL = L + 2 * caliper + fit
  const lidW = W + 2 * caliper + fit
  const gap = 20

  const b = new DielineBuilder(
    'fefco-0301',
    { name: { tr: 'Teleskop kutu', en: 'Telescope box' }, fefco: '0301', caliper, glueFlapSide: 'none' },
    params,
  )

  const wantBase = piece === 'both' || piece === 'base'
  const wantLid = piece === 'both' || piece === 'lid'
  let bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  if (wantBase) {
    bounds = addTray(b, piece === 'both' ? 'base' : '', { x: 0, y: 0 }, L, W, H, caliper, cornerRadius, true)
  }

  if (wantLid) {
    const dx = wantBase ? L + H + gap + lidH : 0
    const lidBounds = addTray(b, wantBase ? 'lid' : '', { x: dx, y: 0 }, lidL, lidW, lidH, caliper, cornerRadius, !wantBase)
    if (wantBase) {
      b.fold({
        parent: 'base-base',
        child: 'lid-base',
        axis: [
          { x: bounds.maxX, y: 0 },
          { x: bounds.maxX, y: W },
        ],
        angle: 0,
        draw: false,
      })
      bounds = {
        minX: Math.min(bounds.minX, lidBounds.minX),
        minY: Math.min(bounds.minY, lidBounds.minY),
        maxX: Math.max(bounds.maxX, lidBounds.maxX),
        maxY: Math.max(bounds.maxY, lidBounds.maxY),
      }
    } else {
      bounds = lidBounds
    }
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

export const telescopeBox: TemplateDefinition = {
  id: 'fefco-0301',
  code: '0301',
  standard: 'FEFCO',
  name: { tr: 'Teleskop kutu (kapak + taban)', en: 'Telescope box (lid + base)' },
  description: {
    tr: 'İki parçalı kutu: taban tepsisi ve üzerine geçen kapak. Ayakkabı, hediye ve tekstil kutularının formu.',
    en: 'Two-piece box: a base tray and a slightly larger lid that slides over it — shoes, gifts, apparel.',
  },
  category: 'tray-boxes',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['0301', 'teleskop', 'ayakkabı kutusu', 'hediye kutusu', 'kapak taban', 'telescope'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'İç uzunluk', en: 'Inside length' }, unit: 'mm', min: 40, max: 1500, step: 1, default: 300, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'İç genişlik', en: 'Inside width' }, unit: 'mm', min: 40, max: 1500, step: 1, default: 200, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Taban yüksekliği', en: 'Base height' }, unit: 'mm', min: 20, max: 400, step: 1, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'lidHeight', label: { tr: 'Kapak yüksekliği', en: 'Lid height' }, unit: 'mm', min: 0, max: 400, step: 1, default: 0, autoWhenZero: true, group: 'dimensions', help: { tr: '0 bırakılırsa taban yüksekliğinin %55’i.', en: 'Leave 0 to use 55% of the base height.' } },
    {
      kind: 'enum',
      key: 'piece',
      label: { tr: 'Parça', en: 'Piece' },
      default: 'both',
      group: 'construction',
      options: [
        { value: 'both', label: { tr: 'Kapak + taban', en: 'Lid + base' } },
        { value: 'base', label: { tr: 'Yalnızca taban', en: 'Base only' } },
        { value: 'lid', label: { tr: 'Yalnızca kapak', en: 'Lid only' } },
      ],
    },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 12, step: 0.1, default: 2.5, group: 'material' },
    { kind: 'number', key: 'fitClearance', label: { tr: 'Kapak payı', en: 'Lid fit clearance' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 1, advanced: true, group: 'construction' },
    { kind: 'number', key: 'cornerRadius', label: { tr: 'Dış köşe yarıçapı', en: 'Outer corner radius' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 4, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildTelescope,
}
