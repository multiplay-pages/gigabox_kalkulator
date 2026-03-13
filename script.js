// ==========================================
// GigaBOX Kalkulator - script.js
// Wersja naprawcza: WiFi Premium / Multiroom / Security / TV MAX / C+ Super Sport
// ==========================================

// ------------------------------------------
// 1. STATE
// ------------------------------------------
const state = {
  commitment: "24",
  building: "SFH",
  status: "new", // "new" | "current"
  tariff: "600/100",

  ebill: true,
  marketing: true,

  symmetric: false,
  internetPlus: false,

  multiroomCount: 0,
  multiroomInstall: "self",

  meshCount: 0,
  meshInstall: "self",

  security: "none",

  tvMax: false,
  tvCplusSport: false,
  tvCplusFilms: false,
  tvPvrM: false,
  tvPvrL: false,

  promo: "none",
  promoMonths: 1,
  gift: "none",
  bannerPromo: false
};

let priceConfig = {
  tariffs: [],
  base: {},
  indefinite: {},
  installation: {},
  addons: {}
};

const STORAGE_KEY = "gigabox_calc_state_v4";

// ------------------------------------------
// 2. HELPERS
// ------------------------------------------
function formatMoney(val) {
  return Number(val || 0).toFixed(2).replace(".", ",") + " zł";
}

function toNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function byId(id) {
  return document.getElementById(id);
}

function firstExisting(...ids) {
  for (const id of ids) {
    const el = byId(id);
    if (el) return el;
  }
  return null;
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  const el = byId(id);
  if (el) el.innerHTML = value;
}

function setCheckedIfExists(id, checked) {
  const el = byId(id);
  if (el && "checked" in el) el.checked = !!checked;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(txt) {
  return (txt || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsAll(haystack, needles) {
  const h = normalizeText(haystack);
  return needles.every((n) => h.includes(normalizeText(n)));
}

function getAddonPrice(key) {
  return toNumber(priceConfig?.addons?.[key], 0) / 100;
}

function getSecurityPrice(code) {
  return toNumber(priceConfig?.addons?.security?.[code], 0) / 100;
}

function getTariffMeta(id) {
  return (priceConfig.tariffs || []).find((t) => t.id === id) || null;
}

function getCurrentTariffPrice() {
  return (
    toNumber(
      priceConfig?.base?.[state.commitment]?.[state.building]?.[state.tariff],
      0
    ) / 100
  );
}

function getIndefiniteTariffPrice() {
  return toNumber(priceConfig?.indefinite?.[state.tariff], 0) / 100;
}

function getInstallationPrice() {
  if (state.status !== "new") return 0;
  return toNumber(priceConfig?.installation?.[state.tariff], 24900) / 100;
}

function getVisibleSectionByHeadingText(texts) {
  const headings = qsa("h2, h3, h4, .section-title, .card-title");
  for (const heading of headings) {
    const txt = normalizeText(heading.textContent);
    if (texts.some((t) => txt.includes(normalizeText(t)))) {
      let node = heading.closest("section, article, .card, .panel, .box");
      if (!node) node = heading.parentElement;
      if (node) return node;
    }
  }
  return null;
}

function getFieldByLabelText(texts, type = null) {
  const labels = qsa("label");
  for (const label of labels) {
    const txt = normalizeText(label.textContent);
    if (texts.some((t) => txt.includes(normalizeText(t)))) {
      const forId = label.getAttribute("for");
      if (forId) {
        const control = byId(forId);
        if (control && (!type || control.matches(type))) return control;
      }
      const nested = label.querySelector(type || "input, select, textarea, button");
      if (nested) return nested;
    }
  }
  return null;
}

function inferButtonRole(button) {
  const txt = normalizeText(button.textContent || button.getAttribute("aria-label") || "");
  if (txt === "+" || txt.includes("plus") || txt.includes("dodaj")) return "plus";
  if (txt === "-" || txt.includes("minus") || txt.includes("odejmij")) return "minus";

  const cls = normalizeText(button.className || "");
  if (cls.includes("plus") || cls.includes("increment")) return "plus";
  if (cls.includes("minus") || cls.includes("decrement")) return "minus";

  const dataAction = normalizeText(button.dataset?.action || "");
  if (dataAction.includes("plus") || dataAction.includes("increment")) return "plus";
  if (dataAction.includes("minus") || dataAction.includes("decrement")) return "minus";

  return null;
}

// ------------------------------------------
// 3. PERSISTENCE
// ------------------------------------------
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Nie udało się zapisać stanu do localStorage.", e);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = safeJsonParse(saved, null);
    if (!parsed || typeof parsed !== "object") return;
    Object.assign(state, parsed);
  } catch (e) {
    console.warn("Nie udało się odczytać stanu z localStorage.", e);
  }
}

// ------------------------------------------
// 4. LOAD CONFIG
// ------------------------------------------
async function loadPriceConfig() {
  try {
    const response = await fetch("prices.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    priceConfig = await response.json();
  } catch (error) {
    console.error("Nie udało się załadować prices.json:", error);
    alert(
      "BŁĄD: Nie udało się pobrać pliku prices.json.\n" +
      "Upewnij się, że plik istnieje i jest poprawnie opublikowany."
    );
  }
}

// ------------------------------------------
// 5. CALCULATION
// ------------------------------------------
function calculatePrice() {
  if (!priceConfig?.base || Object.keys(priceConfig.base).length === 0) {
    return null;
  }

  const commitmentMonths = toNumber(state.commitment, 24);
  const base = getCurrentTariffPrice();
  const afterIndefinite = getIndefiniteTariffPrice();
  const installationBase = getInstallationPrice();

  let consentPenalty = 0;
  if (!state.ebill) consentPenalty += getAddonPrice("consentEbill");
  if (!state.marketing) consentPenalty += getAddonPrice("consentMarketingDisplay");

  const symmetricMonthly = state.symmetric
    ? state.status === "current"
      ? getAddonPrice("symmetricCurrentPreview")
      : getAddonPrice("symmetricNew")
    : 0;

  const internetPlusMonthly = state.internetPlus ? getAddonPrice("internetPlus") : 0;
  const securityMonthly = getSecurityPrice(state.security);

  const meshMonthly = state.meshCount * getAddonPrice("wifiMonthly");
  const meshActivation = state.meshCount * getAddonPrice("wifiActivation");
  const meshTech = state.meshCount > 0 && state.meshInstall === "tech"
    ? getAddonPrice("techVisit")
    : 0;

  const multiroomMonthly = state.multiroomCount * getAddonPrice("multiroomMonthly");
  const multiroomActivation = state.multiroomCount * getAddonPrice("multiroomActivation");
  const multiroomTech = state.multiroomCount > 0 && state.multiroomInstall === "tech"
    ? getAddonPrice("techVisit")
    : 0;

  const tvMonthly =
    (state.tvMax ? getAddonPrice("tvMax") : 0) +
    (state.tvCplusSport ? getAddonPrice("cplusSport") : 0) +
    (state.tvCplusFilms ? getAddonPrice("cplusFilms") : 0) +
    (state.tvPvrM ? getAddonPrice("pvrM") : 0) +
    (state.tvPvrL ? getAddonPrice("pvrL") : 0);

  const otherAddonsMonthly =
    symmetricMonthly +
    internetPlusMonthly +
    securityMonthly +
    multiroomMonthly;

  const normalMonthly = Number(
    (
      base +
      consentPenalty +
      otherAddonsMonthly +
      tvMonthly +
      meshMonthly
    ).toFixed(2)
  );

  let installationOverride = installationBase;
  let promoLabel = "";
  let promoNote = "";
  let giftLabel = "";
  let giftNote = "";
  let mainPromoMonths = 0;
  const bannerMonths = state.bannerPromo ? 1 : 0;

  if (state.status === "new") {
    if (state.promo === "6za1") {
      mainPromoMonths = commitmentMonths === 24 ? 6 : 3;
      promoLabel = `${mainPromoMonths} za 1`;
      promoNote = `Abonament obniżony do 1 zł przez pierwsze ${mainPromoMonths} mies.`;
    } else if (state.promo === "ztr") {
      mainPromoMonths = Math.min(
        commitmentMonths,
        Math.min(toNumber(state.promoMonths, 0), 12)
      );
      promoLabel = "ZTR 2026";
      promoNote = `Promocja dla nowych klientów (${mainPromoMonths} mies., max 12).`;
    } else if (state.promo === "powrot") {
      mainPromoMonths = Math.min(
        commitmentMonths,
        Math.min(toNumber(state.promoMonths, 0) + 3, 24)
      );
      promoLabel = "Powrót do Multiplay";
      promoNote = `Promocja na ${mainPromoMonths} mies. Instalacja za 1 zł.`;
      installationOverride = 1;
    }
  } else {
    if (state.promo === "retention") {
      mainPromoMonths = Math.min(commitmentMonths, toNumber(state.promoMonths, 1));
      promoLabel = "Promocja Utrzymaniowa";
      promoNote = `Rabat na wszystkie usługi do 1 zł przez ${mainPromoMonths} mies.`;
    }

    if (state.gift === "wifi12" && state.meshCount > 0) {
      giftLabel = "Prezent: WiFi Premium 1 zł";
      giftNote = "Opłata za wszystkie urządzenia Mesh obniżona do 1 zł przez 12 mies.";
    } else if (state.gift === "router") {
      giftLabel = "Prezent: Wymiana routera";
      giftNote = "Wymiana urządzenia bazowego (nie wpływa na cenę abonamentu).";
    }
  }

  const totalPromoMonths = Math.min(commitmentMonths, mainPromoMonths + bannerMonths);

  const scheduleArray = [];
  let totalCost = 0;

  for (let month = 1; month <= commitmentMonths; month += 1) {
    let monthPrice;

    if (month <= totalPromoMonths) {
      monthPrice = 1;
      if (consentPenalty > 0) {
        monthPrice += consentPenalty;
      }
    } else {
      monthPrice = normalMonthly;

      if (
        state.status === "current" &&
        state.gift === "wifi12" &&
        state.meshCount > 0 &&
        month <= 12
      ) {
        monthPrice -= meshMonthly;
        monthPrice += 1 * state.meshCount;
      }
    }

    monthPrice = Number(monthPrice.toFixed(2));
    scheduleArray.push(monthPrice);
    totalCost += monthPrice;
  }

  const scheduleRows = [];
  if (scheduleArray.length > 0) {
    let currentVal = scheduleArray[0];
    let startM = 1;

    for (let m = 2; m <= scheduleArray.length; m += 1) {
      if (scheduleArray[m - 1] !== currentVal) {
        scheduleRows.push({
          start: startM,
          end: m - 1,
          price: currentVal
        });
        startM = m;
        currentVal = scheduleArray[m - 1];
      }
    }

    scheduleRows.push({
      start: startM,
      end: scheduleArray.length,
      price: currentVal
    });
  }

  const averageMonthly = Number((totalCost / commitmentMonths).toFixed(2));
  const theoreticalTotalCost = normalMonthly * commitmentMonths;

  let totalSavings = theoreticalTotalCost - totalCost;
  if (state.status === "new" && state.promo === "powrot") {
    totalSavings += installationBase - 1;
  }
  totalSavings = Math.max(0, Number(totalSavings.toFixed(2)));

  const notes = [];
  if (consentPenalty > 0 && totalPromoMonths > 0) {
    notes.push("Uwaga: w miesiącach promocyjnych „za 1 zł” kary za brak zgód wciąż obowiązują.");
  }
  if (state.symmetric && state.status === "current") {
    notes.push("Rabat 5 zł/mies. dla obecnych klientów na łącze symetryczne wymaga potwierdzenia.");
  }

  return {
    base,
    afterIndefinite,
    consentPenalty,
    symmetricMonthly,
    internetPlusMonthly,
    securityMonthly,
    multiroomMonthly,
    meshMonthly,
    tvMonthly,

    installation: installationOverride,
    activation: multiroomActivation,
    meshActivation,
    tech: multiroomTech + meshTech,

    monthly: normalMonthly,
    averageMonthly,

    promoLabel,
    promoNote,
    bannerMonths,

    giftLabel,
    giftNote,

    scheduleRows,
    totalSavings,
    notes
  };
}

// ------------------------------------------
// 6. RENDER TARIFFS
// ------------------------------------------
function renderTariffs() {
  const container = byId("tariff-grid");
  const noteEl = byId("tariff-note");

  if (!container || !noteEl) return;
  if (!priceConfig?.base?.[state.commitment]?.[state.building]) return;

  const currentBuildingConfig = priceConfig.base[state.commitment][state.building];

  if (!currentBuildingConfig[state.tariff]) {
    state.tariff = Object.keys(currentBuildingConfig)[0];
  }

  const validTariffs = (priceConfig.tariffs || []).filter(
    (t) => currentBuildingConfig[t.id] !== undefined
  );

  container.innerHTML = validTariffs
    .map((t) => {
      const checked = t.id === state.tariff ? "checked" : "";
      const includedSym = t.includedSym
        ? `<span class="pill success">symetryczne w cenie</span>`
        : "";

      return `
        <label class="select-card tariff-card">
          <input type="radio" name="tariff" value="${t.id}" ${checked}>
          <span class="select-card-body">
            <strong>${t.label}</strong>
            ${t.note ? `<small>${t.note}</small>` : ""}
            ${includedSym}
          </span>
        </label>
      `;
    })
    .join("");

  const tObj = getTariffMeta(state.tariff);
  if (tObj?.tech) {
    noteEl.style.display = "block";
    noteEl.textContent = `Info tech: ${tObj.tech}`;
  } else {
    noteEl.style.display = "none";
    noteEl.textContent = "";
  }

  qsa('input[name="tariff"]', container).forEach((input) => {
    input.addEventListener("change", (e) => {
      state.tariff = e.target.value;

      if (state.tariff === "2000/2000") {
        state.symmetric = false;
      }

      const tariffMeta = getTariffMeta(state.tariff);
      if (!tariffMeta?.wifi) {
        state.meshCount = 0;
        state.meshInstall = "self";
      }

      render();
    });
  });
}

// ------------------------------------------
// 7. PROMO OPTIONS
// ------------------------------------------
function updatePromoOptions() {
  const isNew = state.status === "new";
  const promoSelect = byId("promo");
  if (!promoSelect) return;

  const currentSelection = state.promo;

  let optionsHtml = `<option value="none">Brak promocji głównej</option>`;

  if (isNew) {
    optionsHtml += `
      <option value="6za1">6 za 1 / 3 za 1</option>
      <option value="ztr">ZTR 2026</option>
      <option value="powrot">Powrót do Multiplay</option>
    `;
    state.gift = "none";
  } else {
    optionsHtml += `
      <option value="retention">Promocja Utrzymaniowa (Rabat 1zł)</option>
    `;
  }

  promoSelect.innerHTML = optionsHtml;

  if ([...promoSelect.options].some((opt) => opt.value === currentSelection)) {
    promoSelect.value = currentSelection;
  } else {
    promoSelect.value = "none";
    state.promo = "none";
  }

  const showMonths =
    state.promo === "ztr" ||
    state.promo === "powrot" ||
    state.promo === "retention";

  const promoMonthsWrap = byId("promo-months-wrap");
  const promoMonthsInput = byId("promo-months");
  const promoMonthsLabel = byId("promo-months-label");

  if (promoMonthsWrap) {
    promoMonthsWrap.style.display = showMonths ? "" : "none";
  } else if (promoMonthsInput?.parentElement) {
    promoMonthsInput.parentElement.style.display = showMonths ? "" : "none";
  }

  if (promoMonthsLabel) {
    promoMonthsLabel.textContent =
      state.promo === "retention"
        ? "Ilość miesięcy promocyjnych (do 1zł):"
        : "Pozostałe miesiące u obecnego operatora:";
  }

  if (promoMonthsInput) {
    promoMonthsInput.value = state.promoMonths;
  }

  const giftWrap = byId("gift-wrap");
  if (giftWrap) {
    giftWrap.style.display = isNew ? "none" : "";
  }

  const bannerWrap = byId("banner-wrap");
  if (bannerWrap) {
    bannerWrap.style.display = state.promo !== "none" || state.gift !== "none" ? "" : "none";
  }
}

// ------------------------------------------
// 8. SUMMARY RENDER
// ------------------------------------------
function renderSummary(calc) {
  if (!calc) return;

  setText("summary-monthly", formatMoney(calc.monthly));
  setText(
    "summary-start",
    formatMoney(calc.installation + calc.activation + calc.meshActivation + calc.tech)
  );

  setText("sum-commitment", `${state.commitment} miesięcy`);
  setText("sum-building", state.building === "SFH" ? "Domek (SFH)" : "Blok (MFH)");
  setText("sum-status", state.status === "new" ? "Nowy klient" : "Obecny klient");
  setText("sum-tariff", state.tariff);

  setText("sum-base", formatMoney(calc.base));
  setText("sum-consents", calc.consentPenalty > 0 ? `+ ${formatMoney(calc.consentPenalty)}` : "0,00 zł");
  setText(
    "sum-addons",
    calc.symmetricMonthly + calc.internetPlusMonthly + calc.securityMonthly + calc.multiroomMonthly > 0
      ? `+ ${formatMoney(calc.symmetricMonthly + calc.internetPlusMonthly + calc.securityMonthly + calc.multiroomMonthly)}`
      : "0,00 zł"
  );
  setText("sum-tv", calc.tvMonthly > 0 ? `+ ${formatMoney(calc.tvMonthly)}` : "0,00 zł");
  setText("sum-mesh-count", `${state.meshCount}x`);
  setText("sum-mesh", calc.meshMonthly > 0 ? `+ ${formatMoney(calc.meshMonthly)}` : "0,00 zł");

  setText("sum-installation", formatMoney(calc.installation));
  setText("sum-activation", calc.activation > 0 ? `+ ${formatMoney(calc.activation)}` : "0,00 zł");
  setText("sum-mesh-activation", calc.meshActivation > 0 ? `+ ${formatMoney(calc.meshActivation)}` : "0,00 zł");
  setText("sum-tech", calc.tech > 0 ? `+ ${formatMoney(calc.tech)}` : "0,00 zł");

  setText("summary-average", formatMoney(calc.averageMonthly));
  setText("summary-after-indefinite", formatMoney(calc.afterIndefinite));
  setText("summary-savings", formatMoney(calc.totalSavings));

  const benefits = [];
  if (calc.promoLabel) benefits.push(`<li><strong>${calc.promoLabel}</strong> — ${calc.promoNote}</li>`);
  if (state.bannerPromo) benefits.push(`<li><strong>Promocja Banerowa</strong> — 1 dodatkowy miesiąc za 1 zł po głównej promocji.</li>`);
  if (calc.giftLabel) benefits.push(`<li><strong>${calc.giftLabel}</strong> — ${calc.giftNote}</li>`);

  setHtml("benefits-list", benefits.length ? `<ul>${benefits.join("")}</ul>` : `<p>Brak aktywnych benefitów.</p>`);

  const rows = (calc.scheduleRows || []).map((row) => {
    const range = row.start === row.end ? `${row.start}` : `${row.start}–${row.end}`;
    return `
      <tr>
        <td>${range}</td>
        <td>${formatMoney(row.price)}</td>
      </tr>
    `;
  });

  setHtml(
    "payment-schedule",
    rows.length
      ? `
        <table class="schedule-table">
          <thead>
            <tr>
              <th>Miesiące</th>
              <th>Abonament</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      `
      : "<p>Brak harmonogramu.</p>"
  );

  const notesHtml = (calc.notes || []).length
    ? `<ul>${calc.notes.map((n) => `<li>${n}</li>`).join("")}</ul>`
    : "<p>Brak dodatkowych uwag.</p>";

  setHtml("offer-notes", notesHtml);
}

// ------------------------------------------
// 9. MAIN RENDER
// ------------------------------------------
function render() {
  if (!priceConfig?.base || Object.keys(priceConfig.base).length === 0) return;

  saveState();
  renderTariffs();
  updatePromoOptions();

  const tariffMeta = getTariffMeta(state.tariff);
  const wifiAllowed = !!tariffMeta?.wifi;
  const isSymIncluded = state.tariff === "2000/2000";

  const symCheckbox = firstExisting("addon-sym", "symmetric", "symmetry");
  const symLabel = firstExisting("addon-sym-label", "symmetric-label");
  const symPill = firstExisting("addon-sym-pill", "symmetric-pill");

  if (isSymIncluded) {
    if (symCheckbox) {
      symCheckbox.checked = false;
      symCheckbox.disabled = true;
    }
    if (symLabel) symLabel.textContent = "W cenie";
    if (symPill) {
      symPill.textContent = "2000/2000";
      symPill.className = "pill success";
    }
    state.symmetric = false;
  } else {
    if (symCheckbox) symCheckbox.disabled = false;

    if (symLabel) {
      symLabel.textContent = state.status === "current" ? "5 zł / mies. (preview)" : "10 zł / mies.";
    }

    if (symPill) {
      symPill.textContent = state.status === "current" ? "wymaga potwierdzenia" : "dla nowych";
      symPill.className = state.status === "current" ? "pill warning" : "pill";
    }
  }

  const meshWrap = firstExisting("mesh-wrap", "wifi-wrap");
  const meshNote = firstExisting("mesh-note", "wifi-note");

  if (meshWrap && meshNote) {
    if (wifiAllowed) {
      meshWrap.style.opacity = "1";
      meshWrap.style.pointerEvents = "auto";
      meshNote.style.display = "none";
    } else {
      meshWrap.style.opacity = "0.5";
      meshWrap.style.pointerEvents = "none";
      meshNote.style.display = "block";
      state.meshCount = 0;
    }
  }

  setText("mesh-out", String(state.meshCount));
  setText("multiroom-out", String(state.multiroomCount));

  // Dodatkowe próby odświeżenia liczników w UI, gdy środkowe pole nie ma poprawnego id
  syncStepperVisibleValue("mesh", state.meshCount);
  syncStepperVisibleValue("multiroom", state.multiroomCount);

  // Synchronizacja kontrolek
  setCheckedIfExists("addon-ebill", state.ebill);
  setCheckedIfExists("addon-marketing", state.marketing);
  setCheckedIfExists("addon-sym", state.symmetric);
  setCheckedIfExists("addon-internet-plus", state.internetPlus);

  setCheckedIfExists("tv-max", state.tvMax);
  setCheckedIfExists("tv-cplus-sport", state.tvCplusSport);
  setCheckedIfExists("tv-cplus-films", state.tvCplusFilms);
  setCheckedIfExists("tv-pvr-m", state.tvPvrM);
  setCheckedIfExists("tv-pvr-l", state.tvPvrL);

  setCheckedIfExists("banner-promo", state.bannerPromo);

  const securitySelect =
    firstExisting("security", "security-select", "addon-security") ||
    getFieldByLabelText(["wybierz pakiet bezpieczeństwa", "pakiet bezpieczeństwa"], "select");

  if (securitySelect) {
    securitySelect.value = state.security;
  }

  const giftSelect =
    firstExisting("gift", "promo-gift", "benefit") ||
    getFieldByLabelText(["wybierz benefit", "benefit"], "select");

  if (giftSelect) {
    giftSelect.value = state.gift;
  }

  const meshInstallRadios = qsa('input[name="mesh-install"], input[name="wifi-install"]');
  meshInstallRadios.forEach((radio) => {
    radio.checked = radio.value === state.meshInstall;
  });

  const multiroomInstallRadios = qsa('input[name="multiroom-install"]');
  multiroomInstallRadios.forEach((radio) => {
    radio.checked = radio.value === state.multiroomInstall;
  });

  const commitmentRadios = qsa('input[name="commitment"]');
  commitmentRadios.forEach((radio) => {
    radio.checked = radio.value === state.commitment;
  });

  const buildingRadios = qsa('input[name="building"]');
  buildingRadios.forEach((radio) => {
    radio.checked = radio.value === state.building;
  });

  const statusRadios = qsa('input[name="status"]');
  statusRadios.forEach((radio) => {
    radio.checked = radio.value === state.status;
  });

  const calc = calculatePrice();
  renderSummary(calc);
}

// ------------------------------------------
// 10. STEPPER VISUAL SYNC
// ------------------------------------------
function syncStepperVisibleValue(kind, value) {
  const candidates = kind === "mesh"
    ? ["mesh-out", "wifi-out", "mesh-count", "wifi-count"]
    : ["multiroom-out", "multiroom-count"];

  for (const id of candidates) {
    const el = byId(id);
    if (el) {
      el.textContent = String(value);
    }
  }

  const section = kind === "mesh"
    ? getVisibleSectionByHeadingText(["wifi premium", "mesh"])
    : getVisibleSectionByHeadingText(["multiroom"]);

  if (!section) return;

  const nodes = qsa("span, div, strong, p", section);
  for (const node of nodes) {
    const txt = normalizeText(node.textContent);
    if (txt === "0" || txt === "0 szt." || /^\d+\s*szt\.?$/.test(txt)) {
      if (txt.includes("szt")) {
        node.textContent = `${value} szt.`;
      } else {
        node.textContent = String(value);
      }
    }
  }
}

// ------------------------------------------
// 11. BIND GENERIC INPUTS
// ------------------------------------------
function bindBasicInputs() {
  // commitment
  qsa('input[name="commitment"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.commitment = el.value;
      render();
    });
  });

  // building
  qsa('input[name="building"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.building = el.value;
      render();
    });
  });

  // status
  qsa('input[name="status"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.status = el.value;

      if (state.status === "new") {
        state.gift = "none";
      }

      render();
    });
  });

  // consents & addons
  const ebill = firstExisting("addon-ebill", "ebill");
  if (ebill) {
    ebill.addEventListener("change", () => {
      state.ebill = !!ebill.checked;
      render();
    });
  }

  const marketing = firstExisting("addon-marketing", "marketing");
  if (marketing) {
    marketing.addEventListener("change", () => {
      state.marketing = !!marketing.checked;
      render();
    });
  }

  const symmetric = firstExisting("addon-sym", "symmetric", "symmetry");
  if (symmetric) {
    symmetric.addEventListener("change", () => {
      if (state.tariff === "2000/2000") {
        state.symmetric = false;
      } else {
        state.symmetric = !!symmetric.checked;
      }
      render();
    });
  }

  const internetPlus = firstExisting("addon-internet-plus", "internet-plus");
  if (internetPlus) {
    internetPlus.addEventListener("change", () => {
      state.internetPlus = !!internetPlus.checked;
      render();
    });
  }

  // promo
  const promo = byId("promo");
  if (promo) {
    promo.addEventListener("change", () => {
      state.promo = promo.value;
      render();
    });
  }

  const promoMonths = byId("promo-months");
  if (promoMonths) {
    const handler = () => {
      state.promoMonths = clamp(toNumber(promoMonths.value, 1), 0, 24);
      render();
    };
    promoMonths.addEventListener("input", handler);
    promoMonths.addEventListener("change", handler);
  }

  const giftSelect =
    firstExisting("gift", "promo-gift", "benefit") ||
    getFieldByLabelText(["wybierz benefit", "benefit"], "select");

  if (giftSelect) {
    giftSelect.addEventListener("change", () => {
      state.gift = giftSelect.value;
      render();
    });
  }

  const bannerPromo = firstExisting("banner-promo", "bannerPromo");
  if (bannerPromo) {
    bannerPromo.addEventListener("change", () => {
      state.bannerPromo = !!bannerPromo.checked;
      render();
    });
  }

  // security
  const securitySelect =
    firstExisting("security", "security-select", "addon-security") ||
    getFieldByLabelText(["wybierz pakiet bezpieczeństwa", "pakiet bezpieczeństwa"], "select");

  if (securitySelect) {
    securitySelect.addEventListener("change", () => {
      state.security = securitySelect.value || "none";
      render();
    });
    securitySelect.addEventListener("input", () => {
      state.security = securitySelect.value || "none";
      render();
    });
  }

  // install types
  qsa('input[name="mesh-install"], input[name="wifi-install"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.meshInstall = el.value;
      render();
    });
  });

  qsa('input[name="multiroom-install"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.multiroomInstall = el.value;
      render();
    });
  });

  // exact tv ids if they exist
  const tvBindings = [
    ["tv-max", "tvMax"],
    ["tv-cplus-sport", "tvCplusSport"],
    ["tv-cplus-films", "tvCplusFilms"],
    ["tv-pvr-m", "tvPvrM"],
    ["tv-pvr-l", "tvPvrL"]
  ];

  tvBindings.forEach(([id, key]) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener("change", () => {
      state[key] = !!el.checked;
      render();
    });
    el.addEventListener("click", () => {
      if (el.type !== "checkbox") {
        state[key] = !state[key];
        render();
      }
    });
  });
}

// ------------------------------------------
// 12. BIND STEPPERS
// ------------------------------------------
function bindStepperBySection(kind) {
  const section = kind === "mesh"
    ? getVisibleSectionByHeadingText(["wifi premium", "mesh"])
    : getVisibleSectionByHeadingText(["multiroom"]);

  if (!section) return;

  const buttons = qsa("button", section);
  if (buttons.length < 2) return;

  let minusButton = null;
  let plusButton = null;

  for (const btn of buttons) {
    const role = inferButtonRole(btn);
    if (role === "minus" && !minusButton) minusButton = btn;
    if (role === "plus" && !plusButton) plusButton = btn;
  }

  if (!minusButton) minusButton = buttons[0];
  if (!plusButton) plusButton = buttons[buttons.length - 1];

  if (minusButton && !minusButton.dataset.boundStepper) {
    minusButton.dataset.boundStepper = "1";
    minusButton.addEventListener("click", (e) => {
      e.preventDefault();
      if (kind === "mesh") {
        state.meshCount = Math.max(0, state.meshCount - 1);
      } else {
        state.multiroomCount = Math.max(0, state.multiroomCount - 1);
      }
      render();
    });
  }

  if (plusButton && !plusButton.dataset.boundStepper) {
    plusButton.dataset.boundStepper = "1";
    plusButton.addEventListener("click", (e) => {
      e.preventDefault();
      if (kind === "mesh") {
        const tariffMeta = getTariffMeta(state.tariff);
        if (tariffMeta?.wifi) {
          state.meshCount += 1;
        }
      } else {
        state.multiroomCount += 1;
      }
      render();
    });
  }
}

// ------------------------------------------
// 13. BIND TV CARDS BY TEXT (fallback)
// ------------------------------------------
function bindTvButtonsByText() {
  const tvSection = getVisibleSectionByHeadingText(["tv i dodatki premium", "tv", "dodatki premium"]);
  if (!tvSection) return;

  const map = [
    { texts: ["tv max"], key: "tvMax" },
    { texts: ["c+ super sport"], key: "tvCplusSport" },
    { texts: ["super sport"], key: "tvCplusSport" },
    { texts: ["seriale i filmy"], key: "tvCplusFilms" },
    { texts: ["pvr m"], key: "tvPvrM" },
    { texts: ["pvr l"], key: "tvPvrL" }
  ];

  const clickable = qsa("button, label, .select-card, .toggle-card, .option-card, .chip, .card", tvSection);

  clickable.forEach((node) => {
    if (node.dataset.tvBound === "1") return;

    const txt = normalizeText(node.textContent);
    const found = map.find((item) => item.texts.some((t) => txt.includes(normalizeText(t))));
    if (!found) return;

    node.dataset.tvBound = "1";

    node.addEventListener("click", (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();

      if (tag === "input" || tag === "select" || tag === "option") {
        return;
      }

      // jeśli wewnątrz jest checkbox/radio, pozwalamy jemu też pracować
      const input = node.querySelector('input[type="checkbox"], input[type="radio"]');
      if (input) {
        if (input.type === "checkbox") {
          state[found.key] = !input.checked;
          input.checked = state[found.key];
        } else {
          state[found.key] = !state[found.key];
        }
      } else {
        state[found.key] = !state[found.key];
      }

      render();
    });
  });
}

// ------------------------------------------
// 14. BIND CONTROLS
// ------------------------------------------
function bindControls() {
  bindBasicInputs();
  bindStepperBySection("mesh");
  bindStepperBySection("multiroom");
  bindTvButtonsByText();
}

// ------------------------------------------
// 15. INIT
// ------------------------------------------
async function init() {
  loadState();
  await loadPriceConfig();

  // sanity defaults
  if (!priceConfig?.base?.[state.commitment]?.[state.building]?.[state.tariff]) {
    state.commitment = "24";
    state.building = "SFH";
    state.tariff = "600/100";
  }

  bindControls();
  render();
}

document.addEventListener("DOMContentLoaded", init);
