const STORAGE_KEY = 'gigabox_calculator_state_v5';

const state = {
  prices: null,
  config: null,
  model: null,
};

const el = {};

function requiredElement(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Brak wymaganego elementu DOM: #${id}`);
  return node;
}

function collectDom() {
  [
    'loadStatus', 'mainPromotion', 'multiroomCount', 'wifiCount', 'symmetricConnection', 'symmetricHint',
    'summaryMonthly', 'summaryOneTime', 'summaryDetails', 'summaryBenefits', 'sidebarMonthly',
    'totalMonthly', 'totalOneTime', 'avgMonthly', 'promoSchedule', 'promoSavings',
    'multiroomCountDisplay', 'wifiCountDisplay', 'copySummaryBtn', 'copyStatus',
  ].forEach((id) => { el[id] = requiredElement(id); });
}

function showLoadError(message) {
  if (!el.loadStatus) return;
  el.loadStatus.textContent = message;
  el.loadStatus.classList.remove('hidden');
}

function hideLoadError() {
  el.loadStatus?.classList.add('hidden');
}

function safeParseState(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function restoreState() {
  const parsed = safeParseState(localStorage.getItem(STORAGE_KEY) || '{}');
  state.config = CalculatorCore.normalizeConfig(parsed || {});
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

async function loadPrices() {
  const response = await fetch('./prices.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie udało się wczytać prices.json (HTTP ${response.status}).`);
  const payload = await response.json();
  state.prices = CalculatorCore.toCentsTree(payload.prices);
}

function getCheckedValues(selector) {
  return [...document.querySelectorAll(`${selector}:checked`)].map((node) => node.value);
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

function syncInputsWithConfig() {
  const config = state.config;
  document.querySelector(`input[name="contractPeriod"][value="${config.contractPeriod}"]`)?.setAttribute('checked', 'checked');
  document.querySelector(`input[name="buildingType"][value="${config.buildingType}"]`)?.setAttribute('checked', 'checked');
  document.querySelector(`input[name="customerStatus"][value="${config.customerStatus}"]`)?.setAttribute('checked', 'checked');
  document.querySelector(`input[name="bitdefender"][value="${config.bitdefender}"]`)?.setAttribute('checked', 'checked');

  ['contractPeriod', 'buildingType', 'customerStatus', 'bitdefender'].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.checked = state.config[name] === input.value; });
  });

  ['technicalLimit', 'eInvoice', 'marketing', 'symmetricConnection', 'multiroomAssistance', 'internetPlus', 'phoneService', 'promoAddonTo1', 'promoMultiroomGift']
    .forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.checked = !!state.config[id];
    });

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => { input.checked = state.config.tvAddons.includes(input.value); });
  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => { input.checked = state.config.canalPlus.includes(input.value); });
  document.querySelectorAll('input[name="internetSpeed"]').forEach((input) => {
    const allowed = CalculatorCore.speedAllowed(state.config, input.value);
    input.disabled = !allowed;
    input.checked = state.config.internetSpeed === input.value;
    input.closest('.option-card')?.classList.toggle('disabled', !allowed);
  });

  el.mainPromotion.value = state.config.mainPromotion;
  el.multiroomCount.value = String(state.config.multiroomCount);
  el.wifiCount.value = String(state.config.wifiCount);

  ['600/100', '800/200', '1000/300', '2000/2000'].forEach((speed) => {
    const id = `price-${speed.replace('/', '-')}`;
    const target = document.getElementById(id);
    if (!target) return;
    const value = state.prices.basePackage[state.config.contractPeriod][state.config.buildingType][state.config.customerStatus][speed];
    target.textContent = `od ${CalculatorCore.money(value)}/mies.`;
  });

  const symmetricIncluded = state.config.internetSpeed === '2000/2000';
  el.symmetricConnection.disabled = symmetricIncluded;
  if (symmetricIncluded) {
    el.symmetricConnection.checked = true;
    el.symmetricHint.textContent = '(w cenie przy 2000/2000)';
  } else if (state.config.customerStatus === 'existing') {
    el.symmetricHint.textContent = '(+5 zł/mies. po rabacie)';
  } else {
    el.symmetricHint.textContent = '(+10 zł/mies.)';
  }

  document.querySelectorAll('.option-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('selected', !!input?.checked);
  });
}

function render() {
  state.model = CalculatorCore.buildSummaryModel(state.config, state.prices);
  state.config = state.model.config;

  syncInputsWithConfig();

  renderRows(el.summaryMonthly, state.model.monthlyItems, 'Brak pozycji miesięcznych');
  renderRows(el.summaryOneTime, state.model.oneTimeItems, 'Brak kosztów jednorazowych');
  renderRows(el.sidebarMonthly, state.model.monthlyItems, 'Brak pozycji');

  const detailRows = [
    { label: 'Okres umowy', text: `${state.config.contractPeriod} miesięcy` },
    { label: 'Typ budynku', text: state.config.buildingType === 'SFH' ? 'Domek (SFH)' : 'Blok (MFH)' },
    { label: 'Status klienta', text: state.config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient' },
    { label: 'Taryfa internetu', text: state.config.internetSpeed },
    { label: 'Minimalny okres świadczenia', text: `${state.prices.promoRules.minimumServiceMonths} pełne miesiące` },
    { label: 'Zmiana taryfy na droższą', text: 'w dowolnym momencie' },
    { label: 'Zmiana taryfy na tańszą', text: `po ${state.prices.promoRules.minimumServiceMonths} miesiącach` },
  ];
  renderTextRows(el.summaryDetails, detailRows);
  renderTextRows(el.summaryBenefits, state.model.benefitsBreakdown, 'Brak aktywnych benefitów');

  el.totalMonthly.textContent = CalculatorCore.money(state.model.finalMonthlyPrice);
  el.totalOneTime.textContent = CalculatorCore.money(state.model.finalOneTimePrice);
  el.avgMonthly.textContent = CalculatorCore.money(state.model.avgMonthly);
  el.promoSchedule.textContent = state.model.scheduleText;
  el.promoSavings.textContent = CalculatorCore.money(state.model.savings.totalSavings);
  el.multiroomCountDisplay.textContent = `${state.config.multiroomCount} szt.`;
  el.wifiCountDisplay.textContent = `${state.config.wifiCount} szt.`;

  saveState();
}

async function copySummary() {
  const text = CalculatorCore.buildCopySummaryText(state.model, state.prices);
  await navigator.clipboard.writeText(text);
  el.copyStatus.textContent = 'Podsumowanie skopiowane.';
  setTimeout(() => { el.copyStatus.textContent = ''; }, 1800);
}

function bindEvents() {
  const bindRadio = (name, key) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        state.config[key] = input.value;
        render();
      });
    });
  };

  bindRadio('contractPeriod', 'contractPeriod');
  bindRadio('buildingType', 'buildingType');
  bindRadio('customerStatus', 'customerStatus');
  bindRadio('internetSpeed', 'internetSpeed');
  bindRadio('bitdefender', 'bitdefender');

  ['tvAddons', 'canalPlus'].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        state.config[name] = getCheckedValues(`input[name="${name}"]`);
        render();
      });
    });
  });

  ['technicalLimit', 'eInvoice', 'marketing', 'symmetricConnection', 'multiroomAssistance', 'internetPlus', 'phoneService', 'promoAddonTo1', 'promoMultiroomGift']
    .forEach((id) => {
      const node = document.getElementById(id);
      node?.addEventListener('change', (event) => {
        state.config[id] = event.target.checked;
        render();
      });
    });

  el.mainPromotion.addEventListener('change', (event) => {
    state.config.mainPromotion = event.target.value;
    render();
  });

  el.multiroomCount.addEventListener('input', (event) => {
    state.config.multiroomCount = Number(event.target.value);
    render();
  });

  el.wifiCount.addEventListener('input', (event) => {
    state.config.wifiCount = Number(event.target.value);
    render();
  });

  el.copySummaryBtn.addEventListener('click', () => {
    copySummary().catch(() => {
      el.copyStatus.textContent = 'Nie udało się skopiować podsumowania.';
    });
  });
}

function sanityCheck() {
  if (!globalThis.CalculatorCore) throw new Error('CalculatorCore nie jest dostępny.');
  if (!state.prices) throw new Error('Brak danych cenowych.');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    collectDom();
    restoreState();
    await loadPrices();
    sanityCheck();
    hideLoadError();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    showLoadError(`Błąd inicjalizacji kalkulatora: ${error.message}`);
  }
});
