const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../calculator-core.js');

const rawPrices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'prices.json'), 'utf8')).prices;
const prices = core.toCentsTree(rawPrices);

function buildConfig(overrides = {}) {
  return { ...core.DEFAULT_CONFIG, ...overrides };
}

test('smoke: buildSummaryModel returns populated model', () => {
  const model = core.buildSummaryModel(buildConfig(), prices);
  assert.ok(model.finalMonthlyPrice > 0);
  assert.ok(model.finalOneTimePrice > 0);
});

test('wifi premium: 5 sztuk daje 50 zł/mies i 445 zł aktywacji', () => {
  const model = core.buildSummaryModel(buildConfig({ wifiCount: 5 }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label.includes('WiFi Premium')).value, 5000);
  assert.equal(model.oneTimeItems.find((x) => x.label.includes('Aktywacja WiFi Premium')).value, 44500);
});

test('wifi premium z technikiem dolicza jednorazowo 100 zł', () => {
  const model = core.buildSummaryModel(buildConfig({ wifiCount: 1, wifiInstallType: 'technician' }), prices);
  assert.equal(model.oneTimeItems.find((x) => x.label.includes('Wyjazd technika')).value, 10000);
});

test('symetryk dla obecnego klienta kosztuje netto 5 zł', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', symmetricConnection: true }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label === 'Łącze symetryczne').value, 500);
});

test('2000/2000 ma symetryk w cenie', () => {
  const model = core.buildSummaryModel(buildConfig({ internetSpeed: '2000/2000' }), prices);
  assert.ok(model.benefitsBreakdown.some((x) => x.label === 'Łącze symetryczne'));
  assert.ok(!model.monthlyItems.some((x) => x.label === 'Łącze symetryczne'));
});

test('nowy klient ma tylko promocje nowego klienta', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'new', mainPromotion: 'chooseGift' }), prices);
  assert.ok(model.availablePromotions.every((item) => item.key !== 'chooseGift'));
});

test('obecny klient ma prezent i baner', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', mainPromotion: 'chooseGift', promotionGiftType: 'wifiDiscount', wifiCount: 1, bannerPromoEnabled: true }), prices);
  assert.ok(model.benefitsBreakdown.some((x) => x.label === 'Wybierz swój prezent'));
  assert.ok(model.benefitsBreakdown.some((x) => x.label === 'Promocja Banerowa'));
  assert.equal(model.scheduleSegments[0].amount, 100);
});

test('copy summary zawiera harmonogram i promocje', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', mainPromotion: 'chooseGift', promotionGiftType: 'subscriptionDiscount', bannerPromoEnabled: true }), prices);
  const text = core.buildCopySummaryText(model, prices);
  assert.ok(text.includes('Skrócony harmonogram płatności:'));
  assert.ok(text.includes('Promocja Banerowa'));
});
