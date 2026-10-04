/**
 * Bıçak izi (dieline) veri modeli.
 *
 * Tüm koordinatlar milimetre cinsinden ve matematiksel yönlüdür (+y yukarı).
 * SVG/PDF gibi +y aşağı olan hedeflere dönüşüm export katmanında yapılır.
 */

export type Unit = 'mm' | 'cm' | 'in' | 'pt'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Matbaanın ayrı katman olarak beklediği çizgi tipleri.
 * Kalıpçıya giden dosyada bunlar asla tek katmanda birleştirilmemeli.
 */
export const LINE_TYPES = [
  'cut', // kesim — sürekli çizgi, bıçak
  'crease', // kırım — katlama izi, kör bıçak
  'perf', // perfore — kesikli kesim
  'cutcrease', // yarı kesim / kesikli bıçak (kilit dilleri)
  'bleed', // taşma payı — sadece tasarımcı için
  'safe', // güvenli alan — sadece tasarımcı için
  'glue', // yapıştırma alanı göstergesi
  'dimension', // ölçü çizgileri
  'annotation', // künye, etiket
] as const

export type LineType = (typeof LINE_TYPES)[number]

/** Kalıp üretimine giden, gerçekten bıçak/kırım olan katmanlar. */
export const PRODUCTION_LAYERS: readonly LineType[] = ['cut', 'crease', 'perf', 'cutcrease']

export type PathCommand =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; rot: number; large: boolean; sweep: boolean; x: number; y: number }
  | { c: 'Z' }

export interface DielinePath {
  id: string
  layer: LineType
  commands: PathCommand[]
  /** Bilgi amaçlı: 'gövde çevresi', 'başparmak oyuğu' gibi. */
  note?: string
}

export type PanelRole =
  | 'wall' // gövde duvarı
  | 'flap' // kapak / tuck dili
  | 'dust' // toz kapağı
  | 'glue' // yapıştırma payı
  | 'lid' // kapak paneli
  | 'bottom' // taban paneli
  | 'lock' // kilit dili
  | 'gusset' // köşe körüğü

export interface Panel {
  id: string
  /** Makine okunur ad: 'front', 'left', 'top-tuck' … */
  name: string
  label: { tr: string; en: string }
  /** Düz (açık) haldeki dış hat, saat yönünün tersine sıralı. */
  outline: Point[]
  /** Panel içi pencereler / delikler (saat yönünde). */
  holes?: Point[][]
  role: PanelRole
  /** Üzerine baskı/artwork gelebilir mi (3D mockup UV eşlemesi için). */
  printable: boolean
}

/**
 * Panel grafiğinin bir kenarı. 3D katlama animasyonu bu listeden üretilir.
 * `parent` sabit kalır, `child` eksen etrafında döner.
 */
export interface Fold {
  id: string
  parent: string
  child: string
  /** Kırım hattının düz koordinatlardaki iki ucu. */
  axis: [Point, Point]
  /** Kapalı kutu halindeki hedef açı (derece). Pozitif = içe (valley). */
  angle: number
  kind: 'crease' | 'perf' | 'score'
  /** Ters (mountain) kırım: çocuk panel baskılı yüzün öbür tarafına döner — akordeon, zikzak. */
  reverse?: boolean
}

export interface DielineMeta {
  name: { tr: string; en: string }
  /** ECMA kodu, ör. 'A20.20' */
  ecma?: string
  /** FEFCO kodu, ör. '0201' */
  fefco?: string
  /** Malzeme kalınlığı (mm). Kilit ve flap toleransları buna göre hesaplanır. */
  caliper: number
  /** Kağıt tel yönü — dizgi ve kırım kalitesi için önemli. */
  grainDirection?: 'along-width' | 'along-height'
  /** Yapıştırma payının hangi kenarda olduğu. */
  glueFlapSide?: 'left' | 'right' | 'none'
}

export interface DielineStats {
  /** Toplam kesim bıçağı uzunluğu (mm) — kalıp maliyetinin ana girdisi. */
  cutLength: number
  /** Toplam kırım bıçağı uzunluğu (mm). */
  creaseLength: number
  perfLength: number
  /** Düz haldeki dış ölçü. */
  flatWidth: number
  flatHeight: number
  /** Dış hattın kapsadığı gerçek alan (mm²) — kağıt sarfiyatı için. */
  area: number
  /** Dış ölçü dikdörtgeninin alanı (mm²). */
  boundingArea: number
  /** area / boundingArea — dizgide ne kadar boşluk kaldığının göstergesi. */
  utilisation: number
}

export interface DielineWarning {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: { tr: string; en: string }
}

export interface Dieline {
  templateId: string
  unit: Unit
  params: Record<string, number | string | boolean>
  meta: DielineMeta
  paths: DielinePath[]
  panels: Panel[]
  folds: Fold[]
  /** Katlama ağacının kökü — 3D'de sabit duran panel. */
  rootPanel: string
  bounds: Rect
  stats: DielineStats
  warnings: DielineWarning[]
}
