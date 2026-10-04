import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { generateDieline } from '@diecut/templates'
import { toDxf, toPdf, toSvg } from '@diecut/exporters'
import { ImportError, importDieline } from '../src/index.ts'

const require = createRequire(import.meta.url)
const pngjs = require('pngjs') as {
  PNG: { new (opts: { width: number; height: number }): { width: number; height: number; data: Buffer }; sync: { write: (png: { data: Buffer; width: number; height: number }) => Buffer } }
}
const { PNG } = pngjs

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const setPx = (png: { data: Buffer; width: number }, x: number, y: number, r: number, g: number, b: number) => {
  const i = (y * png.width + x) * 4
  png.data[i] = r
  png.data[i + 1] = g
  png.data[i + 2] = b
  png.data[i + 3] = 255
}

const hLine = (png: { data: Buffer; width: number }, x0: number, x1: number, y: number, rgb: [number, number, number]) => {
  for (let x = x0; x <= x1; x += 1) setPx(png, x, y, ...rgb)
}

const vLine = (png: { data: Buffer; width: number }, x: number, y0: number, y1: number, rgb: [number, number, number]) => {
  for (let y = y0; y <= y1; y += 1) setPx(png, x, y, ...rgb)
}

const boxPng = (): Uint8Array => {
  const png = new PNG({ width: 240, height: 140 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0
    png.data[i + 1] = 0
    png.data[i + 2] = 0
    png.data[i + 3] = 255
  }
  const red: [number, number, number] = [255, 45, 45]
  const green: [number, number, number] = [61, 206, 106]
  hLine(png, 10, 220, 120, red)
  vLine(png, 10, 50, 120, red)
  vLine(png, 220, 50, 120, red)
  hLine(png, 10, 220, 50, green)
  vLine(png, 50, 50, 120, green)
  vLine(png, 120, 50, 120, green)
  vLine(png, 150, 50, 120, green)
  vLine(png, 200, 50, 120, green)
  return new Uint8Array(pngjs.PNG.sync.write(png))
}

test('platformdan indirilen SVG aynı katlama ağacını geri verir', () => {
  const source = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150 })
  const svg = toSvg(source, { includeGuides: true, showPanelLabels: true, locale: 'tr' })
  const imported = importDieline(svg, 'tuck.svg')
  assert.equal(imported.panels.length, source.panels.length)
  assert.equal(imported.folds.length, source.folds.length)
  assert.equal(imported.rootPanel, source.rootPanel)
})

test('gömülü modeli silinmiş SVG’de yardımcı katmanlar kırım ağacını bozmaz', () => {
  const source = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150 })
  const svg = toSvg(source, { includeGuides: true, showPanelLabels: true, locale: 'tr' }).replace(
    /<script[\s\S]*?<\/script>/i,
    '',
  )
  const imported = importDieline(svg, 'tuck-stripped.svg')
  assert.ok(imported.folds.length >= 3, `fold ${imported.folds.length}`)
  assert.ok(imported.panels.length >= 4, `panel ${imported.panels.length}`)
})

test('kendi DXF exportumuzu import edince kırım üretir', () => {
  const source = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150 })
  const dxf = toDxf(source, { includeGuides: false })
  const imported = importDieline(dxf, 'tuck.dxf')
  assert.ok(imported.panels.length >= 4, `panel ${imported.panels.length}`)
  assert.ok(imported.folds.length >= 3, `fold ${imported.folds.length}`)
})

test('kendi PDF exportumuzu import edince kırım üretir', () => {
  const source = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150 })
  const pdf = toPdf(source, { includeGuides: false, infoBlock: false })
  const imported = importDieline(pdf, 'tuck.pdf')
  assert.ok(imported.panels.length >= 4, `panel ${imported.panels.length}`)
  assert.ok(imported.folds.length >= 3, `fold ${imported.folds.length}`)
})

test('kırmızı/yeşil PNG’den panel ve kırım çıkar', () => {
  const imported = importDieline(boxPng(), 'box.png')
  assert.ok(imported.panels.length >= 4, `panel ${imported.panels.length}`)
  assert.ok(imported.folds.length >= 3, `fold ${imported.folds.length}`)
})

test('magenta/cyan ve turuncu/teal SVG katmansız da kırım üretir', () => {
  const box = (cut: string, crease: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <g transform="scale(1,-1)">
    <path stroke="${cut}" fill="none" d="M0 0 L100 0 L100 60 L0 60 Z"/>
    <path stroke="${crease}" fill="none" d="M40 0 L40 60"/>
    <path stroke="${crease}" fill="none" d="M0 30 L100 30"/>
  </g>
</svg>`
  for (const [a, b] of [
    ['#ff00aa', '#00c8c8'],
    ['#ff8800', '#008080'],
    ['magenta', 'cyan'],
  ] as const) {
    const imported = importDieline(box(a, b), 'custom.svg')
    assert.ok(imported.folds.length >= 1, `${a}/${b} fold ${imported.folds.length}`)
    assert.ok(imported.panels.length >= 2, `${a}/${b} panel ${imported.panels.length}`)
  }
})

test('Illustrator CSS sınıflı SVG (cls-1 yeşil kırım, cls-3 kırmızı kesim) kırım üretir', () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">
  <defs>
    <style>
      .cls-1 { stroke: #00a651; stroke-width: 2px; }
      .cls-1, .cls-2, .cls-3 { fill: none; }
      .cls-1, .cls-3 { stroke-miterlimit: 10; }
      .cls-3 { stroke: #ec2327; }
    </style>
  </defs>
  <g>
    <line class="cls-1" x1="50" y1="20" x2="50" y2="100"/>
    <line class="cls-1" x1="120" y1="20" x2="120" y2="100"/>
    <line class="cls-3" x1="10" y1="20" x2="180" y2="20"/>
    <line class="cls-3" x1="10" y1="100" x2="180" y2="100"/>
    <line class="cls-3" x1="10" y1="20" x2="10" y2="100"/>
    <line class="cls-3" x1="180" y1="20" x2="180" y2="100"/>
  </g>
  <path class="cls-2" d="M5 15 V105 H185 V15 Z"/>
</svg>`
  const imported = importDieline(svg, 'illustrator-classes.svg')
  assert.ok(imported.folds.length >= 1, `fold ${imported.folds.length}`)
  assert.ok(imported.panels.length >= 2, `panel ${imported.panels.length}`)
})

test('Illustrator CSS sınıflı gerçek bıçak izi kırım üretir', () => {
  const svg = readFileSync(join(fixtures, 'illustrator-cls-stroke.svg'), 'utf8')
  const imported = importDieline(svg, 'calango.svg')
  assert.ok(imported.folds.length >= 1, `fold ${imported.folds.length}`)
  assert.ok(imported.panels.length >= 4, `panel ${imported.panels.length}`)
})

test('kesikli siyah kırım, sürekli siyah kesim olarak okunur', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <g transform="scale(1,-1)">
    <path stroke="#111" fill="none" d="M0 0 L100 0 L100 60 L0 60 Z"/>
    <path stroke="#111" fill="none" stroke-dasharray="3 2" d="M40 0 L40 60"/>
  </g>
</svg>`
  const imported = importDieline(svg, 'dashed.svg')
  assert.ok(imported.folds.length >= 1, `fold ${imported.folds.length}`)
})

test('katalog tarzı önizleme PNG’si panellere ayrılır', () => {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'preview-dieline.png')))
  const imported = importDieline(bytes, 'preview-dieline.png')
  assert.ok(imported.panels.length >= 4, `panel ${imported.panels.length}`)
  assert.ok(imported.folds.length >= 3, `fold ${imported.folds.length}`)
})

test('stüdyo tepsi SVG’sinde iç delik ve kenar oyuğu 3D panele işlenir', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="300mm" viewBox="0 0 420 300">
  <g id="layer-cut" data-layer="CUT" fill="none" stroke="#ff2d2d" stroke-width="0.5">
    <path d="M60 60 L180 60 L180 20 L220 20 L220 140 L180 140 L180 180 L60 180 L60 140 L20 140 L20 60 L60 60 Z"/>
    <path d="M95 85 L145 85 L145 115 L95 115 Z"/>
    <path d="M110 168 L150 168 L150 192 L110 192 Z"/>
  </g>
  <g id="layer-crease" data-layer="CREASE" fill="none" stroke="#00a651" stroke-width="0.4">
    <path d="M60 60 L180 60"/>
    <path d="M180 60 L180 140"/>
    <path d="M180 140 L60 140"/>
    <path d="M60 140 L60 60"/>
  </g>
</svg>`
  const imported = importDieline(svg, 'studio-tray.svg')
  assert.ok(imported.panels.length >= 2, `panel ${imported.panels.length}`)
  const withHole = imported.panels.find((p) => (p.holes?.length ?? 0) > 0)
  assert.ok(withHole, 'kapalı delik 3D panele işlenmeli')
  const notched = imported.panels.find((p) => {
    const ys = p.outline.map((pt) => pt.y)
    const maxY = Math.max(...ys)
    const dip = Math.min(...p.outline.filter((pt) => pt.y > maxY - 24).map((pt) => pt.y))
    return maxY - dip > 3 && p.outline.length > 4
  })
  assert.ok(notched, 'kenar oyuğu 3D dış hatta işlenmeli')
})

test('bozuk PNG hata verir', () => {
  assert.throws(() => importDieline(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'x.png'), ImportError)
})

test('boş PDF hata verir', () => {
  assert.throws(() => importDieline('%PDF-1.4\n%%EOF\n', 'x.pdf'), ImportError)
})

test('yazı plakası PDF: tüm paneller katlama ağacına bağlanır', () => {
  const pdf = readFileSync(join(fixtures, 'yaziplakasi-1-bck.pdf'))
  const imported = importDieline(pdf, 'yaziplakasi-1-bck.pdf')
  assert.equal(imported.warnings.length, 0, `warnings ${imported.warnings.map((w) => w.code).join(',')}`)
  assert.ok(imported.panels.length >= 12, `panel ${imported.panels.length}`)
  assert.equal(imported.folds.length, imported.panels.length - 1, `fold ${imported.folds.length}`)
  const childIds = new Set(imported.folds.map((f) => f.child))
  assert.equal(childIds.size, imported.panels.length - 1, 'tüm paneller katlama ağacında olmalı')

  const leftWall = imported.panels.find((p) => {
    const xs = p.outline.map((q) => q.x)
    const ys = p.outline.map((q) => q.y)
    return Math.max(...xs) <= 58 && Math.min(...ys) >= 50 && Math.max(...ys) <= 135 && p.role === 'wall'
  })
  assert.ok(leftWall, 'sol duvar paneli bulunmalı')
  const leftFlapChildren = imported.folds
    .filter((f) => f.parent === leftWall!.id)
    .map((f) => imported.panels.find((p) => p.id === f.child))
    .filter(Boolean)
  assert.equal(leftFlapChildren.length, 2, 'sol duvar üst + alt kanat')
  for (const flap of leftFlapChildren) {
    assert.ok(['flap', 'dust', 'lid'].includes(flap!.role), `${flap!.id} rolü ${flap!.role}`)
    const ys = flap!.outline.map((q) => q.y)
    assert.ok(Math.min(...ys) < 55 || Math.max(...ys) > 130, `${flap!.id} üst veya alt kanat olmalı`)
  }
})
