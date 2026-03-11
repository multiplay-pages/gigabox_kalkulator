const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../calculator-core.js');

const rawPrices = JSON.parse(fs.readFileSync('prices.json', 'utf8')).prices;
const prices = core.toCentsTree(rawPrices);

function buildConfig(overrides = {}) {
  return { ...core.DEFAULT_CONFIG, ...overrides };
}

test('8.1 syntax/smoke: JS files parse, buildSummaryModel works', () => {
  ['calculator-core.js', 'script.js'].forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotThrow(() => new vm.Script(content));
  });
  const model = core.buildSummaryModel(buildConfig(), prices);
  assert.ok(model.finalMonthlyPrice > 0);
});

test('8.2 brak promocji: average == final, schedule brak', () => {
  const model = core.buildSummaryModel(buildConfig({ mainPromotion: 'none' }), prices);
  assert.equal(model.avgMonthly, model.finalMonthlyPrice);
  assert.equal(model.scheduleText, 'Brak promocji abonamentowej');
});

test('8.3 promocja 3 mies po 1 zł: schedule + avg', () => {
  const model = core.buildSummaryModel(buildConfig({ mainPromotion: 'start' }), prices);
  assert.ok(model.scheduleText.startsWith('3 mies. po 1,00 zł + potem'));
  assert.ok(model.avgMonthly < model.finalMonthlyPrice);
});

test('8.4 WiFi Premium 5 szt: 50/mies + 445 start', () => {
  const model = core.buildSummaryModel(buildConfig({ wifiCount: 5 }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label.includes('WiFi Premium')).value, 5000);
  assert.equal(model.oneTimeItems.find((x) => x.label.includes('Aktywacja WiFi Premium')).value, 44500);
});

test('8.5 Multiroom 3 szt bez promocji: 45/mies + 297 start', () => {
  const model = core.buildSummaryModel(buildConfig({ multiroomCount: 3 }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label.includes('Multiroom')).value, 4500);
  assert.equal(model.oneTimeItems.find((x) => x.label.includes('Aktywacja Multiroom')).value, 29700);
});

test('8.6 Multiroom gift (1 szt): 0/0 + benefit', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', multiroomCount: 1, promoMultiroomGift: true }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label.includes('Multiroom')).value, 0);
  assert.equal(model.oneTimeItems.find((x) => x.label.includes('Aktywacja Multiroom')).value, 0);
  const benefit = model.benefitsBreakdown.find((x) => x.label === 'Multiroom w prezencie');
  assert.ok(benefit.text.includes('-15,00 zł/mies.'));
  assert.ok(benefit.text.includes('-99,00 zł jednorazowo'));
});

test('8.7 promoAddonTo1 dla WiFi: 2 szt -> 2/mies + benefit 18/mies', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', promoAddonTo1: true, wifiCount: 2 }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label.includes('WiFi Premium')).value, 200);
  const benefit = model.benefitsBreakdown.find((x) => x.label.includes('WiFi Premium do 1 zł'));
  assert.ok(benefit.text.includes('-18,00 zł/mies.'));
});

test('8.8 symetryk nowy klient: +10', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'new', symmetricConnection: true }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label === 'Łącze symetryczne').value, 1000);
});

test('8.9 symetryk obecny klient: +5 i benefit 5', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', symmetricConnection: true }), prices);
  assert.equal(model.monthlyItems.find((x) => x.label === 'Łącze symetryczne').value, 500);
  assert.ok(model.benefitsBreakdown.find((x) => x.label.includes('Rabat za obecnego klienta')).text.includes('-5,00 zł/mies.'));
});

test('8.10 2000/2000: bez dopłaty symetryka + info w benefitach', () => {
  const model = core.buildSummaryModel(buildConfig({ internetSpeed: '2000/2000', symmetricConnection: true }), prices);
  assert.ok(!model.monthlyItems.some((x) => x.label === 'Łącze symetryczne'));
  assert.ok(model.benefitsBreakdown.some((x) => x.label.includes('w cenie taryfy 2000/2000')));
});

test('8.11 restricted speeds tylko z technicalLimit', () => {
  assert.equal(core.enforceRules(buildConfig({ technicalLimit: false, internetSpeed: '100/10' })).internetSpeed, '600/100');
  assert.equal(core.enforceRules(buildConfig({ technicalLimit: true, internetSpeed: '100/10' })).internetSpeed, '100/10');
});

test('8.12 Canal+ only two variants no Entry', () => {
  assert.deepEqual(Object.keys(prices.canalPlus).sort(), ['serialeFilmy', 'superSport']);
});

test('8.13 Bitdefender labels exact', () => {
  assert.equal(prices.labels.bitdefender.none, 'Brak pakietu');
  assert.equal(prices.labels.bitdefender.mobileSecurity, 'Mobile Security');
  assert.equal(prices.labels.bitdefender.antivirusMac1, 'Antivirus for Mac 1');
  assert.equal(prices.labels.bitdefender.antivirusMac3, 'Antivirus for Mac 3');
});

test('8.14 copy summary includes full core fields', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', technicalLimit: true, internetSpeed: '350/35', symmetricConnection: true, multiroomCount: 2, multiroomAssistance: true, wifiCount: 3, internetPlus: true, canalPlus: ['serialeFilmy', 'superSport'], bitdefender: 'familyPack', phoneService: true, mainPromotion: 'wroc', promoAddonTo1: true, promoMultiroomGift: true }), prices);
  const text = core.buildCopySummaryText(model, prices);
  ['Parametry oferty:', 'Ograniczenia techniczne', 'Łącze symetryczne', 'Asysta technika', 'Dodatki TV:', 'Canal+:', 'Bitdefender:', 'Aktywna promocja i benefity:', 'Pozycje miesięczne:', 'Pozycje jednorazowe:', 'Uśredniona wartość abonamentu:', 'Abonament w okresach promocji:', 'Łączna oszczędność z promocji:'].forEach((needle) => {
    assert.ok(text.includes(needle));
  });
});

test('8.15 no negative savings', () => {
  const model = core.buildSummaryModel(buildConfig({ mainPromotion: 'none' }), prices);
  assert.ok(model.savings.totalSavings >= 0);
  assert.ok(model.savings.monthlySavings >= 0);
  assert.ok(model.savings.oneTimeSavings >= 0);
});

test('regresja kombajn: model stabilny i sensowny', () => {
  const model = core.buildSummaryModel(buildConfig({ customerStatus: 'existing', contractPeriod: '24', buildingType: 'MFH', internetSpeed: '1000/300', eInvoice: true, marketing: false, symmetricConnection: true, multiroomCount: 2, multiroomAssistance: true, wifiCount: 3, internetPlus: true, canalPlus: ['serialeFilmy', 'superSport'], bitdefender: 'familyPack', phoneService: true, mainPromotion: 'start', promoAddonTo1: true, promoMultiroomGift: true }), prices);
  assert.ok(model.finalMonthlyPrice > 0);
  assert.ok(model.finalOneTimePrice > 0);
  assert.ok(model.scheduleText.startsWith('3 mies. po 1,00 zł + potem'));
  assert.ok(model.benefitsBreakdown.length > 0);
  const copy = core.buildCopySummaryText(model, prices);
  assert.ok(copy.includes('Kalkulator GigaBOX'));
  assert.ok(copy.includes('Pozycje miesięczne:'));
});
