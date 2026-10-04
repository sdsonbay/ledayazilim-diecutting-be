import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BAG_SPECS, TWO_PIECE_SPECS, bagTemplates, dctCoverage, generateDieline, resolveCatalog, twoPieceTemplates } from '../src/index.ts'

test('iki parçalı tepsi: taban + kapak aynı kalıpta, kapak taban dış ölçüsüne göre büyük', () => {
  const d = generateDieline('ecma-b48-02-set', { length: 200, width: 100, height: 40, caliper: 0.5, fitClearance: 1 })
  const base = d.panels.find((p) => p.id === 'base-base')!
  const lid = d.panels.find((p) => p.id === 'lid-base')!
  const w = (o: typeof base.outline) => Math.max(...o.map((q) => q.x)) - Math.min(...o.map((q) => q.x))
  assert.ok(Math.abs(w(base.outline) - 200) < 1e-6)
  assert.ok(Math.abs(w(lid.outline) - 202) < 1e-6, `kapak iç uzunluğu ${w(lid.outline)}`)
  assert.equal(d.rootPanel, 'base-base')
  const link = d.folds.find((f) => f.parent === 'base-base' && f.child === 'lid-base')
  assert.ok(link && link.angle === 0)
  // Parça seçimi
  assert.ok(generateDieline('ecma-b48-02-set', { piece: 'lid' }).panels.every((p) => !p.id.startsWith('base-')))
  assert.ok(generateDieline('ecma-b48-02-set', { piece: 'base' }).panels.every((p) => !p.id.startsWith('lid-')))
})

test('iki parçalı ve çanta şablonları uç ölçülerde hatasız', () => {
  for (const t of [...twoPieceTemplates, ...bagTemplates]) {
    for (const input of [{}, { length: 60, width: 30, height: 30 }, { length: 400, width: 200, height: 300 }]) {
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((w) => w.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code).join(',')}`)
    }
  }
})

test('karton çanta: 4 gövde + takviye bandı, pinch taban körükleri, ip delikleri', () => {
  const d = generateDieline('bag-cord-handle')
  assert.equal(d.panels.filter((p) => p.id.endsWith('-hem')).length, 4)
  assert.equal(d.panels.filter((p) => p.role === 'gusset').length, 2)
  assert.equal(d.paths.filter((p) => p.note?.startsWith('ip deliği')).length, 8)
  const plain = generateDieline('bag-plain')
  assert.equal(plain.paths.filter((p) => p.note?.includes('deliği') || p.note?.includes('kulp')).length, 0)
  const die = generateDieline('bag-diecut-handle')
  assert.equal(die.paths.filter((p) => p.note?.startsWith('kesme kulp')).length, 4)
})

test('gömlek ve çanta grupları DCT kapsamı tam', () => {
  const groups = dctCoverage().groups
  for (const g of ['shirt-boxes', 'carton-bags-pillows']) {
    const c = groups.find((x) => x.material === 'carton' && x.group === g)!
    assert.equal(c.covered, c.total, `${g}: eksik ${c.missing.join(',')}`)
  }
  assert.equal(resolveCatalog('becf-12401').template.id, 'ecma-b31-21')
  assert.equal(resolveCatalog('becf-12105').template.id, 'ecma-a50-20')
  assert.equal(resolveCatalog('becf-1210b').template.id, 'bag-diecut-handle')
  assert.ok(TWO_PIECE_SPECS.length >= 2 && BAG_SPECS.length === 3)
})
