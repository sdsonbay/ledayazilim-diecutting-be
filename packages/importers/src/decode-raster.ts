import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { ImportError } from './types.ts'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs') as { PNG: { sync: { read: (buf: Buffer) => PngDecoded } } }
const jpeg = require('jpeg-js') as { decode: (buf: Buffer, opts?: { maxMemoryUsageInMB?: number }) => JpegDecoded }

interface PngDecoded {
  width: number
  height: number
  data: Buffer
  phys?: { unit: number; x: number; y: number }
}

interface JpegDecoded {
  width: number
  height: number
  data: Buffer | Uint8Array
}

export interface RasterPixels {
  width: number
  height: number
  data: Uint8Array
  mmPerPx: number
}

export const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47

export const isJpeg = (bytes: Uint8Array): boolean => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8

export const isWebp = (bytes: Uint8Array): boolean => {
  if (bytes.length < 12) return false
  const tag = String.fromCharCode(...bytes.slice(0, 4), ...bytes.slice(8, 12))
  return tag.startsWith('RIFF') && tag.endsWith('WEBP')
}

/** Çözülecek en büyük görsel (RGBA ≈ 100 MB). */
const MAX_PIXELS = 25_000_000

export const decodeRaster = (bytes: Uint8Array, filename: string): RasterPixels => {
  const name = filename.toLowerCase()
  if (isWebp(bytes) || name.endsWith('.webp')) {
    throw new ImportError('WebP çözümlenemiyor. Aynı kalıbı PNG veya JPG olarak kaydedip yükleyin.')
  }
  try {
    if (isPng(bytes) || name.endsWith('.png')) {
      // Küçük dosyada dev boyut (sıkıştırma bombası): çözmeden önce IHDR'den piksel sayısına bak.
      if (isPng(bytes) && bytes.length >= 24) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        if (view.getUint32(16) * view.getUint32(20) > MAX_PIXELS) {
          throw new ImportError('Görsel çok büyük (en fazla 25 megapiksel).', 'import_too_large')
        }
      }
      const png = PNG.sync.read(Buffer.from(bytes))
      let mmPerPx = 0
      if (png.phys?.unit === 1 && png.phys.x > 0) mmPerPx = 1000 / png.phys.x
      return { width: png.width, height: png.height, data: new Uint8Array(png.data), mmPerPx }
    }
    if (isJpeg(bytes) || /\.jpe?g$/.test(name)) {
      const jpg = jpeg.decode(Buffer.from(bytes), { maxMemoryUsageInMB: 96 })
      return { width: jpg.width, height: jpg.height, data: new Uint8Array(jpg.data), mmPerPx: 0 }
    }
  } catch (error) {
    if (error instanceof ImportError) throw error
    throw new ImportError('Görsel okunamadı. PNG veya JPG verin; çizgiler kırmızı kesim / yeşil veya mavi kırım olsun.')
  }
  throw new ImportError('Desteklenen görseller: PNG ve JPG.')
}
