import type { ImportedPath } from './types.ts'

export type ImportLayer = ImportedPath['layer']

const NAMED: Record<string, [number, number, number]> = {
  red: [220, 20, 20],
  crimson: [220, 20, 60],
  scarlet: [255, 36, 0],
  orange: [255, 140, 0],
  gold: [255, 200, 40],
  yellow: [240, 220, 40],
  green: [0, 170, 70],
  lime: [50, 205, 50],
  teal: [0, 128, 128],
  cyan: [0, 180, 200],
  aqua: [0, 200, 200],
  blue: [0, 80, 200],
  navy: [0, 0, 128],
  purple: [120, 40, 180],
  magenta: [220, 0, 180],
  fuchsia: [255, 0, 255],
  pink: [255, 80, 160],
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
}

export const chromaOf = (r: number, g: number, b: number): number => Math.max(r, g, b) - Math.min(r, g, b)

export const colorKey = (r: number, g: number, b: number): string =>
  `${Math.round(r / 12)},${Math.round(g / 12)},${Math.round(b / 12)}`

/** Yüksek skor = kesime daha yakın (kırmızı / magenta / sıcak). */
export const cutScore = (r: number, g: number, b: number): number => {
  if (chromaOf(r, g, b) < 16) return -800 + 0.3 * r + 0.59 * g + 0.11 * b
  return r - g + 0.35 * (r - b) + 0.75 * Math.max(0, r + b - 2 * g)
}

const rgbHue = (r: number, g: number, b: number): number | null => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 8) return null
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const mx = Math.max(rn, gn, bn)
  const mn = Math.min(rn, gn, bn)
  const delta = mx - mn
  let h = 0
  if (mx === rn) h = ((gn - bn) / delta) % 6
  else if (mx === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

export const parseCssColor = (raw: string): [number, number, number] | null => {
  const v = raw.trim().toLowerCase()
  if (!v || v === 'none' || v === 'transparent') return null
  const named = NAMED[v]
  if (named) return named
  const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/.exec(v)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((n) => Math.round(n)) as [number, number, number]
  let hex = v
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  if (/^#[0-9a-f]{6}$/.test(hex)) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ]
  }
  if (v.includes('red') || v.includes('magenta') || v.includes('scarlet')) return [220, 20, 60]
  if (v.includes('cyan') || v.includes('aqua')) return [0, 180, 200]
  if (v.includes('blue') || v.includes('navy')) return [0, 70, 200]
  if (v.includes('green') || v.includes('lime')) return [0, 170, 70]
  if (v.includes('orange')) return [255, 140, 0]
  if (v.includes('yellow') || v.includes('gold')) return [240, 210, 40]
  if (v.includes('purple') || v.includes('violet')) return [120, 40, 180]
  return null
}

/**
 * Tek renk. Sıcak / magenta → kesim; soğuk (yeşil-mavi-cyan) → kırım.
 * Kesikli çizgi her renkte kırım. Gri sürekli → kesim.
 */
export const layerFromRgb = (r: number, g: number, b: number, dashed: boolean): ImportLayer | null => {
  const max = Math.max(r, g, b)
  const chroma = chromaOf(r, g, b)
  if (max < 22) return dashed ? 'crease' : 'cut'
  if (chroma < 16) return dashed ? 'crease' : max < 230 ? 'cut' : null
  if (dashed) return 'crease'
  const hue = rgbHue(r, g, b)
  if (hue === null) return 'cut'
  if (hue >= 288 || hue <= 48) return 'cut'
  return 'crease'
}

export const layerFromName = (raw: string): ImportLayer | null => {
  const id = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (id.includes('cutcrease') || id.includes('cut-crease') || id.includes('yari')) return 'cutcrease'
  if (id.includes('crease') || id.includes('kirim') || id.includes('kırım') || id.includes('score')) return 'crease'
  if (id.includes('perf') || id.includes('perfore')) return 'perf'
  if (id.includes('cut') || id.includes('kesim') || id.includes('knife') || id.includes('contour')) return 'cut'
  return null
}

export const isGuideLayer = (raw: string): boolean => {
  const id = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return /bleed|safe|glue|dimension|annotation|label|tasima|tasma|guvenli|yapistirma|olcu|kunye/.test(id)
}

export interface LayerHint {
  named: ImportLayer | null
  rgb: [number, number, number] | null
  dashed: boolean
}

/** İki (veya daha fazla) renk varsa göreli ayır: en sıcak kesim, diğerleri kırım. */
export const resolveLayer = (hint: LayerHint, colorLayers: Map<string, ImportLayer> | null): ImportLayer => {
  if (hint.named) return hint.named
  if (hint.dashed) return 'crease'
  if (hint.rgb && colorLayers) {
    const mapped = colorLayers.get(colorKey(hint.rgb[0], hint.rgb[1], hint.rgb[2]))
    if (mapped) return mapped
  }
  if (hint.rgb) return layerFromRgb(hint.rgb[0], hint.rgb[1], hint.rgb[2], false) ?? 'cut'
  return 'cut'
}

export const buildColorLayerMap = (hints: LayerHint[]): Map<string, ImportLayer> | null => {
  const scores = new Map<string, { rgb: [number, number, number]; score: number }>()
  for (const hint of hints) {
    if (hint.named || !hint.rgb || hint.dashed) continue
    if (chromaOf(hint.rgb[0], hint.rgb[1], hint.rgb[2]) < 16) continue
    const key = colorKey(hint.rgb[0], hint.rgb[1], hint.rgb[2])
    const score = cutScore(hint.rgb[0], hint.rgb[1], hint.rgb[2])
    const prev = scores.get(key)
    if (!prev) scores.set(key, { rgb: hint.rgb, score })
  }
  if (scores.size < 2) return null
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)
  const map = new Map<string, ImportLayer>()
  ranked.forEach(([key], i) => map.set(key, i === 0 ? 'cut' : 'crease'))
  return map
}
