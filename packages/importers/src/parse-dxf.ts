import type { Point } from '@diecut/core'
import { ImportError, type ImportedPath } from './types.ts'
import { isGuideLayer } from './color-layer.ts'

const layerFromDxf = (name: string, aci: number, linetype: string): ImportedPath['layer'] | null => {
  const id = name.trim().toLowerCase()
  if (isGuideLayer(id)) return null
  if (id.includes('crease') || id.includes('score') || id.includes('kirim')) return 'crease'
  if (id.includes('perf')) return 'perf'
  if (id.includes('cutcrease') || id.includes('cut-crease')) return 'cutcrease'
  if (id.includes('cut') || id.includes('knife')) return 'cut'
  if (/dash|hidden|center|dot|phantom|div/.test(linetype.toLowerCase())) return 'crease'
  if (aci === 1 || aci === 10 || aci === 6) return 'cut'
  if (aci === 5 || aci === 3 || aci === 4 || aci === 2) return 'crease'
  if (aci === 7 || aci === 8 || aci === 256 || aci === 0) return 'cut'
  return null
}

const readPairs = (source: string): { code: number; value: string }[] => {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const pairs: { code: number; value: string }[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]?.trim())
    const value = (lines[i + 1] ?? '').trim()
    if (!Number.isFinite(code)) continue
    pairs.push({ code, value })
  }
  return pairs
}

const emit = (out: ImportedPath[], layer: string, aci: number, linetype: string, points: Point[], closed: boolean): void => {
  const kind = layerFromDxf(layer, aci, linetype)
  if (!kind || points.length < 2) return
  const pts = closed && points.length > 2 ? [...points, points[0] as Point] : points
  out.push({ layer: kind, points: pts })
}

export const parseDxf = (source: string): ImportedPath[] => {
  if (!/SECTION/i.test(source) || !/ENTITIES/i.test(source)) {
    throw new ImportError('DXF dosyası geçersiz veya ENTITIES bölümü yok')
  }
  const pairs = readPairs(source)
  const out: ImportedPath[] = []
  let inEntities = false
  let type = ''
  let layer = '0'
  let aci = 7
  let linetype = 'CONTINUOUS'
  let closed = false
  let points: Point[] = []
  let lineStart: Point | null = null
  let lineEnd: Point | null = null

  const flush = (): void => {
    if (type === 'LINE' && lineStart && lineEnd) emit(out, layer, aci, linetype, [lineStart, lineEnd], false)
    else if (type === 'LWPOLYLINE' || type === 'POLYLINE') emit(out, layer, aci, linetype, points, closed)
    type = ''
    layer = '0'
    aci = 7
    linetype = 'CONTINUOUS'
    closed = false
    points = []
    lineStart = null
    lineEnd = null
  }

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i] as { code: number; value: string }
    if (pair.code === 0 && pair.value === 'SECTION' && pairs[i + 1]?.value === 'ENTITIES') {
      inEntities = true
      continue
    }
    if (pair.code === 0 && (pair.value === 'ENDSEC' || pair.value === 'EOF')) {
      if (inEntities) flush()
      inEntities = false
      continue
    }
    if (!inEntities) continue

    if (pair.code === 0) {
      if (pair.value === 'VERTEX') {
        type = type || 'POLYLINE'
        continue
      }
      if (pair.value === 'SEQEND') continue
      flush()
      if (pair.value === 'LINE' || pair.value === 'LWPOLYLINE' || pair.value === 'POLYLINE') {
        type = pair.value
      }
      continue
    }

    if (!type) continue
    if (pair.code === 8) layer = pair.value
    if (pair.code === 6) linetype = pair.value
    if (pair.code === 62) aci = Number(pair.value) || aci
    if (pair.code === 70) closed = (Number(pair.value) & 1) === 1
    if (type === 'LINE' && pair.code === 10) {
      lineStart = { x: Number(pair.value), y: pairs[i + 1]?.code === 20 ? Number(pairs[i + 1].value) : 0 }
    }
    if (type === 'LINE' && pair.code === 11) {
      lineEnd = { x: Number(pair.value), y: pairs[i + 1]?.code === 21 ? Number(pairs[i + 1].value) : 0 }
    }
    if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && pair.code === 10) {
      points.push({ x: Number(pair.value), y: pairs[i + 1]?.code === 20 ? Number(pairs[i + 1].value) : 0 })
    }
  }
  flush()

  if (out.length === 0) {
    throw new ImportError('DXF içinde CUT/CREASE katmanı bulunamadı')
  }
  return out
}
