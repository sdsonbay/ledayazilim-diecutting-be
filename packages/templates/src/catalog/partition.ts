import { DielineBuilder, PathBuilder, rectPath, type Dieline } from '@diecut/core'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * FEFCO 0904 — hücre ayırıcı.
 *
 * İki yönde şeritler, kenardan yarım boy yarık. Şişe, cam ve kutu içi
 * bölme. Parçalar tabakada yan yana, 0° bağ ile tek ağaç.
 */
function notchedStrip(length: number, height: number, slots: number[], fromBottom: boolean, slotW: number, slotD: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  if (fromBottom) {
    pts.push({ x: 0, y: 0 })
    for (const sx of slots) {
      pts.push({ x: sx - slotW / 2, y: 0 })
      pts.push({ x: sx - slotW / 2, y: slotD })
      pts.push({ x: sx + slotW / 2, y: slotD })
      pts.push({ x: sx + slotW / 2, y: 0 })
    }
    pts.push({ x: length, y: 0 })
    pts.push({ x: length, y: height })
    pts.push({ x: 0, y: height })
  } else {
    pts.push({ x: 0, y: 0 })
    pts.push({ x: length, y: 0 })
    pts.push({ x: length, y: height })
    for (let i = slots.length - 1; i >= 0; i--) {
      const sx = slots[i] as number
      pts.push({ x: sx + slotW / 2, y: height })
      pts.push({ x: sx + slotW / 2, y: height - slotD })
      pts.push({ x: sx - slotW / 2, y: height - slotD })
      pts.push({ x: sx - slotW / 2, y: height })
    }
    pts.push({ x: 0, y: height })
  }
  return pts
}

function buildPartition(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const cellsX = Math.max(1, Math.round(num(params, 'cellsX')))
  const cellsY = Math.max(1, Math.round(num(params, 'cellsY')))
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const slotW = Math.max(1.2, caliper + 0.4)
  const slotD = H / 2 + caliper * 0.5
  const gap = 8
  const cellW = L / cellsX
  const cellD = W / cellsY

  const b = new DielineBuilder(
    'fefco-0904',
    { name: { tr: 'Hücre ayırıcı', en: 'Cell partition' }, fefco: '0904', caliper, glueFlapSide: 'none' },
    params,
  )

  let cursorY = 0
  const xStripIds: string[] = []
  for (let i = 0; i < cellsY; i++) {
    const slots: number[] = []
    for (let k = 1; k < cellsX; k++) slots.push(k * cellW)
    const pts = notchedStrip(L, H, slots, true, slotW, slotD).map((p) => ({ x: p.x, y: p.y + cursorY }))
    const id = `x-strip-${i}`
    const outline = new PathBuilder()
    outline.moveTo(pts[0] as { x: number; y: number })
    for (let p = 1; p < pts.length; p++) outline.lineTo(pts[p] as { x: number; y: number })
    outline.close()
    b.cut(outline.build(), `yatay şerit ${i + 1}`)
    b.panel({ id, name: id, label: { tr: 'Yatay şerit', en: 'X strip' }, outline: pts, role: 'wall' })
    xStripIds.push(id)
    cursorY += H + gap
  }

  let cursorX = L + gap
  const yStripIds: string[] = []
  for (let i = 0; i < cellsX; i++) {
    const slots: number[] = []
    for (let k = 1; k < cellsY; k++) slots.push(k * cellD)
    const pts = notchedStrip(W, H, slots, false, slotW, slotD).map((p) => ({ x: p.x + cursorX, y: p.y }))
    const id = `y-strip-${i}`
    const outline = new PathBuilder()
    outline.moveTo(pts[0] as { x: number; y: number })
    for (let p = 1; p < pts.length; p++) outline.lineTo(pts[p] as { x: number; y: number })
    outline.close()
    b.cut(outline.build(), `dikey şerit ${i + 1}`)
    b.panel({ id, name: id, label: { tr: 'Dikey şerit', en: 'Y strip' }, outline: pts, role: 'wall' })
    yStripIds.push(id)
    cursorX += W + gap
  }

  const root = xStripIds[0] ?? yStripIds[0] ?? 'x-strip-0'
  b.root(root)
  const others = [...xStripIds, ...yStripIds].filter((id) => id !== root)
  for (const id of others) {
    b.fold({
      parent: root,
      child: id,
      axis: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      angle: 0,
      draw: false,
    })
  }

  if (bleed > 0) {
    b.guide('bleed', rectPath(-bleed, -bleed, cursorX + 2 * bleed, Math.max(cursorY, H) + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const cellPartition: TemplateDefinition = {
  id: 'fefco-0904',
  code: '0904',
  standard: 'FEFCO',
  name: { tr: 'Hücre ayırıcı', en: 'Cell partition' },
  description: {
    tr: 'Kilitlenen şeritlerden ızgara. Şişe, cam ve kutu içi bölme — FEFCO 09.',
    en: 'Interlocking slotted strips that form a grid — bottles, glass, inner packing.',
  },
  category: 'separators',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['0904', 'ayırıcı', 'partition', 'bölme', 'şişe', 'ızgara'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'İç uzunluk', en: 'Inner length' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 300, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'İç genişlik', en: 'Inner width' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 200, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Ayırıcı yüksekliği', en: 'Divider height' }, unit: 'mm', min: 20, max: 400, step: 1, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'cellsX', label: { tr: 'Hücre (uzunluk)', en: 'Cells along length' }, min: 1, max: 12, step: 1, default: 3, group: 'construction' },
    { kind: 'number', key: 'cellsY', label: { tr: 'Hücre (genişlik)', en: 'Cells along width' }, min: 1, max: 12, step: 1, default: 2, group: 'construction' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 12, step: 0.1, default: 3, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildPartition,
}
