const STORAGE_KEY = 'gigabox_calculator_state_v1';
const DEFAULT_CONFIG = {
  customerStatus: 'new',
  contractPeriod: '24',
  buildingType: 'SFH',
  internetSpeed: '600/100',
  symmetricConnection: false,
  eInvoice: true,
  marketing: true,
  multiroomCount: 0,
  multiroomActivationType: 'selfinstall',
  wifiCount: 0,
  tvAddons: [],
  internetAddons: [],
  bitdefender: [],
  phoneService: false,
  canalPlus: null,
};

let config = structuredClone(DEFAULT_CONFIG);
let currentStep = 1;
let pricing = null;
let labels = null;
let toastTimer = null;

const elements = {};

function formatMoney(cents) {
  const value = cents / 100;
  return `${value.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} zł`;
}

function toCentsTree(value) {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }

  if (Array.isArray(value)) {
    return value.map(toCentsTree);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toCentsTree(item)]));
  }

  return value;
}

async function loadCatalog() {
  const response = await fetch('./prices.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Nie udało się wczytać prices.json (HTTP ${response.status}).`);
  }

  const data = await response.json();
  pricing = toCentsTree(data.prices);
  labels = data.labels;
}

function showLoadError(message) {
  const box = elements.loadStatus;
  if (!box) return;
  box.textContent = `${message} Sprawdź, czy prices.json leży w tym samym folderze co index.html.`;
  box.classList.remove('hidden');
}

function hideLoadError() {
  elements.loadStatus?.classList.add('hidden');
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 2200);
}

function cloneDefaultConfig() {
  return structuredClone(DEFAULT_CONFIG);
}

function restoreState() {
  const savedRaw = localStorage.getItem(STORAGE_KEY);
  if (!savedRaw) return;

  try {
    const saved = JSON.parse(savedRaw);
    config = { ...cloneDefaultConfig(), ...(saved.config || {}) };
    currentStep = Number.isInteger(saved.currentStep) ? saved.currentStep : 1;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      config,
      currentStep,
    })
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rowHtml(item, className) {
  return `
    <div class="${className}">
      <span>${escapeHtml(item.label)}</span>
      <span>${formatMoney(item.value)}</span>
    </div>
  `;
}

function renderRows(target, items, className, emptyLabel = 'Brak pozycji') {
  if (!target) return;

  if (!items.length) {
    target.innerHTML = rowHtml({ label: emptyLabel, value: 0 }, className).replace(`>${formatMoney(0)}<`, '>—<');
    return;
  }

  target.innerHTML = items.map((item) => rowHtml(item, className)).join('');
}

function getConsentPenaltyLabel() {
  if (!config.eInvoice && !config.marketing) return 'Brak zgód';
  if (!config.eInvoice) return 'Brak e-faktury';
  if (!config.marketing) return 'Brak zgody marketingowej';
  return '';
}

function getInternetComponents() {
  const base = pricing.internetBase[config.internetSpeed];
  const rent = pricing.equipmentRent[config.buildingType][config.contractPeriod];
  const line = pricing.lineMaintenance[config.buildingType];
  const consentPenalty = (config.eInvoice ? 0 : 1000) + (config.marketing ? 0 : 500);

  return { base, rent, line, consentPenalty };
}

function calculateTotals() {
  const monthlyItems = [];
  const oneTimeItems = [];

  const internet = getInternetComponents();
  monthlyItems.push({ label: `Internet Net* ${config.internetSpeed}`, value: internet.base, group: 'basic' });
  monthlyItems.push({ label: 'Dzierżawa sprzętu', value: internet.rent, group: 'basic' });
  monthlyItems.push({ label: 'Utrzymanie linii', value: internet.line, group: 'basic' });

  if (internet.consentPenalty > 0) {
    monthlyItems.push({ label: getConsentPenaltyLabel(), value: internet.consentPenalty, group: 'basic' });
  }

  if (config.symmetricConnection && config.internetSpeed !== '2000/2000') {
    monthlyItems.push({ label: 'Łącze symetryczne', value: pricing.symmetricConnection, group: 'basic' });
  }

  monthlyItems.push({ label: 'TV Multi', value: pricing.tvMulti, group: 'basic' });

  if (config.multiroomCount > 0) {
    monthlyItems.push({
      label: `Multiroom (${config.multiroomCount} szt.)`,
      value: config.multiroomCount * pricing.multiroomMonthly,
      group: 'tv',
    });

    oneTimeItems.push({
      label: `Aktywacja dekoderów (${config.multiroomCount} szt.)`,
      value: config.multiroomCount * pricing.multiroomActivation,
    });

    if (config.multiroomActivationType === 'assistance') {
      oneTimeItems.push({ label: 'Asysta techniczna', value: pricing.multiroomAssistance });
    }
  }

  config.tvAddons.forEach((addon) => {
    monthlyItems.push({ label: labels.tvAddons[addon], value: pricing.tvAddons[addon], group: 'tv' });
  });

  if (config.canalPlus) {
    monthlyItems.push({
      label: `${labels.canalPlus[config.canalPlus]} (zobowiązanie 12 mies.)`,
      value: pricing.canalPlus[config.canalPlus],
      group: 'tv',
    });
  }

  if (config.wifiCount > 0) {
    monthlyItems.push({
      label: `WiFi Premium (${config.wifiCount} szt.)`,
      value: config.wifiCount * pricing.wifiMonthly,
      group: 'internet',
    });

    oneTimeItems.push({
      label: `Aktywacja WiFi Premium (${config.wifiCount} szt.)`,
      value: config.wifiCount * pricing.wifiActivation,
    });
  }

  config.internetAddons.forEach((addon) => {
    monthlyItems.push({ label: labels.internetAddons[addon], value: pricing.internetAddons[addon], group: 'internet' });
  });

  config.bitdefender.forEach((addon) => {
    monthlyItems.push({ label: labels.bitdefender[addon], value: pricing.bitdefender[addon], group: 'internet' });
  });

  if (config.phoneService) {
    monthlyItems.push({ label: 'Telefon bez limitu Max', value: pricing.phoneService, group: 'phone' });
  }

  const installationPrice = pricing.installation[config.customerStatus];
  if (installationPrice > 0) {
    oneTimeItems.unshift({ label: 'Instalacja Internet + TV', value: installationPrice });
  }

  const totalMonthly = monthlyItems.reduce((sum, item) => sum + item.value, 0);
  const totalOneTime = oneTimeItems.reduce((sum, item) => sum + item.value, 0);

  return { monthlyItems, oneTimeItems, totalMonthly, totalOneTime };
}

function buildSummaryText() {
  const result = calculateTotals();
  const lines = ['Kalkulator GigaBOX 3.1', '', 'Miesięcznie:'];

  result.monthlyItems.forEach((item) => {
    lines.push(`- ${item.label}: ${formatMoney(item.value)}`);
  });

  lines.push(`Razem miesięcznie: ${formatMoney(result.totalMonthly)}`);
  lines.push('');
  lines.push('Jednorazowo:');

  if (result.oneTimeItems.length) {
    result.oneTimeItems.forEach((item) => {
      lines.push(`- ${item.label}: ${formatMoney(item.value)}`);
    });
  } else {
    lines.push('- Brak opłat jednorazowych');
  }

  lines.push(`Razem jednorazowo: ${formatMoney(result.totalOneTime)}`);
  lines.push('');
  lines.push('Parametry:');
  lines.push(`- Okres: ${config.contractPeriod} miesięcy`);
  lines.push(`- Budynek: ${config.buildingType === 'SFH' ? 'Dom (SFH)' : 'Budynek (MFH)'}`);
  lines.push(`- Status: ${config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient'}`);
  lines.push(`- Taryfa: ${config.internetSpeed}`);
  lines.push(`- E-faktura: ${config.eInvoice ? 'Tak' : 'Nie'}`);
  lines.push(`- Zgoda marketingowa: ${config.marketing ? 'Tak' : 'Nie'}`);

  return lines.join('\n');
}

async function copySummary() {
  const text = buildSummaryText();

  try {
    await navigator.clipboard.writeText(text);
    if (elements.copyStatus) {
      elements.copyStatus.textContent = 'Podsumowanie skopiowane do schowka.';
      window.setTimeout(() => {
        if (elements.copyStatus.textContent === 'Podsumowanie skopiowane do schowka.') {
          elements.copyStatus.textContent = '';
        }
      }, 2200);
    }
    showToast('Skopiowano podsumowanie.');
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = text;
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand('copy');
    document.body.removeChild(fallback);
    showToast('Skopiowano podsumowanie.');
  }
}

function updateInternetPriceLabels() {
  Object.entries(pricing.internetBase).forEach(([speed, value]) => {
    const target = document.getElementById(`price-${speed.replace('/', '-')}`);
    if (target) {
      target.textContent = `Net* ${formatMoney(value)} / mies.`;
    }
  });
}

function refreshSelectionStates() {
  document.querySelectorAll('.option-card').forEach((card) => {
    const input = card.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!input) return;
    card.classList.toggle('selected', input.checked);
  });
}

function updateCanalPlusVisibility() {
  elements.canalPlusSection.classList.remove('hidden');
}

function updateSymmetricVisibility() {
  const shouldShow = config.internetSpeed !== '2000/2000';
  elements.symmetricSection.classList.toggle('hidden', !shouldShow);

  if (!shouldShow) {
    elements.symmetricConnection.checked = false;
    config.symmetricConnection = false;
  }
}

function syncSliderLabels() {
  elements.multiroomCountDisplay.textContent = `${config.multiroomCount} szt.`;
  elements.wifiCountDisplay.textContent = `${config.wifiCount} szt.`;
  elements.multiroomActivation.classList.toggle('hidden', config.multiroomCount === 0);
}

function applyConfigToUI() {
  document.querySelector(`input[name="customerStatus"][value="${config.customerStatus}"]`).checked = true;
  document.querySelector(`input[name="contractPeriod"][value="${config.contractPeriod}"]`).checked = true;
  document.querySelector(`input[name="buildingType"][value="${config.buildingType}"]`).checked = true;
  document.querySelector(`input[name="internetSpeed"][value="${config.internetSpeed}"]`).checked = true;

  elements.symmetricConnection.checked = config.symmetricConnection;
  elements.eInvoice.checked = config.eInvoice;
  elements.marketing.checked = config.marketing;
  elements.multiroomCount.value = String(config.multiroomCount);
  elements.wifiCount.value = String(config.wifiCount);
  elements.phoneService.checked = config.phoneService;

  document.querySelector(`input[name="multiroomActivationType"][value="${config.multiroomActivationType}"]`).checked = true;

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => {
    input.checked = config.tvAddons.includes(input.value);
  });

  document.querySelectorAll('input[name="internetAddons"]').forEach((input) => {
    input.checked = config.internetAddons.includes(input.value);
  });

  document.querySelectorAll('input[name="bitdefender"]').forEach((input) => {
    input.checked = config.bitdefender.includes(input.value);
  });

  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
    input.checked = config.canalPlus === input.value;
  });

  syncSliderLabels();
  updateCanalPlusVisibility();
  updateSymmetricVisibility();
  refreshSelectionStates();
}

function renderSidebarSummary(result) {
  renderRows(elements.sidebarMonthly, result.monthlyItems, 'sidebar-row');
  renderRows(elements.sidebarOneTime, result.oneTimeItems, 'sidebar-row', 'Brak opłat jednorazowych');

  elements.sidebarTotalMonthly.textContent = formatMoney(result.totalMonthly);
  elements.sidebarTotalOneTime.textContent = formatMoney(result.totalOneTime);

  elements.mobileMonthly.innerHTML = elements.sidebarMonthly.innerHTML;
  elements.mobileOneTime.innerHTML = elements.sidebarOneTime.innerHTML;
  elements.mobileTotalMonthly.textContent = formatMoney(result.totalMonthly);
  elements.mobileTotalOneTime.textContent = formatMoney(result.totalOneTime);

  elements.mobileBarMonthly.textContent = formatMoney(result.totalMonthly);
  elements.mobileBarOneTime.textContent = formatMoney(result.totalOneTime);
}

function renderFinalSummary(result) {
  const basicItems = result.monthlyItems.filter((item) => item.group === 'basic');
  const tvItems = result.monthlyItems.filter((item) => item.group === 'tv');
  const internetItems = result.monthlyItems.filter((item) => item.group === 'internet');
  const phoneItems = result.monthlyItems.filter((item) => item.group === 'phone');

  renderRows(elements.basicServices, basicItems, 'summary-row');
  renderRows(elements.tvAddonsList, tvItems, 'summary-row', 'Brak dodatków TV');
  renderRows(elements.internetAddonsList, internetItems, 'summary-row', 'Brak dodatków Internet');
  renderRows(elements.phoneList, phoneItems, 'summary-row', 'Brak telefonu');
  renderRows(elements.oneTimeSummary, result.oneTimeItems, 'summary-row', 'Brak opłat jednorazowych');

  elements.tvAddonsSectionSummary.classList.toggle('hidden', tvItems.length === 0);
  elements.internetAddonsSectionSummary.classList.toggle('hidden', internetItems.length === 0);
  elements.phoneSectionSummary.classList.toggle('hidden', phoneItems.length === 0);

  elements.totalMonthly.textContent = formatMoney(result.totalMonthly);
  elements.totalOneTime.textContent = formatMoney(result.totalOneTime);

  const contractRows = [
    { label: 'Okres', value: `${config.contractPeriod} miesięcy` },
    { label: 'Budynek', value: config.buildingType === 'SFH' ? 'Dom (SFH)' : 'Budynek (MFH)' },
    { label: 'Status', value: config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient' },
    { label: 'Taryfa', value: config.internetSpeed },
    { label: 'E-faktura', value: config.eInvoice ? 'Tak' : 'Nie' },
    { label: 'Zgoda marketingowa', value: config.marketing ? 'Tak' : 'Nie' },
  ];

  elements.contractInfo.innerHTML = contractRows
    .map(
      (item) => `
        <div class="summary-row">
          <span>${escapeHtml(item.label)}</span>
          <span>${escapeHtml(item.value)}</span>
        </div>
      `
    )
    .join('');
}

function goToStep(step) {
  if (!pricing || step < 1 || step > 5) return;

  document.querySelectorAll('.step-panel').forEach((panel, index) => {
    panel.classList.toggle('hidden', index + 1 !== step);
  });

  document.querySelectorAll('.progress-step').forEach((button, index) => {
    button.classList.toggle('active', index + 1 === step);
  });

  currentStep = step;

  elements.prevBtn.disabled = currentStep === 1;
  if (currentStep === 5) {
    elements.nextBtn.textContent = 'Gotowe';
    elements.nextBtn.disabled = true;
  } else {
    elements.nextBtn.textContent = 'Dalej →';
    elements.nextBtn.disabled = false;
  }

  saveState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changeStep(direction) {
  goToStep(currentStep + direction);
}

function openMobileSummary() {
  elements.mobileSummaryDrawer.classList.remove('hidden');
  elements.mobileSummaryDrawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeMobileSummary() {
  elements.mobileSummaryDrawer.classList.add('hidden');
  elements.mobileSummaryDrawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function refresh() {
  if (!pricing) return;

  updateCanalPlusVisibility();
  updateSymmetricVisibility();
  syncSliderLabels();
  updateInternetPriceLabels();
  refreshSelectionStates();

  const result = calculateTotals();
  renderSidebarSummary(result);
  renderFinalSummary(result);
  saveState();
}

function bindRadioGroup(selector, key) {
  document.querySelectorAll(selector).forEach((input) => {
    input.addEventListener('change', (event) => {
      config[key] = event.target.value;
      refresh();
    });
  });
}

function bindCheckboxArray(selector, key) {
  document.querySelectorAll(selector).forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        if (!config[key].includes(event.target.value)) {
          config[key].push(event.target.value);
        }
      } else {
        config[key] = config[key].filter((value) => value !== event.target.value);
      }
      refresh();
    });
  });
}

function bindEvents() {
  document.querySelectorAll('[data-go-step]').forEach((button) => {
    button.addEventListener('click', () => goToStep(Number(button.dataset.goStep)));
  });

  document.querySelectorAll('.progress-step').forEach((button) => {
    button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
  });

  bindRadioGroup('input[name="customerStatus"]', 'customerStatus');
  bindRadioGroup('input[name="contractPeriod"]', 'contractPeriod');
  bindRadioGroup('input[name="buildingType"]', 'buildingType');
  bindRadioGroup('input[name="internetSpeed"]', 'internetSpeed');
  bindRadioGroup('input[name="multiroomActivationType"]', 'multiroomActivationType');

  bindCheckboxArray('input[name="tvAddons"]', 'tvAddons');
  bindCheckboxArray('input[name="internetAddons"]', 'internetAddons');
  bindCheckboxArray('input[name="bitdefender"]', 'bitdefender');

  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        document.querySelectorAll('input[name="canalPlus"]').forEach((other) => {
          if (other !== event.target) {
            other.checked = false;
          }
        });
        config.canalPlus = event.target.value;
      } else {
        config.canalPlus = null;
      }
      refresh();
    });
  });

  elements.eInvoice.addEventListener('change', (event) => {
    config.eInvoice = event.target.checked;
    refresh();
  });

  elements.marketing.addEventListener('change', (event) => {
    config.marketing = event.target.checked;
    refresh();
  });

  elements.symmetricConnection.addEventListener('change', (event) => {
    config.symmetricConnection = event.target.checked;
    refresh();
  });

  elements.phoneService.addEventListener('change', (event) => {
    config.phoneService = event.target.checked;
    refresh();
  });

  elements.multiroomCount.addEventListener('input', (event) => {
    const snapped = Math.round(Number(event.target.value));
    event.target.value = String(snapped);
    config.multiroomCount = snapped;
    refresh();
  });

  elements.wifiCount.addEventListener('input', (event) => {
    const snapped = Math.round(Number(event.target.value));
    event.target.value = String(snapped);
    config.wifiCount = snapped;
    refresh();
  });

  elements.prevBtn.addEventListener('click', () => changeStep(-1));
  elements.nextBtn.addEventListener('click', () => changeStep(1));

  [elements.copySummaryBtnMain, elements.copySummaryBtnSidebar, elements.copySummaryBtnMobile].forEach((button) => {
    button.addEventListener('click', copySummary);
  });

  elements.openMobileSummaryBtn.addEventListener('click', openMobileSummary);
  elements.closeMobileSummaryBtn.addEventListener('click', closeMobileSummary);
  elements.mobileSummaryDrawer.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-mobile-summary="true"]')) {
      closeMobileSummary();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileSummary();
    }
  });
}

function cacheElements() {
  Object.assign(elements, {
    loadStatus: document.getElementById('loadStatus'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    copySummaryBtnMain: document.getElementById('copySummaryBtnMain'),
    copySummaryBtnSidebar: document.getElementById('copySummaryBtnSidebar'),
    copySummaryBtnMobile: document.getElementById('copySummaryBtnMobile'),
    copyStatus: document.getElementById('copyStatus'),
    toast: document.getElementById('toast'),
    eInvoice: document.getElementById('eInvoice'),
    marketing: document.getElementById('marketing'),
    symmetricConnection: document.getElementById('symmetricConnection'),
    phoneService: document.getElementById('phoneService'),
    multiroomCount: document.getElementById('multiroomCount'),
    wifiCount: document.getElementById('wifiCount'),
    multiroomCountDisplay: document.getElementById('multiroomCountDisplay'),
    wifiCountDisplay: document.getElementById('wifiCountDisplay'),
    multiroomActivation: document.getElementById('multiroomActivation'),
    canalPlusSection: document.getElementById('canalPlusSection'),
    symmetricSection: document.getElementById('symmetricSection'),
    basicServices: document.getElementById('basicServices'),
    tvAddonsSectionSummary: document.getElementById('tvAddonsSectionSummary'),
    tvAddonsList: document.getElementById('tvAddonsList'),
    internetAddonsSectionSummary: document.getElementById('internetAddonsSectionSummary'),
    internetAddonsList: document.getElementById('internetAddonsList'),
    phoneSectionSummary: document.getElementById('phoneSectionSummary'),
    phoneList: document.getElementById('phoneList'),
    oneTimeSummary: document.getElementById('oneTimeSummary'),
    contractInfo: document.getElementById('contractInfo'),
    totalMonthly: document.getElementById('totalMonthly'),
    totalOneTime: document.getElementById('totalOneTime'),
    sidebarMonthly: document.getElementById('sidebarMonthly'),
    sidebarOneTime: document.getElementById('sidebarOneTime'),
    sidebarTotalMonthly: document.getElementById('sidebarTotalMonthly'),
    sidebarTotalOneTime: document.getElementById('sidebarTotalOneTime'),
    mobileBarMonthly: document.getElementById('mobileBarMonthly'),
    mobileBarOneTime: document.getElementById('mobileBarOneTime'),
    openMobileSummaryBtn: document.getElementById('openMobileSummaryBtn'),
    mobileSummaryDrawer: document.getElementById('mobileSummaryDrawer'),
    closeMobileSummaryBtn: document.getElementById('closeMobileSummaryBtn'),
    mobileMonthly: document.getElementById('mobileMonthly'),
    mobileOneTime: document.getElementById('mobileOneTime'),
    mobileTotalMonthly: document.getElementById('mobileTotalMonthly'),
    mobileTotalOneTime: document.getElementById('mobileTotalOneTime'),
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  bindEvents();
  restoreState();

  try {
    await loadCatalog();
    hideLoadError();
  } catch (error) {
    showLoadError(error.message);
    console.error(error);
    return;
  }

  applyConfigToUI();
  goToStep(Math.min(Math.max(currentStep, 1), 5));
  refresh();
});