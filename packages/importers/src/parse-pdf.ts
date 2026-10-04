import { inflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import type { Point } from '@diecut/core'
import { layerFromName, isGuideLayer, buildColorLayerMap, resolveLayer, type ImportLayer, type LayerHint } from './color-layer.ts'
import { parseRaster } from './parse-raster.ts'
import { ImportError, type ImportedPath } from './types.ts'

const PT_TO_MM = 25.4 / 72

interface PdfObject {
  id: number
  dict: string
  stream: Uint8Array | null
}

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')

const MAX_STREAM_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_INFLATED = 96 * 1024 * 1024

const extractObjects = (bytes: Uint8Array): PdfObject[] => {
  const text = latin1(bytes)
  const out: PdfObject[] = []
  let budget = MAX_TOTAL_INFLATED
  const re = /(\d+)\s+0\s+obj\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const id = Number(m[1])
    const start = m.index + m[0].length
    const endObj = text.indexOf('endobj', start)
    if (endObj < 0) continue
    const body = text.slice(start, endObj)
    const streamAt = body.search(/\bstream\r?\n/)
    if (streamAt < 0) {
      out.push({ id, dict: body, stream: null })
      continue
    }
    const dict = body.slice(0, streamAt)
    const streamHeader = body.slice(streamAt)
    const nl = streamHeader.indexOf('\n')
    const raw = streamHeader.slice(nl + 1).replace(/\r?\nendstream[\s\S]*$/, '')
    const streamBytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) streamBytes[i] = raw.charCodeAt(i) & 0xff
    const filtered = /\/Filter\s*\/FlateDecode/.test(dict) || /\/Filter\s*\[\s*\/FlateDecode/.test(dict)
    if (filtered) {
      try {
        // Sıkıştırma bombasına karşı: tek akış en fazla 32 MB, toplam en fazla 96 MB açılır.
        const stream = inflateSync(streamBytes, { maxOutputLength: Math.min(MAX_STREAM_BYTES, Math.max(1, budget)) })
        budget -= stream.length
        out.push({ id, dict, stream })
      } catch (error) {
        if (budget <= 0 || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
          throw new ImportError('PDF içeriği çok büyük', 'import_too_large')
        }
        out.push({ id, dict, stream: streamBytes })
      }
    } else {
      out.push({ id, dict, stream: streamBytes })
    }
  }
  return out
}

const ocgNameByRef = (objects: PdfObject[]): Map<number, string> => {
  const map = new Map<number, string>()
  for (const obj of objects) {
    if (!/\/Type\s*\/OCG/.test(obj.dict)) continue
    const name = /\/Name\s*\(([^)]*)\)/.exec(obj.dict)?.[1]
    if (name) map.set(obj.id, name)
  }
  return map
}

const ocAliasToLayer = (objects: PdfObject[]): { layers: Map<string, ImportLayer>; skip: Set<string> } => {
  const names = ocgNameByRef(objects)
  const layers = new Map<string, ImportLayer>()
  const skip = new Set<string>()
  for (const obj of objects) {
    const props = /\/Properties\s*<<([^>]*)>>/.exec(obj.dict)?.[1]
    if (!props) continue
    const re = /\/(OC\d+)\s+(\d+)\s+0\s+R/g
    let m: RegExpExecArray | null
    while ((m = re.exec(props))) {
      const ocName = names.get(Number(m[2])) ?? ''
      if (isGuideLayer(ocName)) {
        skip.add(m[1])
        continue
      }
      const layer = layerFromName(ocName)
      if (layer) layers.set(m[1], layer)
    }
  }
  return { layers, skip }
}

const tokenize = (src: string): (string | number | string[])[] => {
  const tokens: (string | number | string[])[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      i += 1
      continue
    }
    if (ch === '%') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (ch === '(') {
      i += 1
      while (i < src.length && src[i] !== ')') {
        if (src[i] === '\\') i += 2
        else i += 1
      }
      i += 1
      tokens.push('(str)')
      continue
    }
    if (ch === '[') {
      const inner: string[] = []
      i += 1
      let buf = ''
      while (i < src.length && src[i] !== ']') {
        const c = src[i]
        if (c === ' ' || c === '\n' || c === '\r') {
          if (buf) inner.push(buf)
          buf = ''
        } else buf += c
        i += 1
      }
      if (buf) inner.push(buf)
      i += 1
      tokens.push(inner)
      continue
    }
    if (ch === '/') {
      let w = '/'
      i += 1
      while (i < src.length && /[A-Za-z0-9_+-]/.test(src[i] ?? '')) {
        w += src[i]
        i += 1
      }
      tokens.push(w)
      continue
    }
    if (/[A-Za-z]/.test(ch ?? '')) {
      let w = ''
      while (i < src.length && /[A-Za-z0-9_*]/.test(src[i] ?? '')) {
        w += src[i]
        i += 1
      }
      tokens.push(w)
      continue
    }
    if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
      let w = ''
      while (i < src.length && /[0-9.+eE-]/.test(src[i] ?? '')) {
        w += src[i]
        i += 1
      }
      const n = Number(w)
      tokens.push(Number.isFinite(n) ? n : w)
      continue
    }
    i += 1
  }
  return tokens
}

const mul = (a: number[], b: number[]): number[] => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]

const apply = (m: number[], x: number, y: number): Point => ({
  x: (m[0] * x + m[2] * y + m[4]) * PT_TO_MM,
  y: (m[1] * x + m[3] * y + m[5]) * PT_TO_MM,
})

const flattenCubic = (p0: Point, p1: Point, p2: Point, p3: Point): Point[] => {
  const pts: Point[] = []
  for (let i = 1; i <= 8; i += 1) {
    const t = i / 8
    const u = 1 - t
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return pts
}

const parseContent = (stream: string, ocMap: Map<string, ImportLayer>, ocSkip: Set<string>): { points: Point[]; hint: LayerHint }[] => {
  const tokens = tokenize(stream)
  const stack: number[][] = []
  let ctm = [1, 0, 0, 1, 0, 0]
  let inText = false
  let ocLayer: ImportLayer | null = null
  let skipOc = false
  let dashed = false
  let strokeRgb: [number, number, number] | null = null
  let current: Point[] = []
  let subpaths: Point[][] = []
  const out: { points: Point[]; hint: LayerHint }[] = []

  const startSub = (pt: Point) => {
    if (current.length >= 2) subpaths.push(current)
    current = [pt]
  }

  const flushStroke = (close: boolean) => {
    if (current.length >= 2) subpaths.push(current)
    else if (close && current.length === 1 && subpaths.length === 0) subpaths.push(current)
    if (!skipOc) {
      const hint: LayerHint = { named: ocLayer, rgb: strokeRgb, dashed }
      for (const sp of subpaths) {
        if (sp.length < 2) continue
        const pts = close && sp.length > 2 ? [...sp, sp[0] as Point] : sp
        out.push({ points: pts, hint })
      }
    }
    current = []
    subpaths = []
  }

  const nums = (n: number, i: number): number[] => {
    const v: number[] = []
    for (let k = n; k >= 1; k -= 1) {
      const t = tokens[i - k]
      if (typeof t === 'number') v.push(t)
    }
    return v
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]
    if (typeof t !== 'string') continue
    if (t === 'BT') {
      inText = true
      continue
    }
    if (t === 'ET') {
      inText = false
      continue
    }
    if (inText) continue
    if (t === 'q') {
      stack.push(ctm.slice())
      continue
    }
    if (t === 'Q') {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      continue
    }
    if (t === 'cm') {
      const v = nums(6, i)
      if (v.length === 6) ctm = mul(ctm, v)
      continue
    }
    if (t === 'BDC') {
      const name = tokens[i - 1]
      if (typeof name === 'string') {
        const key = name.replace(/^\//, '')
        skipOc = ocSkip.has(key)
        ocLayer = ocMap.get(key) ?? null
      }
      continue
    }
    if (t === 'EMC') {
      ocLayer = null
      skipOc = false
      continue
    }
    if (t === 'd') {
      const arr = tokens[i - 2]
      dashed = Array.isArray(arr) && arr.length > 0
      continue
    }
    if (t === 'RG' || t === 'rg') {
      const v = nums(3, i)
      if (v.length === 3) strokeRgb = [v[0] * 255, v[1] * 255, v[2] * 255]
      continue
    }
    if (t === 'K' || t === 'k') {
      const v = nums(4, i)
      if (v.length === 4) {
        strokeRgb = [
          (1 - Math.min(1, v[0] + v[3])) * 255,
          (1 - Math.min(1, v[1] + v[3])) * 255,
          (1 - Math.min(1, v[2] + v[3])) * 255,
        ]
      }
      continue
    }
    if (t === 'SCN' || t === 'scn') {
      continue
    }
    if (t === 'm') {
      const v = nums(2, i)
      if (v.length === 2) startSub(apply(ctm, v[0], v[1]))
      continue
    }
    if (t === 'l') {
      const v = nums(2, i)
      if (v.length === 2 && current.length) current.push(apply(ctm, v[0], v[1]))
      continue
    }
    if (t === 'c') {
      const v = nums(6, i)
      if (v.length === 6 && current.length) {
        const p0 = current[current.length - 1] as Point
        const p1 = apply(ctm, v[0], v[1])
        const p2 = apply(ctm, v[2], v[3])
        const p3 = apply(ctm, v[4], v[5])
        current.push(...flattenCubic(p0, p1, p2, p3))
      }
      continue
    }
    if (t === 'h') {
      if (current.length > 2) current.push(current[0] as Point)
      continue
    }
    if (t === 're') {
      const v = nums(4, i)
      if (v.length === 4) {
        const a = apply(ctm, v[0], v[1])
        const b = apply(ctm, v[0] + v[2], v[1])
        const c = apply(ctm, v[0] + v[2], v[1] + v[3])
        const d = apply(ctm, v[0], v[1] + v[3])
        if (current.length >= 2) subpaths.push(current)
        current = [a, b, c, d, a]
      }
      continue
    }
    if (t === 'S' || t === 's' || t === 'B' || t === 'b') {
      flushStroke(t === 's' || t === 'b')
      continue
    }
    if (t === 'n' || t === 'f' || t === 'F' || t === 'f*') {
      current = []
      subpaths = []
    }
  }
  return out
}

const extractJpegs = (bytes: Uint8Array): Uint8Array[] => {
  const out: Uint8Array[] = []
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8) continue
    for (let j = i + 2; j < bytes.length - 1; j += 1) {
      if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
        const slice = bytes.slice(i, j + 2)
        if (slice.length > 400) out.push(slice)
        i = j + 1
        break
      }
    }
  }
  return out.sort((a, b) => b.length - a.length)
}

export const parsePdf = (bytes: Uint8Array, filename: string): ImportedPath[] => {
  const objects = extractObjects(bytes)
  const { layers: ocMap, skip: ocSkip } = ocAliasToLayer(objects)
  const pending: { points: Point[]; hint: LayerHint }[] = []
  for (const obj of objects) {
    if (!obj.stream) continue
    if (/\/Subtype\s*\/Image/.test(obj.dict)) continue
    const text = latin1(obj.stream)
    if (!/\bm\b/.test(text) && !/\bl\b/.test(text) && !/\bS\b/.test(text)) continue
    pending.push(...parseContent(text, ocMap, ocSkip))
  }
  const colorMap = buildColorLayerMap(pending.map((p) => p.hint))
  const useful = pending
    .map((p) => ({ layer: resolveLayer(p.hint, colorMap), points: p.points }))
    .filter((p) => p.layer === 'cut' || p.layer === 'crease' || p.layer === 'perf' || p.layer === 'cutcrease')
  const hasCut = useful.some((p) => p.layer === 'cut' || p.layer === 'cutcrease')
  const hasCrease = useful.some((p) => p.layer === 'crease' || p.layer === 'perf' || p.layer === 'cutcrease')
  if (hasCut && hasCrease) return useful

  const jpegs = extractJpegs(bytes)
  if (jpegs[0]) {
    try {
      return parseRaster(jpegs[0], filename.replace(/\.pdf$/i, '.jpg'))
    } catch {
      /* fall through */
    }
  }
  if (useful.length > 0) return useful
  throw new ImportError(
    'PDF’de kesim/kırım vektörü bulunamadı. CUT + CREASE katmanlı PDF, SVG, DXF veya kırmızı/yeşil PNG verin.',
  )
}
