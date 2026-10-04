import { DielineBuilder, PathBuilder, rectPath, type Dieline, type Point } from '@diecut/core'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Altıgen tepsi — bal peteği taban, pahlı (miter) altı duvar.
 * Dikdörtgen duvarlar köşede binmesin diye dış kenar kısalır.
 */
function buildHexTray(params: Record<string, ParamValue>): Dieline {
  const F = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const R = F / Math.sqrt(3)
  const cx = 0
  const cy = 0

  const verts: Point[] = []
  for (let i = 0; i < 6; i++) {
    const a = ((30 + i * 60) * Math.PI) / 180
    verts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) })
  }

  const b = new DielineBuilder(
    'tray-hex',
    { name: { tr: 'Altıgen tepsi', en: 'Hexagonal tray' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const inset = H * Math.tan(Math.PI / 6)
  const walls: { id: string; a: Point; b: Point; outerA: Point; outerB: Point }[] = []
  for (let i = 0; i < 6; i++) {
    const a = verts[i] as Point
    const c = verts[(i + 1) % 6] as Point
    const edge = { x: c.x - a.x, y: c.y - a.y }
    const len = Math.hypot(edge.x, edge.y) || 1
    const t = { x: edge.x / len, y: edge.y / len }
    let n = { x: -t.y, y: t.x }
    const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }
    if (n.x * mid.x + n.y * mid.y < 0) n = { x: -n.x, y: -n.y }
    const miter = Math.min(inset, len * 0.45)
    walls.push({
      id: `wall-${i}`,
      a,
      b: c,
      outerA: { x: a.x + n.x * H + t.x * miter, y: a.y + n.y * H + t.y * miter },
      outerB: { x: c.x + n.x * H - t.x * miter, y: c.y + n.y * H - t.y * miter },
    })
  }

  const outline = new PathBuilder()
  const first = walls[0] as (typeof walls)[number]
  outline.moveTo(first.a)
  for (const wall of walls) {
    outline.lineTo(wall.outerA)
    outline.lineTo(wall.outerB)
    outline.lineTo(wall.b)
  }
  outline.close()
  b.cut(outline.build(), 'altıgen tepsi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: verts, role: 'bottom' })
  b.root('base')
  for (const wall of walls) {
    b.panel({
      id: wall.id,
      name: wall.id,
      label: { tr: 'Duvar', en: 'Wall' },
      outline: [wall.a, wall.b, wall.outerB, wall.outerA],
      role: 'wall',
    })
    b.fold({ parent: 'base', child: wall.id, axis: [wall.a, wall.b], angle: 90 })
  }

  if (bleed > 0) {
    const pad = H + bleed
    b.guide('bleed', rectPath(-R - pad, -R - pad, 2 * R + 2 * pad, 2 * R + 2 * pad), 'taşma payı')
  }
  return b.build()
}

export const hexTray: TemplateDefinition = {
  id: 'tray-hex',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Altıgen tepsi', en: 'Hexagonal tray' },
  description: {
    tr: 'Altı duvarlı kase. Kuruyemiş, şarküteri, hediye ve vitrin sunumu.',
    en: 'Six-wall bowl tray for nuts, deli, gifts and counter display.',
  },
  category: 'tray-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'beta',
  keywords: ['altıgen', 'hex', 'kase', 'tepsi', 'hediye', 'kuruyemiş'],
  params: [
    { kind: 'number', key: 'width', label: { tr: 'Düzler arası genişlik', en: 'Flat-to-flat width' }, unit: 'mm', min: 40, max: 800, step: 1, default: 160, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Duvar yüksekliği', en: 'Wall height' }, unit: 'mm', min: 10, max: 200, step: 1, default: 45, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 8, step: 0.05, default: 0.5, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildHexTray,
}
