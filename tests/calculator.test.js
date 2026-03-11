const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../calculator-core.js');
const fs = require('node:fs');

const raw = JSON.parse(fs.readFileSync('prices.json', 'utf8')).prices;
const prices = core.toCentsTree(raw);

function buildConfig(overrides = {}) {
  return { ...core.DEFAULT_CONFIG, ...overrides };
}

test('1) brak promocji abonamentowej => averageMonthlyValue === finalMonthlyPrice, no 300, savings >= 0', () => {
  const model = core.buildSummaryModel(buildConfig({ mainPromotion: 'none' }), prices);
  assert.equal(model.avgMonthly, model.finalMonthlyPrice);
  assert.equal(model.scheduleText, 'Brak promocji abonamentowej');
  assert.ok(!model.scheduleText.includes('300'));
  assert.ok(model.savings.totalSavings >= 0);
});

test('2) WiFi Premium 5 szt: monthly=50, activation=445', () => {
  const model = core.buildSummaryModel(buildConfig({ wifiCount: 5 }), prices);
  const wifiMonthly = model.monthlyItems.find((x) => x.label.includes('WiFi Premium'));
  const wifiActivation = model.oneTimeItems.find((x) => x.label.includes('Aktywacja WiFi Premium'));
  assert.equal(wifiMonthly.value, 5000);
  assert.equal(wifiActivation.value, 44500);
});

test('3) łącze symetryczne dla obecnego klienta (nie 2000/2000) => +5 i benefit -5', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', symmetricConnection: true, internetSpeed: '600/100' }), prices);
  const symmetric = model.monthlyItems.find((x) => x.label === 'Łącze symetryczne');
  const benefit = model.benefitsBreakdown.find((x) => x.label.includes('Rabat za obecnego klienta'));
  assert.equal(symmetric.value, 500);
  assert.ok(benefit.text.includes('-5,00 zł/mies.'));
});

test('4) taryfa 2000/2000 => symetryk nie dolicza', () => {
  const model = core.buildSummaryModel(buildConfig({ internetSpeed: '2000/2000', symmetricConnection: true }), prices);
  assert.ok(!model.monthlyItems.some((x) => x.label === 'Łącze symetryczne'));
});

test('5) Multiroom w prezencie dla 1 szt => 0/0 i benefit -15, -99', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', multiroomCount: 1, promoMultiroomGift: true }), prices);
  const mrMonthly = model.monthlyItems.find((x) => x.label.includes('Multiroom'));
  const mrActivation = model.oneTimeItems.find((x) => x.label.includes('Aktywacja Multiroom'));
  const benefit = model.benefitsBreakdown.find((x) => x.label === 'Multiroom w prezencie');
  assert.equal(mrMonthly.value, 0);
  assert.equal(mrActivation.value, 0);
  assert.ok(benefit.text.includes('-15,00 zł/mies.'));
  assert.ok(benefit.text.includes('-99,00 zł jednorazowo'));
});

test('6) obniżenie do 1 zł => realne savings dla Multiroom/WiFi', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', promoAddonTo1: true, multiroomCount: 2, wifiCount: 2 }), prices);
  const mrBenefit = model.benefitsBreakdown.find((x) => x.label.includes('Multiroom do 1 zł'));
  const wifiBenefit = model.benefitsBreakdown.find((x) => x.label.includes('WiFi Premium do 1 zł'));
  assert.ok(mrBenefit.text.includes('-28,00 zł/mies.'));
  assert.ok(wifiBenefit.text.includes('-18,00 zł/mies.'));
});

test('7) Canal+ only two options and no Entry', () => {
  assert.deepEqual(Object.keys(prices.canalPlus).sort(), ['serialeFilmy', 'superSport']);
});

test('8) Bitdefender labels exact', () => {
  assert.equal(prices.labels.bitdefender.mobileSecurity, 'Mobile Security');
  assert.equal(prices.labels.bitdefender.antivirusMac1, 'Antivirus for Mac 1');
  assert.equal(prices.labels.bitdefender.antivirusMac3, 'Antivirus for Mac 3');
});

test('9) ograniczenia techniczne dla <600', () => {
  const blocked = core.enforceRules(buildConfig({ technicalLimit: false, internetSpeed: '350/35' }));
  assert.equal(blocked.internetSpeed, '600/100');
  const enabled = core.enforceRules(buildConfig({ technicalLimit: true, internetSpeed: '350/35' }));
  assert.equal(enabled.internetSpeed, '350/35');
});

test('10) copy summary contains current values', () => {
  const model = core.buildSummaryModel(buildConfig({ contractPeriod: '12', buildingType: 'MFH', customerStatus: 'existing', mainPromotion: 'start', wifiCount: 1 }), prices);
  const text = core.buildCopySummaryText(model, prices);
  assert.ok(text.includes('Okres: 12 miesięcy'));
  assert.ok(text.includes('Budynek: Blok (MFH)'));
  assert.ok(text.includes('Abonament w okresach promocji: 3 mies. po 1,00 zł + potem'));
  assert.ok(text.includes('WiFi Premium (MESH): 1 szt.'));
});
