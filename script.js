const STORAGE_KEY = 'gigabox_calculator_state_v3';

const DEFAULT_CONFIG = {
  contractPeriod: '24',
  buildingType: 'SFH',
  customerStatus: 'new',
  technicalLimit: false,
  internetSpeed: '600/100',
  eInvoice: true,
  marketing: true,
  symmetricConnection: false,
  multiroomCount: 0,
  multiroomAssistance: false,
  tvAddons: [],
  wifiCount: 0,
  internetPlus: false,
  canalPlus: [],
  bitdefender: 'none',
  phoneService: false,
  mainPromotion: 'none',
  promoAddonTo1: false,
  promoMultiroomGift: false,
};

let pricing = null;
let config = structuredClone(DEFAULT_CONFIG);
const el = {};

const money = (cents) => `${(cents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const toCentsTree = (value) => {
  if (typeof value === 'number') return Math.round(value * 100);
  if (Array.isArray(value)) return value.map(toCentsTree);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toCentsTree(v)]));
  return value;
};

function loadState() {
  try {
    config = { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) };
  } catch {
    config = structuredClone(DEFAULT_CONFIG);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

async function loadPricing() {
  const response = await fetch('./prices.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie udało się wczytać cennika (HTTP ${response.status}).`);
  const data = await response.json();
  pricing = toCentsTree(data.prices);
}

function speedAllowed(speed) {
  if (!['100/10', '350/35', '500/100'].includes(speed)) return true;
  return config.technicalLimit;
}

function enforceRules() {
  if (!speedAllowed(config.internetSpeed)) config.internetSpeed = '600/100';
  if (config.internetSpeed === '2000/2000') config.symmetricConnection = false;
  if (config.customerStatus !== 'existing') {
    config.promoAddonTo1 = false;
    config.promoMultiroomGift = false;
  }
}

function calculate() {
  const monthly = [];
  const oneTime = [];
  const promos = [];

  const base = pricing.basePackage[config.contractPeriod][config.buildingType][config.customerStatus][config.internetSpeed];
  monthly.push({ label: 'Abonament bazowy (Internet + TV Multi + sprzęt + utrzymanie linii)', value: base });

  let consentCorrections = 0;
  if (!config.eInvoice) consentCorrections += pricing.consents.eInvoicePenalty;
  if (!config.marketing) consentCorrections += pricing.consents.marketingPenalty;
  if (consentCorrections > 0) monthly.push({ label: 'Korekta za brak zgód', value: consentCorrections });

  if (config.symmetricConnection) {
    const discount = config.customerStatus === 'existing' ? pricing.symmetricConnection.existingDiscount : 0;
    monthly.push({ label: 'Łącze symetryczne', value: pricing.symmetricConnection.price - discount });
    if (discount > 0) promos.push({ label: 'Rabat obecnego klienta na łącze symetryczne', value: discount });
  }

  let multiroomMonthlyUnit = pricing.multiroom.monthly;
  let wifiMonthlyUnit = pricing.wifiPremium.monthly;

  if (config.customerStatus === 'existing' && config.promoAddonTo1) {
    multiroomMonthlyUnit = pricing.promo.reducedAddonPrice;
    wifiMonthlyUnit = pricing.promo.reducedAddonPrice;
    promos.push({ label: 'Obniżenie Multiroom / WiFi Premium do 1 zł', value: 0 });
  }

  let freeGiftApplied = false;
  if (config.multiroomCount > 0) {
    let chargeableCount = config.multiroomCount;
    if (config.customerStatus === 'existing' && config.promoMultiroomGift) {
      chargeableCount -= 1;
      freeGiftApplied = true;
      promos.push({ label: 'Multiroom w prezencie (1 szt.)', value: 0 });
    }

    if (chargeableCount > 0) {
      monthly.push({ label: `Multiroom (${config.multiroomCount} szt.)`, value: chargeableCount * multiroomMonthlyUnit });
      oneTime.push({ label: `Aktywacja Multiroom (${config.multiroomCount} szt.)`, value: chargeableCount * pricing.multiroom.activation });
    }
  }

  if (config.multiroomAssistance && config.multiroomCount > 0) {
    oneTime.push({ label: 'Asysta technika do Multiroom', value: pricing.multiroom.technicianAssistance });
  }

  const tvAddonPrices = { pvrM: 1000, pvrL: 1500, tvMax: 4000 };
  const tvAddonLabels = { pvrM: 'PVR M', pvrL: 'PVR L', tvMax: 'TV Max' };
  config.tvAddons.forEach((key) => monthly.push({ label: tvAddonLabels[key], value: tvAddonPrices[key] }));

  if (config.wifiCount > 0) {
    monthly.push({ label: `WiFi Premium (${config.wifiCount} szt.)`, value: wifiMonthlyUnit * config.wifiCount });
    oneTime.push({ label: `Aktywacja WiFi Premium (${config.wifiCount} szt.)`, value: pricing.wifiPremium.activation * config.wifiCount });
  }

  if (config.internetPlus) monthly.push({ label: 'Internet+', value: pricing.internetPlus });

  const canalLabels = {
    superSport: 'Canal+ Super Sport (12 mies.)',
    serialeFilmy: 'Canal+ Seriale i Filmy (12 mies.)',
    entry: 'Canal+ Entry (12 mies.)',
  };
  config.canalPlus.forEach((key) => monthly.push({ label: canalLabels[key], value: pricing.canalPlus[key] }));

  const bitdefenderLabels = {
    internetSecurity1: 'Bitdefender Internet Security 1',
    internetSecurity3: 'Bitdefender Internet Security 3',
    mobile: 'Bitdefender Mobile',
    familyPack: 'Bitdefender Family Pack',
    antivirusMac1: 'Bitdefender Antivirus Mac 1',
    antivirusMac3: 'Bitdefender Antivirus Mac 3',
  };
  if (config.bitdefender !== 'none') {
    monthly.push({ label: bitdefenderLabels[config.bitdefender], value: pricing.bitdefender[config.bitdefender] });
  }

  if (config.phoneService) monthly.push({ label: 'Telefon bez limitu Max', value: pricing.phoneService });

  oneTime.unshift({ label: 'Instalacja Internet + TV', value: pricing.installation });

  const months = Number(config.contractPeriod);
  const monthlyTotal = monthly.reduce((sum, item) => sum + item.value, 0);
  const oneTimeTotal = oneTime.reduce((sum, item) => sum + item.value, 0);

  let promoMonthlyPrice = null;
  let promoSavings = 0;

  if (config.mainPromotion !== 'none') {
    const promoMonths = pricing.promo.monthsFor1zl;
    const promoPrice = pricing.promo.promoMonthlyPrice;
    promoMonthlyPrice = `${promoMonths} mies. po ${money(promoPrice)} • potem ${money(monthlyTotal)}`;
    promoSavings += (monthlyTotal - promoPrice) * promoMonths;
    promos.push({ label: `${config.mainPromotion.toUpperCase()}: miesiące za 1 zł`, value: promoSavings });
  }

  if (config.customerStatus === 'existing' && config.promoAddonTo1) {
    const reductionMR = config.multiroomCount * (pricing.multiroom.monthly - multiroomMonthlyUnit) * months;
    const reductionWifi = config.wifiCount * (pricing.wifiPremium.monthly - wifiMonthlyUnit) * months;
    promoSavings += reductionMR + reductionWifi;
  }

  if (freeGiftApplied) {
    promoSavings += pricing.multiroom.activation + (pricing.multiroom.monthly - multiroomMonthlyUnit) * months;
  }

  const avgMonthly = Math.round((monthlyTotal * months + oneTimeTotal - promoSavings) / months);

  return {
    monthly,
    oneTime,
    promos,
    monthlyTotal,
    oneTimeTotal,
    avgMonthly,
    promoSavings,
    promoMonthlyPrice,
  };
}

function row(item) {
  return `<div class="row"><span>${item.label}</span><strong>${money(item.value)}</strong></div>`;
}

function renderList(target, items, emptyLabel = 'Brak') {
  target.innerHTML = items.length ? items.map(row).join('') : `<div class="row"><span>${emptyLabel}</span><strong>—</strong></div>`;
}

function refreshOptionStates() {
  document.querySelectorAll('.option-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('selected', !!input?.checked);
    if (card.dataset.speed) card.classList.toggle('disabled', !speedAllowed(card.dataset.speed));
  });
}

function render() {
  enforceRules();

  document.querySelectorAll('input[name="internetSpeed"]').forEach((input) => {
    input.disabled = !speedAllowed(input.value);
    input.checked = config.internetSpeed === input.value;
  });

  const results = calculate();

  renderList(el.summaryMonthly, results.monthly, 'Brak pozycji miesięcznych');
  renderList(el.summaryOneTime, results.oneTime, 'Brak opłat jednorazowych');
  renderList(el.summaryPromos, results.promos, 'Brak aktywnych promocji');
  renderList(el.sidebarMonthly, results.monthly, 'Brak');

  const details = [
    { label: 'Okres umowy', value: config.contractPeriod + ' miesięcy' },
    { label: 'Typ budynku', value: config.buildingType === 'SFH' ? 'Domek' : 'Blok' },
    { label: 'Status klienta', value: config.customerStatus === 'new' ? 'Nowy' : 'Obecny' },
    { label: 'Taryfa internetowa', value: config.internetSpeed },
    { label: 'Minimalny okres świadczenia', value: pricing.promo.minimumServiceMonths + ' pełne miesiące' },
    { label: 'Zmiana taryfy na niższą', value: 'po 3 miesiącach' },
    { label: 'Zmiana taryfy na wyższą', value: 'w dowolnym momencie' },
  ];

  el.summaryDetails.innerHTML = details.map((d) => `<div class="row"><span>${d.label}</span><strong>${d.value}</strong></div>`).join('');
  el.sidebarDetails.innerHTML = el.summaryDetails.innerHTML;

  el.totalMonthly.textContent = money(results.monthlyTotal);
  el.totalOneTime.textContent = money(results.oneTimeTotal);
  el.avgMonthly.textContent = money(results.avgMonthly);
  el.promoSavings.textContent = money(results.promoSavings);
  el.promoMonthlyDisplay.textContent = results.promoMonthlyPrice || 'Brak';

  el.multiroomCountDisplay.textContent = `${config.multiroomCount} szt.`;
  el.wifiCountDisplay.textContent = `${config.wifiCount} szt.`;

  saveState();
  refreshOptionStates();
}

async function copySummary() {
  const results = calculate();
  const lines = [
    'Kalkulator GigaBOX 03.2026',
    '',
    'Cena końcowa:',
    `- Miesięcznie: ${money(results.monthlyTotal)}`,
    `- Jednorazowo: ${money(results.oneTimeTotal)}`,
    `- Uśredniona wartość abonamentu: ${money(results.avgMonthly)}`,
    `- Abonament w okresach promocji: ${results.promoMonthlyPrice || 'Brak'}`,
    `- Łączna oszczędność z promocji: ${money(results.promoSavings)}`,
    '',
    'Pozycje miesięczne:',
  ];

  results.monthly.forEach((item) => lines.push(`- ${item.label}: ${money(item.value)}`));
  lines.push('', 'Pozycje jednorazowe:');
  results.oneTime.forEach((item) => lines.push(`- ${item.label}: ${money(item.value)}`));

  await navigator.clipboard.writeText(lines.join('\n'));
  el.copyStatus.textContent = 'Podsumowanie skopiowane.';
  setTimeout(() => { el.copyStatus.textContent = ''; }, 2000);
}

function bindInputs() {
  const bindRadio = (name, key) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          config[key] = input.value;
          render();
        }
      });
    });
  };

  bindRadio('contractPeriod', 'contractPeriod');
  bindRadio('buildingType', 'buildingType');
  bindRadio('customerStatus', 'customerStatus');
  bindRadio('internetSpeed', 'internetSpeed');
  bindRadio('bitdefender', 'bitdefender');

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => {
    input.addEventListener('change', () => {
      config.tvAddons = [...document.querySelectorAll('input[name="tvAddons"]:checked')].map((elx) => elx.value);
      render();
    });
  });

  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
    input.addEventListener('change', () => {
      config.canalPlus = [...document.querySelectorAll('input[name="canalPlus"]:checked')].map((elx) => elx.value);
      render();
    });
  });

  const boolBindings = [
    ['technicalLimit', 'technicalLimit'],
    ['eInvoice', 'eInvoice'],
    ['marketing', 'marketing'],
    ['symmetricConnection', 'symmetricConnection'],
    ['multiroomAssistance', 'multiroomAssistance'],
    ['internetPlus', 'internetPlus'],
    ['phoneService', 'phoneService'],
    ['promoAddonTo1', 'promoAddonTo1'],
    ['promoMultiroomGift', 'promoMultiroomGift'],
  ];

  boolBindings.forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', (event) => {
      config[key] = event.target.checked;
      render();
    });
  });

  el.mainPromotion.addEventListener('change', (event) => {
    config.mainPromotion = event.target.value;
    render();
  });

  el.multiroomCount.addEventListener('input', (event) => {
    config.multiroomCount = Number(event.target.value);
    render();
  });

  el.wifiCount.addEventListener('input', (event) => {
    config.wifiCount = Number(event.target.value);
    render();
  });

  el.copySummaryBtn.addEventListener('click', () => {
    copySummary().catch(() => {
      el.copyStatus.textContent = 'Nie udało się skopiować podsumowania.';
    });
  });
}

function applyConfigToInputs() {
  document.querySelector(`input[name="contractPeriod"][value="${config.contractPeriod}"]`).checked = true;
  document.querySelector(`input[name="buildingType"][value="${config.buildingType}"]`).checked = true;
  document.querySelector(`input[name="customerStatus"][value="${config.customerStatus}"]`).checked = true;
  document.querySelector(`input[name="bitdefender"][value="${config.bitdefender}"]`).checked = true;

  document.getElementById('technicalLimit').checked = config.technicalLimit;
  document.getElementById('eInvoice').checked = config.eInvoice;
  document.getElementById('marketing').checked = config.marketing;
  document.getElementById('symmetricConnection').checked = config.symmetricConnection;
  document.getElementById('multiroomAssistance').checked = config.multiroomAssistance;
  document.getElementById('internetPlus').checked = config.internetPlus;
  document.getElementById('phoneService').checked = config.phoneService;
  document.getElementById('promoAddonTo1').checked = config.promoAddonTo1;
  document.getElementById('promoMultiroomGift').checked = config.promoMultiroomGift;

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => { input.checked = config.tvAddons.includes(input.value); });
  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => { input.checked = config.canalPlus.includes(input.value); });

  el.mainPromotion.value = config.mainPromotion;
  el.multiroomCount.value = String(config.multiroomCount);
  el.wifiCount.value = String(config.wifiCount);

  ['600/100', '800/200', '1000/300', '2000/2000'].forEach((speed) => {
    const label = document.querySelector(`[data-speed="${speed}"] small`);
    const price = pricing.basePackage[config.contractPeriod][config.buildingType][config.customerStatus][speed];
    if (label) label.textContent = `od ${money(price)}/mies.`;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(el, {
    loadStatus: document.getElementById('loadStatus'),
    summaryMonthly: document.getElementById('summaryMonthly'),
    summaryOneTime: document.getElementById('summaryOneTime'),
    summaryDetails: document.getElementById('summaryDetails'),
    summaryPromos: document.getElementById('summaryPromos'),
    sidebarMonthly: document.getElementById('sidebarMonthly'),
    sidebarDetails: document.getElementById('sidebarDetails'),
    totalMonthly: document.getElementById('totalMonthly'),
    totalOneTime: document.getElementById('totalOneTime'),
    avgMonthly: document.getElementById('avgMonthly'),
    promoMonthlyDisplay: document.getElementById('promoMonthlyDisplay'),
    promoSavings: document.getElementById('promoSavings'),
    multiroomCount: document.getElementById('multiroomCount'),
    wifiCount: document.getElementById('wifiCount'),
    multiroomCountDisplay: document.getElementById('multiroomCountDisplay'),
    wifiCountDisplay: document.getElementById('wifiCountDisplay'),
    mainPromotion: document.getElementById('mainPromotion'),
    copySummaryBtn: document.getElementById('copySummaryBtn'),
    copyStatus: document.getElementById('copyStatus'),
  });

  loadState();

  try {
    await loadPricing();
  } catch (error) {
    el.loadStatus.textContent = error.message;
    el.loadStatus.classList.remove('hidden');
    return;
  }

  applyConfigToInputs();
  bindInputs();
  render();
});
