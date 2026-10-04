import { distance, flattenPath, polygonArea, round } from './geometry.ts'
import type { Dieline, DielineWarning, Point } from './types.ts'

export interface ValidateOptions {
  /** Bıçağın üretebileceği en kısa doğru parçası (mm). */
  minSegment?: number
  /** İki kırım arası veya kırım–kesim arası en küçük güvenli mesafe, kalınlık katı olarak. */
  minFeatureCaliperFactor?: number
  /** Baskı makinesinin tabaka ölçüsü — aşılırsa uyarı. */
  maxSheet?: { width: number; height: number }
}

const key = (a: Point, b: Point): string => {
  const p = round(a.x, 2) + ',' + round(a.y, 2)
  const q = round(b.x, 2) + ',' + round(b.y, 2)
  return p < q ? `${p}|${q}` : `${q}|${p}`
}

/**
 * Üretime gitmeden önce dieline'ı denetler.
 *
 * Buradaki kontroller kalıpçıdan geri dönen dosyaların gerçek sebeplerini
 * hedefler: çift bıçak izi, kapanmamış kontur, bıçağın basamayacağı kadar
 * kısa parça, tabakaya sığmayan ölçü.
 */
export function validateDieline(dieline: Dieline, options: ValidateOptions = {}): DielineWarning[] {
  const minSegment = options.minSegment ?? 0.3
  const caliperFactor = options.minFeatureCaliperFactor ?? 1.5
  const warnings: DielineWarning[] = []

  const seen = new Map<string, number>()
  let shortSegments = 0
  let openCutContours = 0

  for (const path of dieline.paths) {
    if (path.layer !== 'cut' && path.layer !== 'crease' && path.layer !== 'perf' && path.layer !== 'cutcrease') continue
    const chains = flattenPath(path.commands)
    for (const chain of chains) {
      const first = chain[0]
      const last = chain[chain.length - 1]
      if (path.layer === 'cut' && first && last && chain.length > 3 && distance(first, last) > 0.05) {
        openCutContours += 1
      }
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1] as Point
        const b = chain[i] as Point
        const len = distance(a, b)
        if (len < 1e-6) continue
        if (len < minSegment) shortSegments += 1
        if (path.layer === 'cut') {
          const k = key(a, b)
          seen.set(k, (seen.get(k) ?? 0) + 1)
        }
      }
    }
  }

  const duplicates = [...seen.values()].filter((n) => n > 1).length
  if (duplicates > 0) {
    warnings.push({
      code: 'duplicate-cut',
      severity: 'error',
      message: {
        tr: `${duplicates} adet üst üste binmiş kesim çizgisi var. Kalıpta çift bıçak oluşur, temizlenmeli.`,
        en: `${duplicates} overlapping cut segments found. This produces a double knife in the die.`,
      },
    })
  }

  if (openCutContours > 0) {
    warnings.push({
      code: 'open-contour',
      severity: 'warning',
      message: {
        tr: `${openCutContours} adet kapanmamış kesim konturu var. Kasıtlı bir yarık değilse kapatılmalı.`,
        en: `${openCutContours} open cut contours. Close them unless they are intentional slits.`,
      },
    })
  }

  if (shortSegments > 0) {
    warnings.push({
      code: 'short-segment',
      severity: 'warning',
      message: {
        tr: `${shortSegments} adet ${minSegment} mm'den kısa parça var; bıçak bu detayı basamayabilir.`,
        en: `${shortSegments} segments shorter than ${minSegment} mm; the knife may not reproduce them.`,
      },
    })
  }

  const minFeature = dieline.meta.caliper * caliperFactor
  const tinyPanels = dieline.panels.filter((p) => polygonArea(p.outline) > 0 && smallestSide(p.outline) < minFeature)
  if (tinyPanels.length > 0) {
    warnings.push({
      code: 'panel-too-small',
      severity: 'warning',
      message: {
        tr: `${tinyPanels.map((p) => p.name).join(', ')} paneli malzeme kalınlığına göre çok dar (< ${round(minFeature, 2)} mm); katlanırken yırtılabilir.`,
        en: `Panel(s) ${tinyPanels.map((p) => p.name).join(', ')} are too narrow for the material thickness (< ${round(minFeature, 2)} mm).`,
      },
    })
  }

  const sheet = options.maxSheet
  if (sheet) {
    const fitsUpright = dieline.bounds.width <= sheet.width && dieline.bounds.height <= sheet.height
    const fitsRotated = dieline.bounds.height <= sheet.width && dieline.bounds.width <= sheet.height
    if (!fitsUpright && !fitsRotated) {
      warnings.push({
        code: 'exceeds-sheet',
        severity: 'error',
        message: {
          tr: `Açık ölçü ${round(dieline.bounds.width, 1)}×${round(dieline.bounds.height, 1)} mm, ${sheet.width}×${sheet.height} mm tabakaya sığmıyor.`,
          en: `Flat size ${round(dieline.bounds.width, 1)}×${round(dieline.bounds.height, 1)} mm does not fit the ${sheet.width}×${sheet.height} mm sheet.`,
        },
      })
    }
  }

  return warnings
}

function smallestSide(polygon: readonly Point[]): number {
  let min = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point
    const b = polygon[(i + 1) % polygon.length] as Point
    const d = distance(a, b)
    if (d > 1e-6 && d < min) min = d
  }
  return Number.isFinite(min) ? min : 0
}
