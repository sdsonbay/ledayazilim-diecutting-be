import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateDieline } from '@diecut/templates'
import { toDxf, toPdf, toSvg } from '../src/index.ts'

const dieline = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150 })

test('SVG çıktısı geçerli ve katmanlara ayrılmış', () => {
  const svg = toSvg(dieline, { showPanelLabels: true })
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(svg, /<\/svg>$/)
  assert.match(svg, /id="layer-cut"/)
  assert.match(svg, /id="layer-crease"/)
  // Ölçü birimi mm olmalı, aksi halde tarayıcı piksel varsayar.
  assert.match(svg, /width="\d+(\.\d+)?mm"/)
})

test('katalog önizlemesi siyah zemin ve kırmızı kesim kullanır', () => {
  const svg = toSvg(dieline, { preview: true })
  assert.match(svg, /fill="#0b0b0b"/)
  assert.match(svg, /stroke="#ff2d2d"/)
  assert.match(svg, /stroke="#3dce6a"/)
  assert.doesNotMatch(/<g id="layer-crease"[^>]*>/.exec(svg)?.[0] ?? '', /stroke-dasharray/)
  assert.match(svg, /width="100%"/)
  assert.doesNotMatch(svg, /width="\d+(\.\d+)?mm"/)
  assert.doesNotMatch(svg, /ledabasim-diecut/)
})

test('açık tema önizlemesi beyaz zemin kullanır', () => {
  const svg = toSvg(dieline, { preview: true, previewTheme: 'light' })
  assert.match(svg, /fill="#ffffff"/)
  assert.match(svg, /stroke="#c1121f"/)
  assert.match(svg, /stroke="#1a9c4b"/)
})

test('üretim SVG’sinde kırım yeşil ve düz çizgidir', () => {
  const svg = toSvg(dieline)
  const crease = /<g id="layer-crease"[^>]*>/.exec(svg)?.[0] ?? ''
  assert.match(crease, /stroke="#00A651"/)
  assert.doesNotMatch(crease, /stroke-dasharray/)
  const cut = /<g id="layer-cut"[^>]*>/.exec(svg)?.[0] ?? ''
  assert.match(cut, /stroke="#E4002B"/)
})

test('üretim SVG’si katlama modelini gömer', () => {
  const svg = toSvg(dieline, { includeGuides: true, showPanelLabels: true })
  assert.match(svg, /id="ledabasim-diecut"/)
})

test('DXF R12 başlığı, katman tablosu ve varlıkları içeriyor', () => {
  const dxf = toDxf(dieline)
  assert.match(dxf, /AC1009/)
  assert.match(dxf, /\nLAYER\n2\nCUT\n/)
  assert.match(dxf, /\nLAYER\n2\nCREASE\n/)
  assert.match(dxf, /\nPOLYLINE\n/)
  assert.match(dxf, /\nEOF\n$/)
  // Yardımcı katmanlar varsayılan olarak kalıp dosyasına girmemeli.
  assert.doesNotMatch(dxf, /\nLAYER\n2\nBLEED\n/)
})

test('PDF geçerli başlık, xref ve spot renk tanımı içeriyor', () => {
  const bytes = toPdf(dieline, { producedBy: 'Ledabasim' })
  const text = Buffer.from(bytes).toString('latin1')
  assert.match(text, /^%PDF-1\.7/)
  assert.match(text, /%%EOF\n$/)
  assert.match(text, /\/Separation \/CutContour \/DeviceCMYK/)
  assert.match(text, /\/Type \/OCG/)

  // xref tablosundaki ilk nesne konumu gerçekten "1 0 obj" olmalı.
  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1])
  assert.ok(Number.isFinite(startxref))
  // xref bölümü: "xref", "0 N", serbest giriş, sonra 1 numaralı nesnenin girişi.
  const firstOffset = Number(text.slice(startxref).split('\n')[3]?.slice(0, 10))
  assert.equal(text.slice(firstOffset, firstOffset + 7), '1 0 obj')
})

test('yay içeren geometri düzleştirilerek DXF ve PDF’e aktarılıyor', () => {
  const withNotch = generateDieline('ecma-a20-20', { thumbNotch: true, thumbNotchRadius: 15 })
  const withoutNotch = generateDieline('ecma-a20-20', { thumbNotch: false })
  assert.ok(toDxf(withNotch).length > toDxf(withoutNotch).length)
  assert.ok(toPdf(withNotch).length > 0)
})
