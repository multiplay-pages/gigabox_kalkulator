const STORAGE_KEY = 'gigabox_calculator_state_v4';

let prices = null;
let config = { ...CalculatorCore.DEFAULT_CONFIG };
const el = {};

function getSelectedValues(selector) {
  return [...document.querySelectorAll(`${selector}:checked`)].map((input) => input.value);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function restoreState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    config = CalculatorCore.normalizeConfig(raw);
  } catch {
    config = { ...CalculatorCore.DEFAULT_CONFIG };
  }
}

async function loadPrices() {
  const response = await fetch('./prices.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie udało się wczytać prices.json (HTTP ${response.status}).`);
  const payload = await response.json();
  prices = CalculatorCore.toCentsTree(payload.prices);
}

function renderRows(target, rows, emptyLabel = 'Brak') {
  target.innerHTML = rows.length
    ? rows.map((row) => `<div class="row"><span>${row.label}</span><strong>${CalculatorCore.money(row.value)}</strong></div>`).join('')
    : `<div class="row"><span>${emptyLabel}</span><strong>—</strong></div>`;
}

function renderTextRows(target, rows, emptyLabel = 'Brak') {
  target.innerHTML = rows.length
    ? rows.map((row) => `<div class="row"><span>${row.label}</span><strong>${row.text}</strong></div>`).join('')
    : `<div class="row"><span>${emptyLabel}</span><strong>—</strong></div>`;
}

function syncConfigToInputs() {
  const safe = CalculatorCore.enforceRules(config);
  config = safe;

  document.querySelector(`input[name="contractPeriod"][value="${config.contractPeriod}"]`).checked = true;
  document.querySelector(`input[name="buildingType"][value="${config.buildingType}"]`).checked = true;
  document.querySelector(`input[name="customerStatus"][value="${config.customerStatus}"]`).checked = true;
  document.querySelector(`input[name="bitdefender"][value="${config.bitdefender}"]`).checked = true;

  ['technicalLimit', 'eInvoice', 'marketing', 'symmetricConnection', 'multiroomAssistance', 'internetPlus', 'phoneService', 'promoAddonTo1', 'promoMultiroomGift']
    .forEach((id) => { document.getElementById(id).checked = !!config[id]; });

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => { input.checked = config.tvAddons.includes(input.value); });
  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => { input.checked = config.canalPlus.includes(input.value); });

  el.mainPromotion.value = config.mainPromotion;
  el.multiroomCount.value = String(config.multiroomCount);
  el.wifiCount.value = String(config.wifiCount);

  document.querySelectorAll('input[name="internetSpeed"]').forEach((input) => {
    const allowed = CalculatorCore.speedAllowed(config, input.value);
    input.disabled = !allowed;
    if (config.internetSpeed === input.value) input.checked = true;
    const card = input.closest('.option-card');
    if (card) card.classList.toggle('disabled', !allowed);
  });

  document.querySelectorAll('.option-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('selected', !!input?.checked);
  });

  ['600/100', '800/200', '1000/300', '2000/2000'].forEach((speed) => {
    const key = speed.replace('/', '-');
    const target = document.getElementById(`price-${key}`);
    if (!target) return;
    const value = prices.basePackage[config.contractPeriod][config.buildingType][config.customerStatus][speed];
    target.textContent = `od ${CalculatorCore.money(value)}/mies.`;
  });

  if (config.internetSpeed === '2000/2000') {
    el.symmetricConnection.checked = false;
    el.symmetricConnection.disabled = true;
    el.symmetricHint.textContent = '(w cenie przy 2000/2000)';
  } else {
    el.symmetricConnection.disabled = false;
    el.symmetricHint.textContent = config.customerStatus === 'existing' ? '(+5 zł/mies. dla obecnego klienta)' : '(+10 zł/mies.)';
  }
}

function render() {
  const model = CalculatorCore.buildSummaryModel(config, prices);
  config = model.config;

  syncConfigToInputs();

  renderRows(el.summaryMonthly, model.monthlyItems, 'Brak pozycji miesięcznych');
  renderRows(el.summaryOneTime, model.oneTimeItems, 'Brak kosztów jednorazowych');
  renderRows(el.sidebarMonthly, model.monthlyItems, 'Brak pozycji');

  const details = [
    { label: 'Okres umowy', text: `${model.config.contractPeriod} miesięcy` },
    { label: 'Typ budynku', text: model.config.buildingType === 'SFH' ? 'Domek (SFH)' : 'Blok (MFH)' },
    { label: 'Status klienta', text: model.config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient' },
    { label: 'Taryfa internetu', text: model.config.internetSpeed },
    { label: 'Minimalny okres świadczenia', text: `${prices.promoRules.minimumServiceMonths} pełne miesiące` },
    { label: 'Zmiana taryfy na droższą', text: 'w dowolnym momencie' },
    { label: 'Zmiana taryfy na tańszą', text: `po ${prices.promoRules.minimumServiceMonths} miesiącach` },
  ];
  renderTextRows(el.summaryDetails, details, 'Brak');

  renderTextRows(el.summaryBenefits, model.benefitsBreakdown, 'Brak aktywnych benefitów');

  el.totalMonthly.textContent = CalculatorCore.money(model.finalMonthlyPrice);
  el.totalOneTime.textContent = CalculatorCore.money(model.finalOneTimePrice);
  el.avgMonthly.textContent = CalculatorCore.money(model.avgMonthly);
  el.promoSchedule.textContent = model.scheduleText;
  el.promoSavings.textContent = CalculatorCore.money(model.savings.totalSavings);
  el.multiroomCountDisplay.textContent = `${model.config.multiroomCount} szt.`;
  el.wifiCountDisplay.textContent = `${model.config.wifiCount} szt.`;

  el.copySummaryBtn.onclick = async () => {
    try {
      const text = CalculatorCore.buildCopySummaryText(model, prices);
      await navigator.clipboard.writeText(text);
      el.copyStatus.textContent = 'Podsumowanie skopiowane.';
    } catch {
      el.copyStatus.textContent = 'Nie udało się skopiować podsumowania.';
    }
    setTimeout(() => { el.copyStatus.textContent = ''; }, 2000);
  };

  saveState();
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
      config.tvAddons = getSelectedValues('input[name="tvAddons"]');
      render();
    });
  });

  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
    input.addEventListener('change', () => {
      config.canalPlus = getSelectedValues('input[name="canalPlus"]');
      render();
    });
  });

  ['technicalLimit', 'eInvoice', 'marketing', 'symmetricConnection', 'multiroomAssistance', 'internetPlus', 'phoneService', 'promoAddonTo1', 'promoMultiroomGift']
    .forEach((id) => {
      document.getElementById(id).addEventListener('change', (event) => {
        config[id] = event.target.checked;
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
}

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(el, {
    loadStatus: document.getElementById('loadStatus'),
    mainPromotion: document.getElementById('mainPromotion'),
    multiroomCount: document.getElementById('multiroomCount'),
    wifiCount: document.getElementById('wifiCount'),
    symmetricConnection: document.getElementById('symmetricConnection'),
    symmetricHint: document.getElementById('symmetricHint'),
    summaryMonthly: document.getElementById('summaryMonthly'),
    summaryOneTime: document.getElementById('summaryOneTime'),
    summaryDetails: document.getElementById('summaryDetails'),
    summaryBenefits: document.getElementById('summaryBenefits'),
    sidebarMonthly: document.getElementById('sidebarMonthly'),
    totalMonthly: document.getElementById('totalMonthly'),
    totalOneTime: document.getElementById('totalOneTime'),
    avgMonthly: document.getElementById('avgMonthly'),
    promoSchedule: document.getElementById('promoSchedule'),
    promoSavings: document.getElementById('promoSavings'),
    multiroomCountDisplay: document.getElementById('multiroomCountDisplay'),
    wifiCountDisplay: document.getElementById('wifiCountDisplay'),
    copySummaryBtn: document.getElementById('copySummaryBtn'),
    copyStatus: document.getElementById('copyStatus'),
  });

  restoreState();

  try {
    await loadPrices();
  } catch (error) {
    el.loadStatus.textContent = error.message;
    el.loadStatus.classList.remove('hidden');
    return;
  }

  bindInputs();
  render();
});
