const STORAGE_KEY = 'gigabox_calculator_state_v6';

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
    'loadStatus', 'mainPromotion', 'externalMonthsWrap', 'externalMonthsLabel', 'externalMonthsInput', 'externalMonthsHint',
    'giftWrap', 'promotionGiftType', 'giftHint', 'bannerPromoEnabled',
    'multiroomCount', 'multiroomCountDisplay', 'wifiCount', 'wifiCountDisplay',
    'wifiInstallWrap', 'wifiInstallSelf', 'wifiInstallTechnician',
    'symmetricConnection', 'symmetricHint',
    'summaryMonthly', 'summaryOneTime', 'summaryDetails', 'summaryBenefits',
    'copySummaryBtn', 'copyStatus',
    'totalMonthly', 'totalOneTime', 'sidebarMeta', 'sidebarCosts', 'sidebarBenefits', 'avgMonthly', 'promoSchedule', 'promoSavings', 'sidebarNotes',
  ].forEach((id) => { el[id] = requiredElement(id); });
}

function showLoadError(message) {
  el.loadStatus.textContent = message;
  el.loadStatus.classList.remove('hidden');
}

function hideLoadError() {
  el.loadStatus.classList.add('hidden');
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

function renderMoneyRows(target, rows, emptyLabel = 'Brak') {
  target.innerHTML = rows.length
    ? rows.map((row) => `<div class="row"><span>${row.label}</span><strong>${CalculatorCore.money(row.value)}</strong></div>`).join('')
    : `<div class="row"><span>${emptyLabel}</span><strong>—</strong></div>`;
}

function renderTextRows(target, rows, emptyLabel = 'Brak') {
  target.innerHTML = rows.length
    ? rows.map((row) => `<div class="row"><span>${row.label}</span><strong>${row.text}</strong></div>`).join('')
    : `<div class="row"><span>${emptyLabel}</span><strong>—</strong></div>`;
}

function renderSidebarBenefits() {
  const items = state.model.benefitsBreakdown;
  el.sidebarBenefits.innerHTML = items.length
    ? items.map((item) => `<div class="benefit-item"><strong>${item.label}</strong><span>${item.text}</span></div>`).join('')
    : '<div class="benefit-item"><strong>Brak aktywnych benefitów</strong><span>Po wybraniu promocji pojawią się tutaj korzyści.</span></div>';
}

function renderSidebarMeta() {
  const rows = [
    { label: 'Okres', text: `${state.config.contractPeriod} miesięcy` },
    { label: 'Budynek', text: state.config.buildingType === 'SFH' ? 'Domek (SFH)' : 'Blok (MFH)' },
    { label: 'Status', text: state.config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient' },
    { label: 'Taryfa', text: state.config.internetSpeed },
  ];
  renderTextRows(el.sidebarMeta, rows);
}

function renderSidebarCosts() {
  const rows = [
    { label: 'Abonament bazowy', value: state.model.monthlyItems.find((item) => item.label.startsWith('Abonament bazowy'))?.value || 0 },
    { label: 'Korekty za zgody', value: state.model.monthlyItems.filter((item) => item.label.startsWith('Brak ')).reduce((sum, item) => sum + item.value, 0) },
    { label: 'Telefon', value: state.model.monthlyItems.filter((item) => item.label.includes('Telefon bez limitu')).reduce((sum, item) => sum + item.value, 0) },
    { label: 'Dodatki', value: state.model.monthlyItems.filter((item) => !item.label.startsWith('Abonament bazowy') && !item.label.startsWith('Brak ') && !item.label.includes('Telefon bez limitu') && !item.label.startsWith('WiFi Premium')).reduce((sum, item) => sum + item.value, 0) },
    { label: `WiFi Premium (${state.config.wifiCount}x)`, value: state.model.monthlyItems.filter((item) => item.label.startsWith('WiFi Premium')).reduce((sum, item) => sum + item.value, 0) },
    { label: 'Instalacja', value: state.model.oneTimeItems.find((item) => item.label === 'Instalacja Internet + TV')?.value || 0 },
    { label: 'Aktywacja dodatków', value: state.model.oneTimeItems.filter((item) => item.label !== 'Instalacja Internet + TV').reduce((sum, item) => sum + item.value, 0) },
  ];
  renderMoneyRows(el.sidebarCosts, rows, 'Brak');
}

function renderSchedule() {
  const rows = state.model.scheduleSegments.map((segment) => {
    const label = segment.from === segment.to ? `${segment.from} mies.` : `${segment.from}–${segment.to} mies.`;
    return `<div class="row"><span>${label}</span><strong>${CalculatorCore.money(segment.amount)} / mies.</strong></div>`;
  });
  el.promoSchedule.innerHTML = rows.join('');
}

function renderPromotionFields() {
  const options = state.model.availablePromotions;
  el.mainPromotion.innerHTML = options.map((option) => `<option value="${option.key}">${option.label}</option>`).join('');
  el.mainPromotion.value = state.config.mainPromotion;

  const promotionConfig = state.prices.promotions[state.config.mainPromotion] || state.prices.promotions.none;
  const isNew = state.config.customerStatus === 'new';

  if (state.model.showExternalRemainingMonths) {
    el.externalMonthsWrap.classList.remove('hidden');
    if (promotionConfig.mode === 'externalRemaining') {
      el.externalMonthsLabel.textContent = 'Miesiące pozostałe u obecnego operatora';
      el.externalMonthsHint.textContent = 'Maksymalnie 12 miesięcy promocji.';
      el.externalMonthsInput.max = String(promotionConfig.maxMonths || 12);
    } else {
      el.externalMonthsLabel.textContent = 'Miesiące pozostałe u obecnego operatora';
      el.externalMonthsHint.textContent = `Promocja = wpisane miesiące + ${promotionConfig.bonusMonths || 0}, maksymalnie ${promotionConfig.maxMonths || 24} miesiące.`;
      el.externalMonthsInput.max = String((promotionConfig.maxMonths || 24) - (promotionConfig.bonusMonths || 0));
    }
    el.externalMonthsInput.value = String(state.config.externalRemainingMonths);
  } else {
    el.externalMonthsWrap.classList.add('hidden');
  }

  if (state.model.showGiftSelector) {
    el.giftWrap.classList.remove('hidden');
    el.promotionGiftType.innerHTML = state.model.availableGiftOptions.map((option) => `<option value="${option.key}" ${option.disabled ? 'disabled' : ''}>${option.label}</option>`).join('');
    el.promotionGiftType.value = state.config.promotionGiftType;
    el.giftHint.textContent = 'Możesz wybrać dokładnie 1 prezent. Rabat WiFi dotyczy tylko 1 urządzenia MESH, pozostałe wg cennika.';
  } else {
    el.giftWrap.classList.add('hidden');
  }

  el.bannerPromoEnabled.checked = !!state.config.bannerPromoEnabled;
  el.bannerPromoEnabled.disabled = state.config.mainPromotion === 'none';

  el.sidebarNotes.textContent = isNew
    ? 'W okresie promocyjnym wyłączone są rabaty marketing i e-faktura.'
    : 'Brak e-faktury = +10 zł / mies. • Brak zgody marketingowej = +5 zł / mies. • WiFi Premium = opłata miesięczna i aktywacja za każde urządzenie • wyjazd technika +100 zł jednorazowo.';
}

function syncInputsWithConfig() {
  ['contractPeriod', 'buildingType', 'customerStatus', 'bitdefender'].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = state.config[name] === input.value;
    });
  });

  ['technicalLimit', 'eInvoice', 'marketing', 'symmetricConnection', 'internetPlus', 'phoneService'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.checked = !!state.config[id];
  });

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => {
    input.checked = state.config.tvAddons.includes(input.value);
  });
  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
    input.checked = state.config.canalPlus.includes(input.value);
  });
  document.querySelectorAll('input[name="internetSpeed"]').forEach((input) => {
    const allowed = CalculatorCore.speedAllowed(state.config, input.value);
    input.disabled = !allowed;
    input.checked = state.config.internetSpeed === input.value;
    input.closest('.option-card')?.classList.toggle('disabled', !allowed);
  });

  document.querySelectorAll('.option-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('selected', !!input?.checked);
  });

  ['600/100', '800/200', '1000/300', '2000/2000'].forEach((speed) => {
    const target = document.getElementById(`price-${speed.replace('/', '-')}`);
    if (!target) return;
    const value = state.prices.basePackage[state.config.contractPeriod][state.config.buildingType][state.config.customerStatus][speed];
    target.textContent = `od ${CalculatorCore.money(value)}/mies.`;
  });

  el.multiroomCount.value = String(state.config.multiroomCount);
  el.multiroomCountDisplay.textContent = `${state.config.multiroomCount} szt.`;
  el.wifiCount.value = String(state.config.wifiCount);
  el.wifiCountDisplay.textContent = `${state.config.wifiCount} szt.`;
  el.wifiInstallSelf.checked = state.config.wifiInstallType === 'self';
  el.wifiInstallTechnician.checked = state.config.wifiInstallType === 'technician';
  el.wifiInstallWrap.classList.toggle('hidden', Number(state.config.wifiCount) <= 0);

  const symmetricIncluded = state.config.internetSpeed === '2000/2000';
  el.symmetricConnection.disabled = symmetricIncluded;
  el.symmetricConnection.checked = symmetricIncluded ? true : !!state.config.symmetricConnection;
  el.symmetricHint.textContent = symmetricIncluded
    ? 'w cenie przy 2000/2000'
    : (state.config.customerStatus === 'existing' ? '+5 zł/mies. po rabacie' : '+10 zł/mies.');

  renderPromotionFields();
}

function render() {
  state.model = CalculatorCore.buildSummaryModel(state.config, state.prices);
  state.config = state.model.config;

  syncInputsWithConfig();
  renderMoneyRows(el.summaryMonthly, state.model.monthlyItems, 'Brak pozycji miesięcznych');
  renderMoneyRows(el.summaryOneTime, state.model.oneTimeItems, 'Brak kosztów jednorazowych');
  renderTextRows(el.summaryDetails, [
    { label: 'Okres umowy', text: `${state.config.contractPeriod} miesięcy` },
    { label: 'Typ budynku', text: state.config.buildingType === 'SFH' ? 'Domek (SFH)' : 'Blok (MFH)' },
    { label: 'Status klienta', text: state.config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient' },
    { label: 'Taryfa internetu', text: state.config.internetSpeed },
    { label: 'Minimalny okres świadczenia', text: `${state.prices.promoRules.minimumServiceMonths} pełne miesiące` },
    { label: 'Zmiana taryfy na droższą', text: 'w dowolnym momencie' },
    { label: 'Zmiana taryfy na tańszą', text: `po ${state.prices.promoRules.minimumServiceMonths} miesiącach` },
  ]);
  renderTextRows(el.summaryBenefits, state.model.benefitsBreakdown, 'Brak aktywnych benefitów');

  el.totalMonthly.textContent = CalculatorCore.money(state.model.finalMonthlyPrice);
  el.totalOneTime.textContent = CalculatorCore.money(state.model.finalOneTimePrice);
  el.avgMonthly.textContent = `${CalculatorCore.money(state.model.avgMonthly)} / mies.`;
  el.promoSavings.textContent = CalculatorCore.money(state.model.savings.totalSavings);

  renderSidebarMeta();
  renderSidebarCosts();
  renderSidebarBenefits();
  renderSchedule();

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
  bindRadio('wifiInstallType', 'wifiInstallType');

  ['tvAddons', 'canalPlus'].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        state.config[name] = getCheckedValues(`input[name="${name}"]`);
        render();
      });
    });
  });

  ['technicalLimit', 'eInvoice', 'marketing', 'symmetricConnection', 'internetPlus', 'phoneService', 'bannerPromoEnabled'].forEach((id) => {
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

  el.externalMonthsInput.addEventListener('input', (event) => {
    state.config.externalRemainingMonths = Number(event.target.value);
    render();
  });

  el.promotionGiftType.addEventListener('change', (event) => {
    state.config.promotionGiftType = event.target.value;
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
    state.config = CalculatorCore.enforceRules(state.config, state.prices);
    sanityCheck();
    hideLoadError();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    showLoadError(`Błąd inicjalizacji kalkulatora: ${error.message}`);
  }
});
