const STEP_COUNT = 5;
let currentStep = 1;

const config = {
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

const prices = {
  internetBase: {
    '600/100': 5.01,
    '800/200': 10.01,
    '1000/300': 15.01,
    '2000/2000': 70.01,
  },
  equipmentRent: {
    SFH: { '12': 5.02, '24': 0.02 },
    MFH: { '12': 5.01, '24': 0.01 },
  },
  lineMaintenance: {
    SFH: 20.0,
    MFH: 0.01,
  },
  tvMulti: 109.97,
  installation: {
    new: 249.0,
    existing: 0.0,
  },
  symmetricConnection: 10.0,
  multiroomMonthly: 15.0,
  multiroomActivation: 99.0,
  multiroomAssistance: 100.0,
  wifiMonthly: 20.0,
  wifiActivation: 89.0,
  phoneService: 9.99,
  tvAddons: {
    pvrM: 10.0,
    pvrL: 15.0,
    tvMax: 40.0,
  },
  internetAddons: {
    internetPlus: 10.0,
  },
  bitdefender: {
    internetSecurity1: 9.0,
    internetSecurity3: 14.99,
    mobileSecurity: 6.0,
    familyPack: 20.0,
    antivirusMac1: 9.0,
    antivirusMac3: 14.99,
  },
  canalPlus: {
    canalSport: 64.99,
    canalMovies: 24.99,
  },
};

const labels = {
  tvAddons: {
    pvrM: 'PVR M',
    pvrL: 'PVR L',
    tvMax: 'TV Max',
  },
  internetAddons: {
    internetPlus: 'Internet+',
  },
  bitdefender: {
    internetSecurity1: 'Internet Security 1',
    internetSecurity3: 'Internet Security 3',
    mobileSecurity: 'Mobile',
    familyPack: 'Pakiet rodzinny',
    antivirusMac1: 'Mac 1',
    antivirusMac3: 'Mac 3',
  },
  canalPlus: {
    canalSport: 'Canal+ Super Sport',
    canalMovies: 'Canal+ Seriale i Filmy',
  },
};

function formatMoney(value) {
  return `${value.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} zł`;
}

function getInternetComponents() {
  const base = prices.internetBase[config.internetSpeed];
  const rent = prices.equipmentRent[config.buildingType][config.contractPeriod];
  const line = prices.lineMaintenance[config.buildingType];
  const consentPenalty = (config.eInvoice ? 0 : 10) + (config.marketing ? 0 : 5);

  return {
    base,
    rent,
    line,
    consentPenalty,
    total: base + rent + line + consentPenalty,
  };
}

function getConsentPenaltyLabel() {
  if (!config.eInvoice && !config.marketing) return 'Brak zgód';
  if (!config.eInvoice) return 'Brak e-faktury';
  if (!config.marketing) return 'Brak zgody marketingowej';
  return '';
}

function syncArray(field, value, checked) {
  if (checked) {
    if (!config[field].includes(value)) {
      config[field].push(value);
    }
    return;
  }

  config[field] = config[field].filter((item) => item !== value);
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
    monthlyItems.push({ label: 'Łącze symetryczne', value: prices.symmetricConnection, group: 'basic' });
  }

  monthlyItems.push({ label: 'TV Multi', value: prices.tvMulti, group: 'basic' });

  if (config.multiroomCount > 0) {
    monthlyItems.push({
      label: `Multiroom (${config.multiroomCount} szt.)`,
      value: config.multiroomCount * prices.multiroomMonthly,
      group: 'tv',
    });

    oneTimeItems.push({
      label: `Aktywacja dekoderów (${config.multiroomCount} szt.)`,
      value: config.multiroomCount * prices.multiroomActivation,
    });

    if (config.multiroomActivationType === 'assistance') {
      oneTimeItems.push({ label: 'Asysta technika', value: prices.multiroomAssistance });
    }
  }

  config.tvAddons.forEach((addon) => {
    monthlyItems.push({
      label: labels.tvAddons[addon],
      value: prices.tvAddons[addon],
      group: 'tv',
    });
  });

  if (config.canalPlus) {
    monthlyItems.push({
      label: labels.canalPlus[config.canalPlus],
      value: prices.canalPlus[config.canalPlus],
      group: 'tv',
    });
  }

  if (config.wifiCount > 0) {
    monthlyItems.push({
      label: `WiFi Premium (${config.wifiCount} szt.)`,
      value: config.wifiCount * prices.wifiMonthly,
      group: 'internet',
    });

    oneTimeItems.push({
      label: `Aktywacja WiFi Premium (${config.wifiCount} szt.)`,
      value: config.wifiCount * prices.wifiActivation,
    });
  }

  config.internetAddons.forEach((addon) => {
    monthlyItems.push({
      label: labels.internetAddons[addon],
      value: prices.internetAddons[addon],
      group: 'internet',
    });
  });

  config.bitdefender.forEach((addon) => {
    monthlyItems.push({
      label: labels.bitdefender[addon],
      value: prices.bitdefender[addon],
      group: 'internet',
    });
  });

  if (config.phoneService) {
    monthlyItems.push({ label: 'NoLimit Max', value: prices.phoneService, group: 'phone' });
  }

  const installationPrice = prices.installation[config.customerStatus];
  if (installationPrice > 0) {
    oneTimeItems.unshift({ label: 'Instalacja Internet + TV', value: installationPrice });
  }

  const totalMonthly = monthlyItems.reduce((sum, item) => sum + item.value, 0);
  const totalOneTime = oneTimeItems.reduce((sum, item) => sum + item.value, 0);

  return { monthlyItems, oneTimeItems, totalMonthly, totalOneTime };
}

function renderRows(target, items, rowClassName) {
  if (!target) return;

  if (!items.length) {
    target.innerHTML = '<div class="summary-row"><span>Brak pozycji</span><span>—</span></div>';
    return;
  }

  target.innerHTML = items
    .map(
      (item) => `
        <div class="${rowClassName}">
          <span>${item.label}</span>
          <span>${formatMoney(item.value)}</span>
        </div>
      `
    )
    .join('');
}

function updateInternetPriceLabels() {
  Object.entries(prices.internetBase).forEach(([speed, value]) => {
    const element = document.getElementById(`price-${speed.replace('/', '-')}`);
    if (element) {
      element.textContent = `Net* ${formatMoney(value)} / mies.`;
    }
  });
}

function renderSidebarSummary() {
  const result = calculateTotals();
  renderRows(document.getElementById('sidebarMonthly'), result.monthlyItems, 'sidebar-row');
  renderRows(document.getElementById('sidebarOneTime'), result.oneTimeItems, 'sidebar-row');

  document.getElementById('sidebarTotalMonthly').textContent = formatMoney(result.totalMonthly);
  document.getElementById('sidebarTotalOneTime').textContent = formatMoney(result.totalOneTime);
}

function renderFinalSummary() {
  const result = calculateTotals();
  const basicItems = result.monthlyItems.filter((item) => item.group === 'basic');
  const tvItems = result.monthlyItems.filter((item) => item.group === 'tv');
  const internetItems = result.monthlyItems.filter((item) => item.group === 'internet');
  const phoneItems = result.monthlyItems.filter((item) => item.group === 'phone');

  renderRows(document.getElementById('basicServices'), basicItems, 'summary-row');
  renderRows(document.getElementById('tvAddonsList'), tvItems, 'summary-row');
  renderRows(document.getElementById('internetAddonsList'), internetItems, 'summary-row');
  renderRows(document.getElementById('phoneList'), phoneItems, 'summary-row');
  renderRows(document.getElementById('oneTimeSummary'), result.oneTimeItems, 'summary-row');

  document.getElementById('tvAddonsSection').classList.toggle('hidden', tvItems.length === 0);
  document.getElementById('internetAddonsSection').classList.toggle('hidden', internetItems.length === 0);
  document.getElementById('phoneSection').classList.toggle('hidden', phoneItems.length === 0);

  document.getElementById('totalMonthly').textContent = formatMoney(result.totalMonthly);
  document.getElementById('totalOneTime').textContent = formatMoney(result.totalOneTime);

  document.getElementById('contractInfo').innerHTML = `
    <div class="summary-row"><span>Okres</span><span>${config.contractPeriod} miesięcy</span></div>
    <div class="summary-row"><span>Budynek</span><span>${config.buildingType === 'SFH' ? 'Domek (SFH)' : 'Blok (MFH)'}</span></div>
    <div class="summary-row"><span>Status</span><span>${config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient'}</span></div>
    <div class="summary-row"><span>Taryfa</span><span>${config.internetSpeed}</span></div>
    <div class="summary-row"><span>E-faktura</span><span>${config.eInvoice ? 'Tak' : 'Nie'}</span></div>
    <div class="summary-row"><span>Zgoda marketingowa</span><span>${config.marketing ? 'Tak' : 'Nie'}</span></div>
  `;
}

function refreshSelectionStates() {
  document.querySelectorAll('.option-card').forEach((card) => {
    const input = card.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!input) return;
    card.classList.toggle('selected', input.checked);
  });
}

function goToStep(step) {
  if (step < 1 || step > STEP_COUNT) return;

  document.querySelectorAll('.step-panel').forEach((panel, index) => {
    panel.classList.toggle('hidden', index + 1 !== step);
  });

  document.querySelectorAll('.progress-step').forEach((button, index) => {
    button.classList.toggle('active', index + 1 === step);
  });

  currentStep = step;

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  prevBtn.disabled = currentStep === 1;

  if (currentStep === STEP_COUNT) {
    nextBtn.textContent = 'Gotowe';
    nextBtn.disabled = true;
    renderFinalSummary();
  } else {
    nextBtn.textContent = 'Dalej →';
    nextBtn.disabled = false;
  }
}

function changeStep(direction) {
  goToStep(currentStep + direction);
}

function updateCanalPlusVisibility() {
  const section = document.getElementById('canalPlusSection');
  const showSection = config.contractPeriod === '12';
  section.classList.toggle('hidden', !showSection);

  if (!showSection) {
    config.canalPlus = null;
    document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
      input.checked = false;
    });
  }
}

function updateSymmetricVisibility() {
  const section = document.getElementById('symmetricSection');
  const checkbox = document.getElementById('symmetricConnection');
  const shouldShow = config.internetSpeed !== '2000/2000';

  section.classList.toggle('hidden', !shouldShow);

  if (!shouldShow) {
    checkbox.checked = false;
    config.symmetricConnection = false;
  }
}

function refresh() {
  updateInternetPriceLabels();
  refreshSelectionStates();
  renderSidebarSummary();

  if (currentStep === STEP_COUNT) {
    renderFinalSummary();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      goToStep(Number(button.dataset.step));
      refresh();
    });
  });

  document.getElementById('prevBtn').addEventListener('click', () => {
    changeStep(-1);
    refresh();
  });

  document.getElementById('nextBtn').addEventListener('click', () => {
    changeStep(1);
    refresh();
  });

  document.querySelectorAll('input[name="contractPeriod"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      config.contractPeriod = event.target.value;
      updateCanalPlusVisibility();
      refresh();
    });
  });

  document.querySelectorAll('input[name="buildingType"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      config.buildingType = event.target.value;
      refresh();
    });
  });

  document.querySelectorAll('input[name="customerStatus"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      config.customerStatus = event.target.value;
      refresh();
    });
  });

  document.querySelectorAll('input[name="internetSpeed"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      config.internetSpeed = event.target.value;
      updateSymmetricVisibility();
      refresh();
    });
  });

  document.getElementById('eInvoice').addEventListener('change', (event) => {
    config.eInvoice = event.target.checked;
    refresh();
  });

  document.getElementById('marketing').addEventListener('change', (event) => {
    config.marketing = event.target.checked;
    refresh();
  });

  document.getElementById('symmetricConnection').addEventListener('change', (event) => {
    config.symmetricConnection = event.target.checked;
    refresh();
  });

  document.getElementById('multiroomCount').addEventListener('input', (event) => {
    config.multiroomCount = Number(event.target.value);
    document.getElementById('multiroomCountDisplay').textContent = `${config.multiroomCount} szt.`;
    document.getElementById('multiroomActivation').classList.toggle('hidden', config.multiroomCount === 0);
    refresh();
  });

  document.querySelectorAll('input[name="multiroomActivationType"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      config.multiroomActivationType = event.target.value;
      refresh();
    });
  });

  document.getElementById('wifiCount').addEventListener('input', (event) => {
    config.wifiCount = Number(event.target.value);
    document.getElementById('wifiCountDisplay').textContent = `${config.wifiCount} szt.`;
    refresh();
  });

  document.querySelectorAll('input[name="tvAddons"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      syncArray('tvAddons', event.target.value, event.target.checked);
      refresh();
    });
  });

  document.querySelectorAll('input[name="internetAddons"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      syncArray('internetAddons', event.target.value, event.target.checked);
      refresh();
    });
  });

  document.querySelectorAll('input[name="bitdefender"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      syncArray('bitdefender', event.target.value, event.target.checked);
      refresh();
    });
  });

  document.querySelectorAll('input[name="canalPlus"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        document.querySelectorAll('input[name="canalPlus"]').forEach((other) => {
          if (other !== event.target) other.checked = false;
        });
        config.canalPlus = event.target.value;
      } else {
        config.canalPlus = null;
      }
      refresh();
    });
  });

  document.getElementById('phoneService').addEventListener('change', (event) => {
    config.phoneService = event.target.checked;
    refresh();
  });

  updateCanalPlusVisibility();
  updateSymmetricVisibility();
  goToStep(1);
  refresh();
});
