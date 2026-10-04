import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DCT_INVENTORY, FOOD_SPECS, dctCoverage, foodTemplates, generateDieline, listTemplates, resolveCatalog } from '../src/index.ts'

test('gıda spec’leri geçerli DCT kayıtlarına bağlanır', () => {
  const inventory = new Map(DCT_INVENTORY.map((e) => [e.id, e]))
  for (const spec of FOOD_SPECS) {
    for (const dct of spec.dct) assert.ok(inventory.has(dct), `${spec.id}: ${dct}`)
    assert.equal(inventory.get(spec.dct[0]!)?.group, spec.category)
  }
})

test('tüm gıda şablonları varsayılan + uç ölçülerle hatasız üretilir', () => {
  const alt: Record<string, Record<string, number>[]> = {
    'food-cup-wrap': [{ topDiameter: 60, bottomDiameter: 40, height: 80 }, { topDiameter: 120, bottomDiameter: 120, height: 90, petals: 0 }],
    'food-sandwich-wedge': [{ length: 60, width: 40, frontHeight: 20, backHeight: 60 }, { length: 250, width: 120, frontHeight: 50, backHeight: 160 }],
  }
  for (const t of foodTemplates) {
    const inputs = alt[t.id] ?? [{ length: 60, width: 40, height: 50 }, { length: 300, width: 200, height: 120 }]
    for (const input of [{}, ...inputs]) {
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((w) => w.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code).join(',')}`)
      assert.ok(d.panels.length >= 2, `${t.id}: panel`)
    }
  }
})

test('konik kutu: kapak üst ağız kadar geniş, duvar açısı 90°’den küçük', () => {
  const d = generateDieline('food-tapered-lid', { length: 160, width: 70, height: 190, splay: 15 })
  const lid = d.panels.find((p) => p.id === 'lid')!
  const xs = lid.outline.map((q) => q.x)
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 190) < 1e-6)
  const front = d.folds.find((f) => f.child === 'front')!
  assert.ok(Math.abs(front.angle) < 90 && Math.abs(front.angle) > 80)
  assert.equal(d.panels.filter((p) => p.id.startsWith('corner-')).length, 4)
})

test('bardak sargısı: yay şerit + yapıştırma dili + 5 yaprak', () => {
  const d = generateDieline('food-cup-wrap')
  assert.equal(d.panels.filter((p) => p.id.startsWith('petal-')).length, 5)
  assert.ok(d.panels.some((p) => p.id === 'glue-tab'))
  assert.ok(d.bounds.width > 300, `açınım genişliği ${d.bounds.width}`)
})

test('körüklü taşıma kutusu: dar panellerde 4 körük, önde üst/alt dil', () => {
  const d = generateDieline('food-gusset-carton')
  assert.equal(d.panels.filter((p) => p.role === 'gusset').length, 4)
  assert.ok(d.panels.some((p) => p.id === 'front-top-tuck') && d.panels.some((p) => p.id === 'front-bottom-tuck'))
  assert.equal(d.panels.filter((p) => p.id.endsWith('-gusset-l') || p.id.endsWith('-gusset-r')).length, 8)
})

test('gıda grubu DCT kapsamı: 24 kaydın hepsi bir şablona bağlı', () => {
  const g = dctCoverage().groups.find((x) => x.material === 'carton' && x.group === 'food-boxes')!
  assert.equal(g.total, 24)
  assert.equal(g.covered, 24, `eksik: ${g.missing.join(',')}`)
  assert.equal(resolveCatalog('becf-12013').template.id, 'food-fry-scoop')
  assert.equal(resolveCatalog('becf-12005').template.id, 'ecma-b49-10')
  assert.ok(listTemplates({ includeLegacy: true }).some((t) => t.id === 'food-sandwich-wedge'))
})
