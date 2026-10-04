import type { LineType } from '@diecut/core'

export interface LayerStyle {
  /** DXF katman adı ve PDF katman etiketi. */
  name: string
  label: { tr: string; en: string }
  /** Ekran ve SVG rengi. */
  stroke: string
  /** Kesikli çizgi deseni (mm). */
  dash?: number[]
  widthMm: number
  /**
   * Matbaanın beklediği spot renk adı. `CutContour` ve `Crease` isimleri
   * Esko/Roland iş akışlarında doğrudan tanınır.
   */
  spotName?: string
  cmyk?: [number, number, number, number]
  /** AutoCAD renk indeksi (DXF). */
  aci: number
  production: boolean
}

export const LAYER_STYLES: Record<LineType, LayerStyle> = {
  cut: {
    name: 'CUT',
    label: { tr: 'Kesim', en: 'Cut' },
    stroke: '#E4002B',
    widthMm: 0.25,
    spotName: 'CutContour',
    cmyk: [0, 1, 1, 0],
    aci: 1,
    production: true,
  },
  crease: {
    name: 'CREASE',
    label: { tr: 'Kırım', en: 'Crease' },
    stroke: '#00A651',
    widthMm: 0.25,
    spotName: 'Crease',
    cmyk: [1, 0, 1, 0],
    aci: 3,
    production: true,
  },
  perf: {
    name: 'PERF',
    label: { tr: 'Perfore', en: 'Perforation' },
    stroke: '#0057B8',
    dash: [4, 1.5, 0.8, 1.5],
    widthMm: 0.25,
    spotName: 'Perforation',
    cmyk: [1, 0.6, 0, 0],
    aci: 5,
    production: true,
  },
  cutcrease: {
    name: 'CUTCREASE',
    label: { tr: 'Yarı kesim', en: 'Cut-crease' },
    stroke: '#7B2CBF',
    dash: [2, 1],
    widthMm: 0.25,
    spotName: 'CutCrease',
    cmyk: [0.5, 1, 0, 0],
    aci: 6,
    production: true,
  },
  bleed: {
    name: 'BLEED',
    label: { tr: 'Taşma payı', en: 'Bleed' },
    stroke: '#00AEEF',
    dash: [2, 2],
    widthMm: 0.15,
    aci: 4,
    production: false,
  },
  safe: {
    name: 'SAFE',
    label: { tr: 'Güvenli alan', en: 'Safe area' },
    stroke: '#ED0080',
    dash: [2, 2],
    widthMm: 0.15,
    aci: 6,
    production: false,
  },
  glue: {
    name: 'GLUE',
    label: { tr: 'Yapıştırma alanı', en: 'Glue area' },
    stroke: '#FFB81C',
    dash: [1, 1],
    widthMm: 0.15,
    aci: 2,
    production: false,
  },
  dimension: {
    name: 'DIMENSION',
    label: { tr: 'Ölçü', en: 'Dimension' },
    stroke: '#8A8A8A',
    widthMm: 0.12,
    aci: 8,
    production: false,
  },
  annotation: {
    name: 'ANNOTATION',
    label: { tr: 'Künye', en: 'Annotation' },
    stroke: '#8A8A8A',
    widthMm: 0.12,
    aci: 8,
    production: false,
  },
}

/** Çizim sırası: yardımcı katmanlar altta, kesim en üstte. */
export const LAYER_ORDER: LineType[] = ['bleed', 'safe', 'glue', 'dimension', 'annotation', 'crease', 'perf', 'cutcrease', 'cut']
