import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DCT_CARDS, DCT_VARIATIONS, RIGID_SPECS, SPECIAL_SPECS, TAG_WRAP_SPECS, cartonTemplates, catalogTree, countTemplates, dctCoverage, generateDieline, listTemplates, queryCatalog, resolveCatalog, rigidTemplates, specialTemplates, tagWrapTemplates } from '../src/index.ts'

const noErrors = (id: string, params: Record<string, number | string | boolean> = {}) => {
  const d = generateDieline(id, params)
  const errs = d.warnings.filter((w) => w.severity === 'error')
  assert.equal(errs.length, 0, `${id}: ${errs.map((e) => e.code).join(',')}`)
  assert.equal(d.warnings.filter((w) => w.code === 'duplicate-cut').length, 0, `${id}: çift bıçak`)
  return d
}

test('diecuttemplates.com envanteri eksiksiz karşılanıyor (273/273)', () => {
  const c = dctCoverage()
  assert.equal(c.total, 273)
  assert.equal(c.covered, c.total, c.groups.flatMap((g) => g.missing).join(','))
  for (const g of c.groups) assert.equal(g.covered, g.total, `${g.material}/${g.group}: eksik ${g.missing.join(',')}`)
})

test('yeni karton uç takımları: taç, sıkıştırma, kilit kapak, tutamak', () => {
  const petal = noErrors('petal-top-box')
  assert.equal(petal.panels.filter((p) => p.id.startsWith('top-petal-')).length, 4)

  const pinch = noErrors('snap-lock-pinch-top')
  assert.equal(pinch.panels.filter((p) => p.id.startsWith('top-pinch-')).length, 4)
  assert.equal(pinch.paths.filter((p) => p.note === 'sıkıştırma çapraz kırımı').length, 8)

  const lidLock = noErrors('snap-lock-lid-tabs')
  assert.ok(lidLock.panels.some((p) => p.id === 'top-lid'))
  assert.ok(lidLock.panels.some((p) => p.id === 'top-lip'))
  assert.equal(lidLock.paths.filter((p) => p.note === 'kilit dili yarığı').length, 2)
  noErrors('ecma-a55-20-03-04-83')

  const carry = noErrors('fefco-0217')
  assert.equal(carry.panels.filter((p) => p.id.startsWith('top-handle-')).length, 2)
  assert.equal(carry.paths.filter((p) => p.note === 'el deliği').length, 2)
  noErrors('corr-carry-tuck')
  noErrors('fefco-0717')
})

test('karton seçenekleri: el deliği, havalandırma, askı kulakları, yırtma şeridi, dispenser, pencere', () => {
  const handle = noErrors('fefco-0215-handle')
  assert.ok(handle.paths.some((p) => p.note === 'taşıma el deliği'))
  assert.equal(handle.paths.filter((p) => p.note === 'havalandırma deliği').length, 2)

  const tabs = noErrors('tuck-end-hole-tabs')
  assert.equal(tabs.paths.filter((p) => p.note === 'askı deliği').length, 2)

  const strip = noErrors('seal-end-tear-strip')
  assert.equal(strip.paths.filter((p) => p.layer === 'perf').length, 2)

  const disp = noErrors('seal-end-dispenser')
  assert.ok(disp.paths.some((p) => p.layer === 'perf' && p.note === 'dispenser ağzı perforesi'))

  const win = noErrors('snap-lock-window')
  assert.ok(win.paths.some((p) => (p.note ?? '').includes('pencere')), 'varsayılan pencere kesilmeli')
  const winTpl = cartonTemplates.find((t) => t.id === 'snap-lock-window')
  const winParam = winTpl?.params.find((p) => p.key === 'window')
  assert.equal(winParam?.kind === 'enum' ? winParam.default : undefined, 'rect')
})

test('özel kutular: her spec varsayılan ve uç ölçülerle üretiliyor', () => {
  for (const t of specialTemplates) {
    noErrors(t.id)
    const has = (k: string) => t.params.some((p) => p.key === k)
    const big: Record<string, number> = {}
    if (has('length')) big.length = 300
    if (has('width')) big.width = 120
    if (has('height')) big.height = 160
    noErrors(t.id, big)
  }
  assert.equal(SPECIAL_SPECS.length, 13)
})

test('özel kutular: yapı ayrıntıları', () => {
  const cube = noErrors('ecma-f60-81', { length: 80, width: 80 })
  assert.equal(cube.panels.filter((p) => p.id.startsWith('flap-')).length, 4)
  assert.equal(cube.paths.filter((p) => p.note === 'kilit kanadı çapraz kırımı').length, 8)

  const pyr = noErrors('pyramid-gift-box', { length: 100, height: 80 })
  assert.equal(pyr.panels.length, 5)
  for (const f of pyr.folds) assert.ok(Math.abs(f.angle) > 90 && Math.abs(f.angle) < 180, 'yüzler içe doğru eğik olmalı')
  assert.equal(pyr.paths.filter((p) => p.note === 'kurdele deliği').length, 4)

  const pillow = noErrors('round-pillow-box', { length: 100, width: 35 })
  assert.equal(pillow.panels.length, 4)
  assert.ok(Math.abs(pillow.bounds.height - 100) < 0.5)

  const rollover = noErrors('ecom-mailer-rollover')
  assert.ok(rollover.panels.some((p) => p.id === 'left-inner') && rollover.panels.some((p) => p.id === 'right-lock'))
  assert.equal(rollover.paths.filter((p) => p.layer === 'perf').length, 2)
  assert.ok(rollover.paths.some((p) => p.note === 'ön kilit yarığı'))

  const tabs = noErrors('ecom-mailer-zipper-tabs')
  assert.equal(tabs.panels.filter((p) => p.role === 'glue').length, 4)

  const tray = noErrors('gift-tray-lid-splayed', { window: 'rect' })
  assert.ok(tray.paths.some((p) => p.note === 'kapak penceresi'))
  assert.equal(tray.paths.filter((p) => p.note === 'köşe körük kırımı').length, 4)

  const carrier = noErrors('handle-carrier-box')
  assert.equal(carrier.paths.filter((p) => p.note === 'el deliği').length, 2)
})

test('etiketler ve sargılar', () => {
  for (const t of tagWrapTemplates) noErrors(t.id)
  assert.equal(TAG_WRAP_SPECS.length, 8)

  const euro = noErrors('ecma-f80-51-euroslot')
  assert.ok(euro.paths.some((p) => p.note === 'euroslot askı deliği'))
  const round = noErrors('ecma-f80-51-hole')
  assert.ok(round.paths.some((p) => p.note === 'askı deliği'))
  assert.equal(noErrors('ecma-f80-51-euroslot', { hole: 'none' }).paths.filter((p) => p.layer === 'cut').length, 1)

  const folded = noErrors('ecma-f80-52')
  assert.equal(folded.panels.length, 2)
  assert.equal(Math.abs(folded.folds[0]?.angle ?? 0), 180)

  const sleeve = noErrors('sleeve-tuck-lock')
  assert.ok(sleeve.panels.some((p) => p.role === 'lock'))
  assert.ok(sleeve.paths.some((p) => p.note === 'kilit yarığı'))

  const cups = noErrors('cup-carrier-wrap', { cups: 4 })
  assert.equal(cups.paths.filter((p) => p.note === 'bardak deliği').length, 4)

  const wrap = noErrors('board-wrap-cover', { thumbNotch: true })
  assert.equal(wrap.panels.length, 5)
  assert.ok(wrap.paths.some((p) => p.note === 'tutma oyuğu'))
})

test('sert karton setleri: mukavva + kaplama, tek panel ağacı', () => {
  for (const t of rigidTemplates) {
    const d = noErrors(t.id)
    const children = new Set(d.folds.map((f) => f.child))
    const roots = d.panels.filter((p) => !children.has(p.id))
    assert.equal(roots.length, 1, `${t.id}: birden fazla kök`)
  }
  assert.equal(RIGID_SPECS.length, 15)

  const two = noErrors('rigid-two-piece-full')
  assert.ok(two.panels.some((p) => p.id === 'base-board-base') && two.panels.some((p) => p.id === 'lid-wrap-center'))
  assert.ok(two.panels.filter((p) => p.id.endsWith('-ti')).length === 8, 'her kaplamada dört turn-in')

  const neck = noErrors('rigid-neck-box')
  assert.ok(neck.panels.some((p) => p.id === 'neck-board-0') && neck.panels.some((p) => p.id === 'neck-wrap'))

  const book = noErrors('rigid-book-box')
  assert.equal(book.panels.filter((p) => p.id.startsWith('cover-board-')).length, 3)

  const mag = noErrors('rigid-magnetic-box')
  assert.equal(mag.paths.filter((p) => p.note === 'mıknatıs yeri').length, 2)

  const disp = noErrors('rigid-counter-display', { headerHeight: 120, cornerRadius: 30 })
  assert.ok(disp.bounds.height > 300)

  const swatch = noErrors('swatch-card-flat')
  assert.equal(swatch.panels.length, 2)
  assert.equal(swatch.paths.filter((p) => p.note === 'perçin deliği').length, 4)
})

test('DCT kimliği → şablon çözümlemesi (tepsi eşlemeleri dahil)', () => {
  assert.equal(resolveCatalog('becf-11e01').template.id, 'ecma-f60-81')
  assert.equal(resolveCatalog('becf-21e25').template.id, 'ecom-mailer-rollover')
  assert.equal(resolveCatalog('becf-12706').template.id, 'ecma-f80-52')
  assert.equal(resolveCatalog('becf-3020a').template.id, 'rigid-magnetic-box')
  assert.equal(resolveCatalog('becf-30701').template.id, 'easel-display')
  const piece = resolveCatalog('becf-21c02')
  assert.equal(piece.template.id, 'fefco-0301')
  assert.equal(piece.params.piece, 'base')
  assert.equal(resolveCatalog('becf-21e22').template.id, 'bottle-cell-platform')
  assert.equal(resolveCatalog('becf-21e21').template.id, 'fefco-0717')
})

test('DCT adlandırılmış varyasyonları (+N Variations) eksiksiz çözülüyor', () => {
  const c = dctCoverage()
  assert.ok(c.variations >= 770, `varyasyon envanteri küçük: ${c.variations}`)
  assert.equal(c.variationsCovered, c.variations)
  for (const g of c.groups) assert.equal(g.variationsCovered, g.variations, `${g.material}/${g.group}: varyasyon eksik`)
  assert.equal(c.grandCovered, c.grandTotal)
  assert.ok(c.grandTotal > 37000)

  for (const v of DCT_VARIATIONS) noErrors(v.id)

  // becf-10101 ailesi: dil / toz kapağı / kilit / pencere / askı eksenleri
  const base = resolveCatalog('becf-10101')
  assert.equal(base.template.id, 'ecma-a20-20')
  assert.equal(base.params.tuckFlapStyle, 'uni')
  assert.equal(base.params.dustFlapStyle, 'slit')
  assert.equal(base.params.sitLockTop, true)
  assert.equal(base.params.thumbNotch, false)
  assert.equal(resolveCatalog('becf-10102').params.thumbNotch, true)
  assert.equal(resolveCatalog('becf-10103').params.window, 'rect')
  assert.equal(resolveCatalog('becf-10107').params.tuckFlapStyle, 'friction')
  assert.equal(resolveCatalog('becf-1010a').params.dustFlapStyle, 'angled')
  assert.equal(resolveCatalog('becf-1010d').params.euroHole, true)
  assert.ok(generateDieline('becf-1010d').panels.some((p) => p.id === 'hang-tab'))
  assert.ok(generateDieline('becf-10103').paths.some((p) => (p.note ?? '').includes('pencere')))

  // birleşik karton üreteci de aynı eksenleri tanır (auto bottom varyasyonu)
  const auto = resolveCatalog('becf-11002')
  assert.equal(auto.template.category, 'tuck-top-auto-bottom-boxes')
  for (const key of Object.keys(auto.params)) assert.ok(auto.template.params.some((p) => p.key === key), `${key} şablonda yok`)

  // katalog kartları: gezinmede her DCT kimliği kendi kartı; aile kartı arama / includeLegacy ile erişilir
  const tuck = listTemplates({ category: 'tuck-end-boxes' })
  assert.ok(tuck.every((t) => t.id.startsWith('becf-')), 'gezinmede DCT dışı kart var')
  assert.ok(tuck.some((t) => t.id === 'becf-10111'))
  assert.ok(listTemplates({ category: 'tuck-end-boxes', includeLegacy: true }).some((t) => t.id === 'ecma-a20-20'))
  assert.ok(listTemplates({ query: 'becf-1011d' }).some((t) => t.id === 'becf-1011d'))
})

test('katalog diecuttemplates.com sitemap’i ile birebir: 37 326 kart, 28 grup, sabit menü sırası', () => {
  assert.ok(DCT_CARDS.length >= 37326, `DCT kart sayısı: ${DCT_CARDS.length}`)
  assert.equal(new Set(DCT_CARDS.map((c) => c.id)).size, DCT_CARDS.length)
  assert.equal(countTemplates(), DCT_CARDS.length)
  const tree = catalogTree()
  assert.deepEqual(
    tree.map((b) => b.id),
    ['carton', 'corrugated', 'hardboard'],
  )
  assert.equal(tree.flatMap((b) => b.groups).length, 28)
  const carton = tree.find((b) => b.id === 'carton')!
  assert.equal(carton.groups.length, 16)
  assert.equal(carton.groups.find((g) => g.id === 'tuck-end-boxes')?.count, 35249)
  assert.equal(carton.groups.find((g) => g.id === 'food-boxes')?.count, 25)
  const hard = tree.find((b) => b.id === 'hardboard')!
  assert.deepEqual(
    hard.groups.map((g) => g.id),
    ['covered-solid-board-boxes', 'boxes-with-hinged-lid', 'binders', 'swatch-cards', 'display-materials'],
  )
  for (const b of tree) for (const g of b.groups) assert.ok(g.count > 0, `${b.id}/${g.id} boş`)
  // her kart üretilebilir olmalı (örneklem: grup başına ilk kart + rastgele yapılandırıcı)
  for (const b of tree) {
    for (const g of b.groups) {
      const first = queryCatalog({ material: b.id, category: g.id }, 1, 1).items[0]!
      assert.equal(first.materials[0], b.id)
      assert.equal(first.category, g.id)
      assert.ok(first.name.en.startsWith('BECF-'))
      noErrors(first.id)
    }
  }
  const page = queryCatalog({ material: 'carton', category: 'tuck-end-boxes' }, 700, 48)
  assert.equal(page.page, 700)
  assert.equal(page.items.length, 48)
  assert.equal(page.items[0]!.variations, 5831)
  noErrors(page.items[7]!.id)
  // kart kodu DCT’nin ECMA/FEFCO kodu
  assert.equal(queryCatalog({ query: 'becf-10803' }, 1, 1).items[0]!.code, 'ECMA A20.20.01.03')
  assert.equal(queryCatalog({ query: 'becf-20301' }, 1, 1).items[0]!.code, 'FEFCO 0210')
})

test('DCT yapılandırıcı aileleri (becf-108…, 10c…, 10d…) desenle çözülür', () => {
  const a = resolveCatalog('becf-1081469')
  assert.equal(a.template.category, 'tuck-end-boxes')
  assert.equal(a.params.tuckFlapStyle, 'angled') // (0x1469 - 1) % 3 === 1
  const b = resolveCatalog('becf-10c13f')
  assert.equal(b.template.category, 'snap-lock-boxes')
  noErrors('becf-108888c')
  noErrors('becf-10d288')
  assert.throws(() => resolveCatalog('becf-10d289'))
  assert.throws(() => resolveCatalog('becf-108ffffff'))
  const hit = listTemplates({ query: '1081469' })
  assert.equal(hit.length, 1)
  assert.equal(hit[0]?.id, 'becf-1081469')
})
