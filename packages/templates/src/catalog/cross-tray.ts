import { PathBuilder, rectPoints, type DielineBuilder, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'

export interface TrayBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Dört köşe yapıştırmalı tepsi — gömlek, teleskop ve sert kutu kapak/tabanı. */
export function addCrossTray(
  b: DielineBuilder,
  prefix: string,
  origin: Point,
  L: number,
  W: number,
  H: number,
  caliper: number,
  cornerRadius: number,
  isRoot: boolean,
): TrayBounds {
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
    if (i < corners.length && rounded.has(i) && cornerRadius > 0) outline.filletTo(corner, next, cornerRadius)
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

export function linkTwoPiece(b: DielineBuilder, parent: string, child: string, from: Point, to: Point): void {
  b.fold({
    parent,
    child,
    axis: [from, to],
    angle: 0,
    draw: false,
  })
}
