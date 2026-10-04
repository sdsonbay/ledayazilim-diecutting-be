import { distance, flattenPath, round, type Dieline, type LineType, type Point } from '@diecut/core'
import { LAYER_ORDER, LAYER_STYLES } from './layers.ts'

export interface DxfOptions {
  /** Yay düzleştirme toleransı (mm). Kalıp üretimi için 0.01–0.05 arası yeterli. */
  tolerance?: number
  includeGuides?: boolean
  /** Çizimi orijine taşı (sol-alt köşe 0,0). */
  normalise?: boolean
}

/**
 * AutoCAD R12 (AC1009) ASCII DXF üretir.
 *
 * R12 en geniş uyumluluğa sahip sürüm: kalıp atölyelerinin eski CAM
 * yazılımları dahil her şey okuyabiliyor. Yaylar poligona çevrilir,
 * her çizgi tipi kendi katmanına yazılır.
 */
export function toDxf(dieline: Dieline, options: DxfOptions = {}): string {
  const tolerance = options.tolerance ?? 0.02
  const includeGuides = options.includeGuides ?? false
  const normalise = options.normalise ?? true

  const dx = normalise ? -dieline.bounds.x : 0
  const dy = normalise ? -dieline.bounds.y : 0

  const usedLayers: LineType[] = LAYER_ORDER.filter((layer) => {
    if (!includeGuides && !LAYER_STYLES[layer].production) return false
    return dieline.paths.some((p) => p.layer === layer)
  })

  const out: string[] = []
  const code = (group: number, value: string | number): void => {
    out.push(String(group), String(value))
  }

  code(0, 'SECTION')
  code(2, 'HEADER')
  code(9, '$ACADVER')
  code(1, 'AC1009')
  code(9, '$INSUNITS')
  code(70, 4) // 4 = milimetre
  code(9, '$EXTMIN')
  code(10, round(dieline.bounds.x + dx, 4))
  code(20, round(dieline.bounds.y + dy, 4))
  code(30, 0)
  code(9, '$EXTMAX')
  code(10, round(dieline.bounds.x + dx + dieline.bounds.width, 4))
  code(20, round(dieline.bounds.y + dy + dieline.bounds.height, 4))
  code(30, 0)
  code(0, 'ENDSEC')

  code(0, 'SECTION')
  code(2, 'TABLES')
  code(0, 'TABLE')
  code(2, 'LAYER')
  code(70, usedLayers.length)
  for (const layer of usedLayers) {
    const style = LAYER_STYLES[layer]
    code(0, 'LAYER')
    code(2, style.name)
    code(70, 0)
    code(62, style.aci)
    code(6, 'CONTINUOUS')
  }
  code(0, 'ENDTAB')
  code(0, 'ENDSEC')

  code(0, 'SECTION')
  code(2, 'ENTITIES')

  for (const layer of usedLayers) {
    const style = LAYER_STYLES[layer]
    for (const path of dieline.paths) {
      if (path.layer !== layer) continue
      for (const chain of flattenPath(path.commands, tolerance)) {
        const points = chain.map((p) => ({ x: p.x + dx, y: p.y + dy }))
        writePolyline(code, style.name, points)
      }
    }
  }

  code(0, 'ENDSEC')
  code(0, 'EOF')

  return out.join('\n') + '\n'
}

function writePolyline(code: (group: number, value: string | number) => void, layer: string, points: Point[]): void {
  if (points.length < 2) return

  const first = points[0] as Point
  const last = points[points.length - 1] as Point
  const closed = distance(first, last) < 1e-4
  const vertices = closed ? points.slice(0, -1) : points
  if (vertices.length < 2) return

  code(0, 'POLYLINE')
  code(8, layer)
  code(66, 1)
  code(70, closed ? 1 : 0)
  code(10, 0)
  code(20, 0)
  code(30, 0)

  for (const p of vertices) {
    code(0, 'VERTEX')
    code(8, layer)
    code(10, round(p.x, 4))
    code(20, round(p.y, 4))
    code(30, 0)
  }

  code(0, 'SEQEND')
  code(8, layer)
}
