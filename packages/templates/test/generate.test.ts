import assert from 'node:assert/strict'
import { test } from 'node:test'
import { signedFoldAngle } from '@diecut/core'
import { catalogTree, generateDieline, getTemplate, listTemplates, resolveParams, templates, usedGroups } from '../src/index.ts'

test('katalogdaki her template varsayılan parametrelerle üretilebiliyor', () => {
  for (const template of templates) {
    const dieline = generateDieline(template.id)
    assert.ok(dieline.paths.length > 0, `${template.id}: yol üretilmedi`)
    assert.ok(dieline.panels.length > 0, `${template.id}: panel üretilmedi`)
    assert.ok(dieline.bounds.width > 0 && dieline.bounds.height > 0, `${template.id}: geçersiz açık ölçü`)
    assert.ok(dieline.stats.cutLength > 0, `${template.id}: kesim uzunluğu sıfır`)
  }
})

test('üretilen hiçbir dieline üst üste binmiş kesim çizgisi içermiyor', () => {
  for (const template of templates) {
    const dieline = generateDieline(template.id)
    const duplicates = dieline.warnings.filter((w) => w.code === 'duplicate-cut')
    assert.equal(duplicates.length, 0, `${template.id}: çift bıçak izi var`)
  }
})

test('kırım işaretleri çocuk panelin tarafına göre tutarlı', () => {
  for (const template of templates) {
    const dieline = generateDieline(template.id)
    for (const fold of dieline.folds) {
      if (Math.abs(fold.angle) < 1) continue
      const child = dieline.panels.find((p) => p.id === fold.child)
      if (!child) continue
      const signed = signedFoldAngle(fold.axis, child.outline, fold.angle)
      assert.equal(Math.sign(signed), Math.sign(fold.angle), `${template.id} ${fold.child} kırım işareti`)
    }
  }
})

test('panel grafiği tek köklü bir ağaç oluşturuyor', () => {
  for (const template of templates) {
    const dieline = generateDieline(template.id)
    const ids = new Set(dieline.panels.map((p) => p.id))
    const childCount = new Map<string, number>()

    for (const fold of dieline.folds) {
      assert.ok(ids.has(fold.parent), `${template.id}: bilinmeyen üst panel ${fold.parent}`)
      assert.ok(ids.has(fold.child), `${template.id}: bilinmeyen alt panel ${fold.child}`)
      childCount.set(fold.child, (childCount.get(fold.child) ?? 0) + 1)
    }

    for (const [child, count] of childCount) {
      assert.equal(count, 1, `${template.id}: ${child} panelinin birden fazla üstü var`)
    }
    const roots = [...ids].filter((id) => !childCount.has(id))
    assert.deepEqual(roots, [dieline.rootPanel], `${template.id}: kök panel beklenenden farklı`)
  }
})

test('ters kapaklı kutunun açık ölçüsü gövde matematiğiyle uyuşuyor', () => {
  const dieline = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150, glueFlap: 15, caliper: 0.4, bleed: 0 })
  // Genişlik = çevre (2·uzunluk + 2·derinlik) + yapıştırma payı
  assert.equal(dieline.bounds.width, 2 * 100 + 2 * 50 + 15)
  // Yükseklik = gövde + iki kapak dili (derinlik − 2 kalınlık)
  const tuckDepth = 50 - 2 * 0.4
  assert.equal(dieline.bounds.height, 150 + 2 * tuckDepth)
})

test('koli iç ölçü seçildiğinde panellere kalınlık payı ekliyor', () => {
  const inside = generateDieline('fefco-0201', { length: 300, width: 200, height: 150, caliper: 3, jointFlap: 35, dimensionBasis: 'inside' })
  const outside = generateDieline('fefco-0201', { length: 300, width: 200, height: 150, caliper: 3, jointFlap: 35, dimensionBasis: 'outside' })
  assert.equal(outside.bounds.width, 2 * 300 + 2 * 200 + 35)
  assert.equal(inside.bounds.width, outside.bounds.width + 4 * 3)
})

test('geçersiz parametre reddediliyor', () => {
  assert.throws(() => generateDieline('ecma-a20-20', { length: -5 }), /aralığında olmalı/)
  assert.throws(() => generateDieline('ecma-a20-20', { bilinmeyen: 1 }), /Bilinmeyen parametre/)
  assert.throws(() => generateDieline('yok-boyle-bir-sey'), /Unknown template|Bilinmeyen template/)
})

test('parametre çözümlemesi varsayılanları dolduruyor', () => {
  const template = getTemplate('sleeve-4panel')
  const resolved = resolveParams(template, { length: 200 })
  assert.equal(resolved['length'], 200)
  assert.equal(resolved['glueFlap'], 15)
})

test('katalog araması Türkçe ve İngilizce anahtar kelimeleri buluyor', () => {
  assert.ok(listTemplates({ query: 'koli' }).some((t) => t.id === 'fefco-0201'))
  assert.ok(listTemplates({ query: 'reverse tuck' }).some((t) => t.id === 'ecma-a20-20'))
  assert.ok(listTemplates({ query: 'mailer' }).some((t) => t.id === 'fefco-0427'))
  assert.ok(listTemplates({ query: 'snap lock' }).some((t) => t.id === 'ecma-a20-80'))
  assert.ok(listTemplates({ material: 'corrugated' }).length > 0)
  assert.ok(listTemplates({ category: 'tray-boxes', material: 'corrugated' }).length >= 2)
})

test('faz 1 aileleri katalogda duruyor', () => {
  const ids = new Set(templates.map((t) => t.id))
  for (const id of [
    'ecma-a20-80',
    'ecma-a21-20',
    'ecma-a40-20',
    'fefco-0200',
    'fefco-0203',
    'fefco-0427',
    'fefco-0471',
    'fefco-0452',
    'fefco-0301',
  ]) {
    assert.ok(ids.has(id), `eksik template: ${id}`)
  }
  assert.ok(templates.length >= 28)
})

test('katalog aynı bıçak izini kart olarak çoğaltmaz', () => {
  // Kendi aile/SKU kartlarımız (DCT kartları hariç): ölçü klonu yok, her aile en az bir kart
  const all = listTemplates({ includeLegacy: true }).filter((t) => !t.id.startsWith('becf-'))
  assert.ok(all.length >= templates.length, `katalog kartı az: ${all.length}`)
  assert.ok(all.length < 2500, `ölçü klonları şişirmiş: ${all.length}`)
  assert.ok(!all.some((t) => /--z\d+/.test(t.id)), 'ölçü ölçeği ayrı kart olmamalı')
  const families = new Set(all.map((t) => t.familyId))
  for (const t of templates) {
    assert.ok(families.has(t.id), `aile katalogda yok: ${t.id}`)
  }
  const groups = usedGroups()
  for (const g of groups) {
    assert.ok(g.count >= 1, `${g.id} boş`)
  }
  const sleeve = all.find((t) => t.id === 'sleeve-4panel' || t.id.startsWith('sleeve-4panel--'))
  assert.ok(sleeve)
  const dieline = generateDieline(sleeve.id, { bleed: 0 })
  assert.ok(dieline.panels.length > 0)
  assert.ok(dieline.folds.length > 0)
})

test('tuck teknik kombinasyonları ayrı katalog kartı olarak görünür', () => {
  const allTuck = listTemplates({ category: 'tuck-end-boxes', includeLegacy: true })
  // DCT adlandırılmış varyasyon kartları (becf-…) ayrı sayılır; teknik SKU'lar kartezyen olmamalı
  const tuckCards = allTuck.filter((t) => !t.id.startsWith('becf-'))
  assert.ok(tuckCards.length >= 20, `tuck katalog kartı az: ${tuckCards.length}`)
  assert.ok(tuckCards.length < 80, `tuck kartları hâlâ kartezyen: ${tuckCards.length}`)
  assert.ok(allTuck.filter((t) => t.id.startsWith('becf-')).length >= 150, 'DCT varyasyon kartları eksik')
  assert.ok(tuckCards.some((t) => t.id === 'ecma-a20-20'))
  assert.ok(tuckCards.some((t) => t.id === 'ecma-a20-21'))
  const names = tuckCards.filter((t) => t.familyId === 'ecma-a20-20').map((t) => t.name.tr)
  assert.equal(new Set(names).size, names.length, 'aynı başlıklı tuck kartı var')
  const hang = tuckCards.find((t) => t.id.startsWith('ecma-a20-20--h1-'))
  assert.ok(hang, 'askılı varyant yok')
  const hangDieline = generateDieline(hang.id, { bleed: 0 })
  assert.ok(hangDieline.panels.some((p) => p.id === 'hang-tab'))
  const locked = tuckCards.find((t) => t.id.includes('-L2-') && t.id.startsWith('ecma-a20-20--'))
  assert.ok(locked, 'dilli kilit varyantı yok')
  const lockedDieline = generateDieline(locked.id, { bleed: 0 })
  assert.ok(lockedDieline.paths.some((p) => p.note === 'toz kapağı kilit yarığı'))
})

test('faz 2 aileleri katalogda duruyor', () => {
  const ids = new Set(templates.map((t) => t.id))
  for (const id of [
    'ecma-a50-20',
    'fefco-0202',
    'fefco-0204',
    'fefco-0713',
    'clamshell-burger',
    'pizza-box',
    'tray-hex',
    'display-counter',
    'folder-5panel',
    'fefco-0904',
    'tag-hang',
    'envelope-wallet',
    'tube-hex',
    'tube-octagon',
  ]) {
    assert.ok(ids.has(id), `eksik template: ${id}`)
  }
})

test('yastık kutu 3D panelleri bıçak izindeki kavis ve V uçlarını taşır', () => {
  const dieline = generateDieline('ecma-a50-20', {
    length: 120,
    width: 30,
    height: 80,
    bleed: 0,
    endBulge: 14,
  })
  const front = dieline.panels.find((p) => p.id === 'front')
  const left = dieline.panels.find((p) => p.id === 'left')
  assert.ok(front && left)
  assert.ok(front.outline.length > 4, 'ön panel yay örneklenmeli')
  const topDip = Math.min(...front.outline.filter((p) => p.y > 40).map((p) => p.y))
  const botRise = Math.max(...front.outline.filter((p) => p.y < 40).map((p) => p.y))
  assert.ok(80 - topDip > 4, `ön üst kavis yok: dip=${topDip}`)
  assert.ok(botRise > 4, `ön alt kavis yok: yükselme=${botRise}`)
  const sideDip = Math.min(...left.outline.filter((p) => p.y > 40).map((p) => p.y))
  assert.ok(80 - sideDip > 3, `yan V 3D dış hatta yok: dip=${sideDip}`)
})

test('tuck pencere kesimi ön panele oval oyuk açar', () => {
  const dieline = generateDieline('ecma-a20-20', { window: 'oval' })
  assert.ok(dieline.paths.some((p) => p.note === 'pencere'))
  const front = dieline.panels.find((p) => p.id === 'front')
  assert.ok(front)
  assert.ok((front.holes?.length ?? 0) >= 1, '3D ön panelde pencere deliği olmalı')
})

test('başparmak oyuğu 3D ön panel dış hattına işlenir', () => {
  const dieline = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 80,
    thumbNotch: true,
    window: 'none',
    bleed: 0,
    euroHole: false,
  })
  const front = dieline.panels.find((p) => p.id === 'front')
  assert.ok(front)
  const ys = front.outline.map((p) => p.y)
  const maxY = Math.max(...ys)
  const minDip = Math.min(...front.outline.filter((p) => p.y > maxY - 20).map((p) => p.y))
  assert.ok(maxY - minDip > 4, `kenar oyuğu yok: maxY=${maxY} dip=${minDip}`)
  assert.ok(front.outline.length > 4, 'oyuk yay örneklenmeli')
})

test('HSC yalnızca alt kapak üretir, OSC bindirmeli kapak daha uzundur', () => {
  const hsc = generateDieline('fefco-0200', { length: 300, width: 200, height: 150, caliper: 3, jointFlap: 35, dimensionBasis: 'outside' })
  const rsc = generateDieline('fefco-0201', { length: 300, width: 200, height: 150, caliper: 3, jointFlap: 35, dimensionBasis: 'outside' })
  const osc = generateDieline('fefco-0203', { length: 300, width: 200, height: 150, caliper: 3, jointFlap: 35, overlap: 30, dimensionBasis: 'outside' })
  const flap = 200 / 2
  assert.equal(hsc.bounds.height, 150 + flap)
  assert.equal(rsc.bounds.height, 150 + 2 * flap)
  assert.ok(osc.bounds.height > rsc.bounds.height)
})

test('DCT boş grupları katalogda duruyor', () => {
  const ids = new Set(templates.map((t) => t.id))
  for (const id of [
    'shirt-box',
    'tube-triangle',
    'tube-pentagon',
    'matchbox',
    'window-tray',
    'tapered-tray',
    'tote-bag',
    'sos-bag',
    'wrap-label',
    'rigid-setup-box',
    'hinged-lid-box',
    'ring-binder',
    'swatch-fan',
    'easel-display',
    'tag-postal',
    'fefco-0210',
    'fefco-0421',
  ]) {
    assert.ok(ids.has(id), `eksik template: ${id}`)
  }
  const groups = new Set(usedGroups().map((g) => g.id))
  for (const id of [
    'shirt-boxes',
    'polygonal-boxes',
    'standard-boxes',
    'special-boxes',
    'angled-boxes',
    'carton-bags-pillows',
    'wrap-around-labels',
    'covered-solid-board-boxes',
    'boxes-with-hinged-lid',
    'binders',
    'swatch-cards',
  ] as const) {
    assert.ok(groups.has(id), `eksik alt kategori: ${id}`)
  }
})

test('katalog malzeme altında alt kategorilere ayrılıyor', () => {
  const tree = catalogTree()
  const carton = tree.find((b) => b.id === 'carton')
  const corrugated = tree.find((b) => b.id === 'corrugated')
  assert.ok(carton && carton.groups.some((g) => g.id === 'tuck-end-boxes'))
  assert.ok(corrugated && corrugated.groups.some((g) => g.id === 'standard-boxes'))
  assert.ok(usedGroups().some((g) => g.id === 'food-boxes' && g.count >= 1))
  const food = listTemplates({ category: 'food-boxes', includeLegacy: true })
  assert.ok(food.some((t) => t.id === 'clamshell-burger'))
  assert.ok(listTemplates({ category: 'standard-boxes', includeLegacy: true }).some((t) => t.id === 'pizza-box'))
  assert.ok(usedGroups({ material: 'carton' }).every((g) => g.materials.includes('carton')))
})

test('dilli kilit dil profilini ve toz yarığını üretir', () => {
  const plain = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 80,
    bleed: 0,
    sitLockTop: false,
    sitLockBottom: false,
    thumbNotch: false,
    euroHole: false,
  })
  const locked = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 80,
    bleed: 0,
    sitLockTop: true,
    sitLockBottom: true,
    thumbNotch: false,
    euroHole: false,
    tuckFlapStyle: 'angled',
    dustFlapStyle: 'normal',
  })
  const top = locked.panels.find((p) => p.id === 'top-tuck')
  const plainTop = plain.panels.find((p) => p.id === 'top-tuck')
  assert.ok(top && plainTop)
  assert.ok(top.outline.length > plainTop.outline.length, 'kilit kulağı daha çok köşe eklemeli')
  const slits = locked.paths.filter((p) => p.note === 'toz kapağı kilit yarığı')
  assert.equal(slits.length, 4)
  assert.equal(locked.warnings.filter((w) => w.code === 'duplicate-cut').length, 0)
})

test('alt parmak kesiği arka panel alt kenarına işlenir', () => {
  const dieline = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 80,
    thumbNotch: false,
    thumbNotchBottom: true,
    window: 'none',
    bleed: 0,
    euroHole: false,
  })
  const back = dieline.panels.find((p) => p.id === 'back')
  assert.ok(back)
  const minY = Math.min(...back.outline.map((p) => p.y))
  const rise = Math.max(...back.outline.filter((p) => p.y < minY + 20).map((p) => p.y))
  assert.ok(rise - minY > 4, `alt oyuk yok: minY=${minY} rise=${rise}`)
})

test('açılı yan kanat toz kapağını trapez yapar', () => {
  const normal = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 80,
    bleed: 0,
    dustFlapStyle: 'normal',
    thumbNotch: false,
    euroHole: false,
  })
  const angled = generateDieline('ecma-a20-20', {
    length: 100,
    width: 50,
    height: 80,
    bleed: 0,
    dustFlapStyle: 'angled',
    thumbNotch: false,
    euroHole: false,
  })
  const n = normal.panels.find((p) => p.id === 'top-dust-left')
  const a = angled.panels.find((p) => p.id === 'top-dust-left')
  assert.ok(n && a)
  assert.ok(a.outline.length < n.outline.length, 'açılı kanat daha az köşe')
})

test('askı deliği açık ölçüyü askı kulağı kadar uzatır', () => {
  const plain = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150, glueFlap: 15, caliper: 0.4, bleed: 0, euroHole: false })
  const hang = generateDieline('ecma-a20-20', { length: 100, width: 50, height: 150, glueFlap: 15, caliper: 0.4, bleed: 0, euroHole: true, hangTabHeight: 70 })
  assert.ok(hang.bounds.height >= plain.bounds.height + 15)
  assert.ok(hang.paths.some((p) => p.note?.includes('euroslot')))
  assert.ok(hang.panels.some((p) => p.id === 'hang-tab'))
  assert.ok(hang.folds.some((f) => f.child === 'hang-tab'))
})
