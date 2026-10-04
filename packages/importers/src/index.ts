import { ImportError, type ImportedPath } from './types.ts'
import { parseDxf } from './parse-dxf.ts'
import { parsePdf } from './parse-pdf.ts'
import { parseRaster } from './parse-raster.ts'
import { parseEmbeddedDieline, parseSvg } from './parse-svg.ts'
import { reconstruct } from './reconstruct.ts'
import { isJpeg, isPng, isWebp } from './decode-raster.ts'
import type { Dieline } from '@diecut/core'

export { ImportError } from './types.ts'

const looksLikePdf = (bytes: Uint8Array): boolean => {
  const head = bytes.slice(0, 8)
  let s = ''
  for (let i = 0; i < head.length; i += 1) s += String.fromCharCode(head[i] ?? 0)
  return s.startsWith('%PDF')
}

export const importDieline = (source: string | Uint8Array, filename: string): Dieline => {
  const name = filename.toLowerCase()
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source
  const text = typeof source === 'string' ? source : new TextDecoder('utf8', { fatal: false }).decode(source)

  const embedded = parseEmbeddedDieline(text)
  if (embedded) return embedded

  let paths: ImportedPath[]
  if (looksLikePdf(bytes) || name.endsWith('.pdf')) {
    paths = parsePdf(bytes, filename)
  } else if (isPng(bytes) || isJpeg(bytes) || isWebp(bytes) || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    if (name.endsWith('.gif')) {
      throw new ImportError('GIF desteklenmiyor. PNG, JPG, SVG, DXF veya PDF yükleyin.')
    }
    paths = parseRaster(bytes, filename)
  } else if (name.endsWith('.dxf') || /SECTION[\s\S]*ENTITIES/i.test(text)) {
    paths = parseDxf(text)
  } else if (name.endsWith('.svg') || /<svg[\s>]/i.test(text)) {
    paths = parseSvg(text)
  } else {
    throw new ImportError('Desteklenen formatlar: SVG, DXF, PDF, PNG ve JPG (kırmızı kesim + yeşil/mavi kırım).')
  }

  const hasCut = paths.some((p) => p.layer === 'cut' || p.layer === 'cutcrease')
  const hasCrease = paths.some((p) => p.layer === 'crease' || p.layer === 'perf' || p.layer === 'cutcrease')
  if (!hasCut) {
    throw new ImportError('Kesim çizgisi bulunamadı. Dış hat ayrı renk, katı çizgi veya CUT katmanında olmalı.')
  }
  if (!hasCrease) {
    throw new ImportError(
      'Kırım çizgisi bulunamadı. Kesim ve kırım farklı renk, kesikli çizgi veya CUT/CREASE katmanı olsun.',
    )
  }
  return reconstruct(paths, filename.replace(/\.[^.]+$/, '') || 'import')
}
