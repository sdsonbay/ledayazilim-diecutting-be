import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOLDER_SPECS, dctCoverage, folderTemplates, generateDieline, resolveCatalog } from '../src/index.ts'

test('klasör / zarf şablonları varsayılan ve uç ölçülerde hatasız', () => {
  for (const t of folderTemplates) {
    const w = t.params.find((p) => p.key === 'width')!
    if (w.kind !== 'number') throw new Error('width sayısal olmalı')
    for (const input of [{}, { length: 80, width: Math.max(w.min, 60) }, { length: 400, width: Math.min(w.max, 350) }]) {
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((x) => x.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code).join(',')}`)
      assert.ok(d.panels.length >= 3, `${t.id}: panel sayısı`)
    }
  }
})

test('cepli klasör: sırt, cep, kulak ve kartvizit yarıkları', () => {
  const d = generateDieline('folder-pocket-corner-spine', { length: 165, width: 180, spine: 5, pocketDepth: 60 })
  assert.ok(d.panels.some((p) => p.id === 'spine'))
  const pocket = d.panels.find((p) => p.id === 'left-pocket')!
  assert.ok(pocket && Math.min(...pocket.outline.map((q) => q.y)) < -59)
  assert.ok(d.panels.some((p) => p.id === 'left-pocket-tab' && p.role === 'glue'))
  assert.equal(d.paths.filter((p) => p.note === 'kartvizit yarığı').length, 4)
  // Sırtsız çift cep: cepler tek yarıkla ayrılır, çift bıçak yok
  const dbl = generateDieline('folder-pocket-double')
  assert.equal(dbl.paths.filter((p) => p.note === 'cep ayırma yarığı').length, 1)
  assert.equal(dbl.paths.filter((p) => p.note === 'kartvizit yarığı').length, 8)
})

test('üst kıvrımlı kart klasörü: kapasite + dudak panelleri 180° içe', () => {
  const d = generateDieline('folder-lip-both')
  assert.ok(d.panels.some((p) => p.id === 'left-lip') && d.panels.some((p) => p.id === 'right-lip'))
  const capFold = d.folds.find((f) => f.child === 'left-cap')!
  assert.equal(capFold.parent, 'left')
  const single = generateDieline('folder-lip-left')
  assert.ok(!single.panels.some((p) => p.id === 'right-lip'))
})

test('kilit dilli üç panelli kart: iki dil + iki yarık', () => {
  const d = generateDieline('folder-trifold-lock')
  assert.equal(d.panels.filter((p) => p.role === 'lock').length, 2)
  assert.equal(d.paths.filter((p) => p.note === 'kilit yarığı').length, 2)
  const plain = generateDieline('folder-trifold', { length: 90, width: 50, height: 70 })
  assert.equal(plain.panels.length, 3)
  assert.equal(plain.rootPanel, 'back')
})

test('zarflar: körüklü CD zarfında dil yarığı, cep zarfında yan kulaklar, kartlıkta oyuk + yarık', () => {
  const cd = generateDieline('envelope-gusset-cd', { length: 150, width: 20, height: 150, lidDepth: 45 })
  assert.equal(cd.paths.filter((p) => p.note === 'dil yarığı').length, 1)
  assert.equal(cd.panels.filter((p) => p.role === 'gusset').length, 3)
  const pocket = generateDieline('ecma-f60-93')
  assert.equal(pocket.panels.filter((p) => p.role === 'glue').length, 2)
  const holder = generateDieline('ecma-f80-53')
  assert.equal(holder.paths.filter((p) => p.note === 'kart yarığı').length, 1)
  const left = holder.panels.find((p) => p.id === 'left')!
  assert.ok(left.outline.length > 4, 'başparmak oyuğu panel dış hattına işlenir')
  const exp = generateDieline('envelope-expanding', { length: 320, width: 240, height: 20 })
  const front = exp.panels.find((p) => p.id === 'front')!
  assert.ok(Math.min(...front.outline.map((q) => q.x)) >= 340 - 1e-6)
})

test('klasör ve zarf grupları DCT kapsamı tam', () => {
  const groups = dctCoverage().groups
  for (const g of ['folders', 'envelopes']) {
    const c = groups.find((x) => x.material === 'carton' && x.group === g)!
    assert.equal(c.covered, c.total, `${g}: eksik ${c.missing.join(',')}`)
  }
  assert.equal(resolveCatalog('becf-12b05').template.id, 'ecma-e40-82')
  assert.equal(resolveCatalog('becf-12c04').template.id, 'ecma-f80-53')
  assert.equal(FOLDER_SPECS.length, 18)
})
