import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateDieline } from '@diecut/templates'
import { dielineFromPayload, imposeDieline, parseImposeOptions } from '../src/impose.ts'

test('B0 tabakaya tuck kutusu tam dolar ve 90° adayı da hesaplanır', () => {
  const source = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 150,
    glueFlap: 15,
    caliper: 0.4,
    bleed: 0,
  })
  const result = imposeDieline(
    source,
    parseImposeOptions({
      sheetWidth: 1000,
      sheetHeight: 1414,
      marginGripper: 15,
      marginTail: 5,
      marginSide: 5,
      gapX: 0,
      gapY: 0,
      fullSheet: true,
      rotation: 'auto',
    }),
  )
  assert.ok(result.layout.copies >= 12, `beklenen dolu tabaka, gelen ${result.layout.copies}`)
  assert.equal(result.layout.copies, result.layout.placements.length)
  assert.ok(result.layout.copies >= result.layout.cols * result.layout.rows)
  assert.equal(result.layout.alternatives.length, 2)
  assert.ok(result.layout.alternatives.some((a) => a.rotation === 0))
  assert.ok(result.layout.alternatives.some((a) => a.rotation === 90))
  assert.equal(result.dieline.bounds.width, 1000)
  assert.equal(result.dieline.bounds.height, 1414)
  const cuts = result.dieline.paths.filter((p) => p.layer === 'cut')
  assert.ok(cuts.length >= result.layout.copies)
  assert.equal(result.layout.cutLength, source.stats.cutLength * result.layout.copies)
})

test('kenar payı tabakadan büyükse hata verir', () => {
  const source = generateDieline('ecma-a20-20')
  assert.throws(
    () =>
      imposeDieline(
        source,
        parseImposeOptions({
          sheetWidth: 200,
          sheetHeight: 200,
          marginSide: 120,
          marginGripper: 15,
          marginTail: 5,
          autoFitSheet: false,
        }),
      ),
    /Kenar payları/,
  )
})

test('kopya sayısı tam tabakadan az olabilir', () => {
  const source = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150 })
  const full = imposeDieline(source, parseImposeOptions({ fullSheet: true, sheetWidth: 1000, sheetHeight: 1414 }))
  const partial = imposeDieline(
    source,
    parseImposeOptions({
      fullSheet: false,
      copies: 3,
      sheetWidth: 1000,
      sheetHeight: 1414,
    }),
  )
  assert.equal(partial.layout.copies, 3)
  assert.ok(full.layout.copies > 3)
  const nestedCuts = partial.dieline.paths.filter((p) => p.layer === 'cut' && p.id !== 'sheet-outline')
  assert.ok(nestedCuts.length > 0)
})

test('B0’a sığmayan koli otomatik daha büyük tabakaya geçer', () => {
  const source = generateDieline('fefco-0201', {
    length: 600,
    width: 400,
    height: 350,
    caliper: 3,
    jointFlap: 35,
    dimensionBasis: 'outside',
  })
  const tooSmall = imposeDieline(
    source,
    parseImposeOptions({
      sheetWidth: 1000,
      sheetHeight: 1414,
      autoFitSheet: false,
    }),
  )
  assert.equal(tooSmall.layout.copies, 0)
  const fitted = imposeDieline(source, parseImposeOptions({ sheetWidth: 1000, sheetHeight: 1414 }))
  assert.ok(fitted.layout.copies >= 1, `sığması beklenirdi, ${source.bounds.width}x${source.bounds.height}`)
  assert.equal(fitted.layout.sheetAdjusted, true)
  assert.ok(fitted.layout.sheet.width >= source.bounds.width || fitted.layout.sheet.width >= source.bounds.height)
})

test('gönderilen dieline payload’ından yerleştirme üretir', () => {
  const source = generateDieline('ecma-a20-20', { length: 80, width: 40, height: 100 })
  const hydrated = dielineFromPayload({
    templateId: source.templateId,
    bounds: source.bounds,
    paths: source.paths,
    stats: source.stats,
    meta: source.meta,
  })
  const result = imposeDieline(hydrated, parseImposeOptions({ fullSheet: true }))
  assert.ok(result.layout.copies >= 1)
})

test('otomatik dizgi kalan şeride 90° kopya ekler', () => {
  const source = dielineFromPayload({
    templateId: 'rect',
    bounds: { x: 0, y: 0, width: 694.8, height: 250 },
    paths: [
      {
        id: 'cut',
        layer: 'cut',
        commands: [
          { c: 'M', x: 0, y: 0 },
          { c: 'L', x: 694.8, y: 0 },
          { c: 'L', x: 694.8, y: 250 },
          { c: 'L', x: 0, y: 250 },
          { c: 'Z' },
        ],
      },
    ],
    stats: {
      cutLength: 1889.6,
      creaseLength: 0,
      perfLength: 0,
      flatWidth: 694.8,
      flatHeight: 250,
      area: 173700,
      boundingArea: 173700,
      utilisation: 1,
    },
    meta: { name: { tr: 'dikdörtgen', en: 'rect' }, caliper: 0.4 },
  })
  const opts = {
    sheetWidth: 1010,
    sheetHeight: 1409,
    marginGripper: 15,
    marginTail: 5,
    marginSide: 5,
    fullSheet: true,
  }
  const only0 = imposeDieline(source, parseImposeOptions({ ...opts, rotation: 0 }))
  const only90 = imposeDieline(source, parseImposeOptions({ ...opts, rotation: 90 }))
  const mixed = imposeDieline(source, parseImposeOptions({ ...opts, rotation: 'auto' }))
  assert.equal(only0.layout.copies, 5)
  assert.equal(only90.layout.copies, 4)
  assert.ok(mixed.layout.copies > only0.layout.copies, `karışık ${mixed.layout.copies} > 0° ${only0.layout.copies}`)
  assert.ok(mixed.layout.copies > only90.layout.copies, `karışık ${mixed.layout.copies} > 90° ${only90.layout.copies}`)
  assert.ok(mixed.layout.mixedCopies >= 1)
  assert.ok(mixed.layout.placements.some((p) => p.rotation === 0))
  assert.ok(mixed.layout.placements.some((p) => p.rotation === 90))
})
