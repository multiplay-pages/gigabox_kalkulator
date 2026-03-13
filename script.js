// ==========================================
// GigaBOX Kalkulator - script.js
// Wersja naprawcza v2
// ==========================================

// ------------------------------------------
// 1. STATE
// ------------------------------------------
const state = {
  commitment: "24",
  building: "SFH",
  status: "new", // "new" | "current"
  tariff: "1000/300",

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

const STORAGE_KEY = "gigabox_calc_state_v5";

// ------------------------------------------
// 2. HELPERS
// ------------------------------------------
function byId(id) {
  return document.getElementById(id);
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function firstExisting(...ids) {
  for (const id of ids) {
    const el = byId(id);
    if (el) return el;
  }
  return null;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} zł`;
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function setHTML(id, value) {
  const el = byId(id);
  if (el) el.innerHTML = value;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseMoneyFromText(text) {
  const normalized = String(text || "").replace(",", ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function getSectionByHeading(partials) {
  const headings = qsa("h1, h2, h3, h4, .section-title, .card-title, .block-title");
  for (const heading of headings) {
    const txt = normalizeText(heading.textContent);
    if (partials.some((p) => txt.includes(normalizeText(p)))) {
      return heading.closest("section, article, .section, .card, .panel, .box, .step-card") || heading.parentElement;
    }
  }
  return null;
}

function getTariffMeta(id) {
  return (priceConfig.tariffs || []).find((item) => item.id === id) || null;
}

function getAddonPrice(key) {
  return safeNumber(priceConfig?.addons?.[key], 0) / 100;
}

function getSecurityPrice(code) {
  return safeNumber(priceConfig?.addons?.security?.[code], 0) / 100;
}

function getBasePrice() {
  return safeNumber(priceConfig?.base?.[state.commitment]?.[state.building]?.[state.tariff], 0) / 100;
}

function getAfterIndefinitePrice() {
  return safeNumber(priceConfig?.indefinite?.[state.tariff], 0) / 100;
}

function getInstallationPrice() {
  if (state.status !== "new") return 0;
  return safeNumber(priceConfig?.installation?.[state.tariff], 24900) / 100;
}

function statusToInternal(value) {
  const v = normalizeText(value);
  if (
    v.includes("obec") ||
    v.includes("current") ||
    v.includes("renew") ||
    v.includes("reten") ||
    v === "1"
  ) {
    return "current";
  }
  return "new";
}

function buildingToInternal(value) {
  const v = normalizeText(value);
  if (v.includes("mfh") || v.includes("blok") || v.includes("wielorodzin")) {
    return "MFH";
  }
  return "SFH";
}

function commitmentToInternal(value) {
  const v = String(value || "");
  if (v.includes("12")) return "12";
  return "24";
}

function findSecuritySelect() {
  return (
    firstExisting("security", "security-select", "addon-security") ||
    qs('select[name="security"]') ||
    qs('select[name="addon-security"]') ||
    qsa("select").find((el) => normalizeText(el.closest("section, .card, .panel, .box, div")?.textContent).includes("pakiet bezpieczeństwa")) ||
    null
  );
}

function findPromoSelect() {
  return (
    firstExisting("promo", "mainPromotion", "promotionType") ||
    qs('select[name="promo"]') ||
    qs('select[name="mainPromotion"]') ||
    qs('select[name="promotionType"]') ||
    qsa("select").find((el) => {
      const ctx = normalizeText(el.closest("section, .card, .panel, .box, div")?.textContent);
      return ctx.includes("promocja główna");
    }) ||
    null
  );
}

function findGiftSelect() {
  return (
    firstExisting("gift", "promotionGiftType", "benefit") ||
    qs('select[name="gift"]') ||
    qs('select[name="promotionGiftType"]') ||
    qs('select[name="benefit"]') ||
    qsa("select").find((el) => {
      const ctx = normalizeText(el.closest("section, .card, .panel, .box, div")?.textContent);
      return ctx.includes("dodatkowy benefit") || ctx.includes("wybierz benefit");
    }) ||
    null
  );
}

function findPromoMonthsInput() {
  return (
    firstExisting("promo-months", "externalMonthsInput", "promotionMonths") ||
    qs('input[name="promo-months"]') ||
    qs('input[name="externalMonthsInput"]') ||
    qs('input[name="promotionMonths"]') ||
    qsa('input[type="number"]').find((el) => {
      const ctx = normalizeText(el.closest("section, .card, .panel, .box, div")?.textContent);
      return ctx.includes("ilość miesięcy promocyjnych") || ctx.includes("pozostałe miesiące");
    }) ||
    null
  );
}

// ------------------------------------------
// 3. PERSISTENCE
// ------------------------------------------
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Nie udało się zapisać stanu.", e);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === "object") {
      Object.assign(state, parsed);
    }
  } catch (e) {
    console.warn("Nie udało się odczytać stanu.", e);
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
    alert("BŁĄD: Nie udało się pobrać pliku prices.json.");
  }
}

// ------------------------------------------
// 5. TARIFF UI
// ------------------------------------------
function renderTariffs() {
  const dynamicContainer = byId("tariff-grid");
  const currentGroup = priceConfig?.base?.[state.commitment]?.[state.building];

  if (!currentGroup || Object.keys(currentGroup).length === 0) return;

  if (!currentGroup[state.tariff]) {
    state.tariff = Object.keys(currentGroup)[0];
  }

  // Jeżeli istnieje kontener dynamiczny, a nie ma w nim sensownych inputów, generujemy kafelki.
  if (dynamicContainer) {
    const existingInputs = qsa('input[name="tariff"]', dynamicContainer);

    if (existingInputs.length === 0) {
      const tariffOrder = priceConfig.tariffs || [];
      const validTariffs = tariffOrder.filter((t) => currentGroup[t.id] !== undefined);

      dynamicContainer.innerHTML = validTariffs
        .map((t) => {
          const checked = t.id === state.tariff ? "checked" : "";
          const includedSym = t.id === "2000/2000"
            ? `<span class="pill success">symetryczne w cenie</span>`
            : "";

          return `
            <label class="tariff-option">
              <input type="radio" name="tariff" value="${t.id}" ${checked}>
              <span>
                <strong>${t.label || t.id}</strong>
                ${t.note ? `<small>${t.note}</small>` : ""}
                ${includedSym}
              </span>
            </label>
          `;
        })
        .join("");
    }
  }

  const allTariffInputs = qsa('input[name="tariff"]');
  allTariffInputs.forEach((input) => {
    input.checked = input.value === state.tariff;
    if (!input.dataset.boundTariff) {
      input.dataset.boundTariff = "1";
      input.addEventListener("change", () => {
        state.tariff = input.value;
        if (state.tariff === "2000/2000") {
          state.symmetric = false;
        }
        const tariffMeta = getTariffMeta(state.tariff);
        if (tariffMeta && tariffMeta.wifi === false) {
          state.meshCount = 0;
        }
        render();
      });
    }
  });

  const noteEl = byId("tariff-note");
  const tariffMeta = getTariffMeta(state.tariff);
  if (noteEl) {
    if (tariffMeta?.tech) {
      noteEl.style.display = "block";
      noteEl.textContent = `Info tech: ${tariffMeta.tech}`;
    } else {
      noteEl.style.display = "none";
      noteEl.textContent = "";
    }
  }
}

// ------------------------------------------
// 6. PROMO / BENEFITS OPTIONS
// ------------------------------------------
function renderPromoOptions() {
  const promoSelect = findPromoSelect();
  const giftSelect = findGiftSelect();
  const promoMonthsInput = findPromoMonthsInput();

  if (promoSelect) {
    const currentValue = state.promo;
    let html = `<option value="none">Brak promocji głównej</option>`;

    if (state.status === "new") {
      html += `
        <option value="6za1">6 za 1 / 3 za 1</option>
        <option value="ztr">ZTR 2026</option>
        <option value="powrot">Powrót do Multiplay</option>
      `;
    } else {
      html += `
        <option value="retention">Promocja Utrzymaniowa</option>
      `;
    }

    promoSelect.innerHTML = html;

    const validPromoValues = Array.from(promoSelect.options).map((o) => o.value);
    if (validPromoValues.includes(currentValue)) {
      promoSelect.value = currentValue;
    } else {
      state.promo = "none";
      promoSelect.value = "none";
    }

    if (!promoSelect.dataset.boundPromo) {
      promoSelect.dataset.boundPromo = "1";
      promoSelect.addEventListener("change", () => {
        state.promo = promoSelect.value || "none";
        render();
      });
    }
  }

  if (giftSelect) {
    const currentValue = state.gift;
    let html = `<option value="none">Brak dodatkowego benefitu</option>`;

    if (state.status === "current") {
      html += `
        <option value="wifi12">WiFi Premium za 1 zł przez 12 mies.</option>
        <option value="router">Wymiana routera</option>
      `;
    }

    giftSelect.innerHTML = html;

    const validGiftValues = Array.from(giftSelect.options).map((o) => o.value);
    if (validGiftValues.includes(currentValue)) {
      giftSelect.value = currentValue;
    } else {
      state.gift = "none";
      giftSelect.value = "none";
    }

    if (!giftSelect.dataset.boundGift) {
      giftSelect.dataset.boundGift = "1";
      giftSelect.addEventListener("change", () => {
        state.gift = giftSelect.value || "none";
        render();
      });
    }
  }

  if (promoMonthsInput) {
    const showInput = ["ztr", "powrot", "retention"].includes(state.promo);
    const wrapper = promoMonthsInput.closest(".field, .form-row, .input-group, .control, div") || promoMonthsInput.parentElement;

    if (wrapper) {
      wrapper.style.display = showInput ? "" : "none";
    }

    promoMonthsInput.value = String(state.promoMonths);

    if (!promoMonthsInput.dataset.boundPromoMonths) {
      promoMonthsInput.dataset.boundPromoMonths = "1";
      const handler = () => {
        state.promoMonths = clamp(safeNumber(promoMonthsInput.value, 1), 0, 24);
        render();
      };
      promoMonthsInput.addEventListener("input", handler);
      promoMonthsInput.addEventListener("change", handler);
    }
  }

  // Benefit box visibility
  const benefitSection = getSectionByHeading(["dodatkowy benefit", "wybierz benefit"]);
  if (benefitSection) {
    benefitSection.style.opacity = state.status === "current" ? "1" : "0.65";
  }
}

// ------------------------------------------
// 7. CALCULATION
// ------------------------------------------
function calculatePrice() {
  if (!priceConfig?.base || Object.keys(priceConfig.base).length === 0) return null;

  const commitmentMonths = safeNumber(state.commitment, 24);
  const base = getBasePrice();
  const afterIndefinite = getAfterIndefinitePrice();
  const installation = getInstallationPrice();

  let consentPenalty = 0;
  if (!state.ebill) consentPenalty += getAddonPrice("consentEbill");
  if (!state.marketing) consentPenalty += getAddonPrice("consentMarketingDisplay");

  const symmetricMonthly = state.symmetric
    ? (state.status === "current" ? getAddonPrice("symmetricCurrentPreview") : getAddonPrice("symmetricNew"))
    : 0;

  const internetPlusMonthly = state.internetPlus ? getAddonPrice("internetPlus") : 0;
  const securityMonthly = getSecurityPrice(state.security);

  const tvMonthly =
    (state.tvMax ? getAddonPrice("tvMax") : 0) +
    (state.tvCplusSport ? getAddonPrice("cplusSport") : 0) +
    (state.tvCplusFilms ? getAddonPrice("cplusFilms") : 0) +
    (state.tvPvrM ? getAddonPrice("pvrM") : 0) +
    (state.tvPvrL ? getAddonPrice("pvrL") : 0);

  const multiroomMonthly = state.multiroomCount * getAddonPrice("multiroomMonthly");
  const meshMonthly = state.meshCount * getAddonPrice("wifiMonthly");

  const normalMonthly = Number(
    (
      base +
      consentPenalty +
      symmetricMonthly +
      internetPlusMonthly +
      securityMonthly +
      tvMonthly +
      multiroomMonthly +
      meshMonthly
    ).toFixed(2)
  );

  const multiroomActivation = state.multiroomCount * getAddonPrice("multiroomActivation");
  const multiroomTech = state.multiroomCount > 0 && state.multiroomInstall === "tech"
    ? getAddonPrice("techVisit")
    : 0;

  const meshActivation = state.meshCount * getAddonPrice("wifiActivation");
  const meshTech = state.meshCount > 0 && state.meshInstall === "tech"
    ? getAddonPrice("techVisit")
    : 0;

  let promoLabel = "";
  let promoNote = "";
  let giftLabel = "";
  let giftNote = "";
  let promoMonths = 0;
  const bannerMonths = state.bannerPromo ? 1 : 0;
  let finalInstallation = installation;

  if (state.status === "new") {
    if (state.promo === "6za1") {
      promoMonths = commitmentMonths === 24 ? 6 : 3;
      promoLabel = `${promoMonths} za 1`;
      promoNote = `Abonament za 1 zł przez ${promoMonths} mies.`;
    } else if (state.promo === "ztr") {
      promoMonths = Math.min(commitmentMonths, Math.min(state.promoMonths, 12));
      promoLabel = "ZTR 2026";
      promoNote = `Promocja dla nowych klientów (${promoMonths} mies.).`;
    } else if (state.promo === "powrot") {
      promoMonths = Math.min(commitmentMonths, Math.min(state.promoMonths + 3, 24));
      promoLabel = "Powrót do Multiplay";
      promoNote = `Promocja przez ${promoMonths} mies. + instalacja za 1 zł.`;
      finalInstallation = 1;
    }
  } else {
    if (state.promo === "retention") {
      promoMonths = Math.min(commitmentMonths, state.promoMonths);
      promoLabel = "Promocja Utrzymaniowa";
      promoNote = `Rabat do 1 zł przez ${promoMonths} mies.`;
    }

    if (state.gift === "wifi12" && state.meshCount > 0) {
      giftLabel = "Benefit: WiFi Premium 1 zł";
      giftNote = `WiFi Premium za 1 zł przez 12 mies.`;
    } else if (state.gift === "router") {
      giftLabel = "Benefit: Wymiana routera";
      giftNote = `Benefit pozacenowy — bez wpływu na miesięczny abonament.`;
    }
  }

  const totalPromoMonths = Math.min(commitmentMonths, promoMonths + bannerMonths);
  const schedule = [];
  let totalCost = 0;

  for (let month = 1; month <= commitmentMonths; month += 1) {
    let monthPrice = normalMonthly;

    if (month <= totalPromoMonths) {
      monthPrice = 1;
      // kary za brak zgód dalej działają
      monthPrice += consentPenalty;
    }

    if (state.status === "current" && state.gift === "wifi12" && state.meshCount > 0 && month <= 12) {
      monthPrice -= meshMonthly;
      monthPrice += state.meshCount * 1;
    }

    monthPrice = Number(monthPrice.toFixed(2));
    schedule.push(monthPrice);
    totalCost += monthPrice;
  }

  const averageMonthly = Number((totalCost / commitmentMonths).toFixed(2));
  const theoreticalCost = normalMonthly * commitmentMonths;
  let savings = Number((theoreticalCost - totalCost).toFixed(2));

  if (state.status === "new" && state.promo === "powrot") {
    savings += installation - finalInstallation;
  }

  savings = Math.max(0, Number(savings.toFixed(2)));

  const groupedSchedule = [];
  if (schedule.length) {
    let start = 1;
    let currentPrice = schedule[0];

    for (let i = 1; i < schedule.length; i += 1) {
      if (schedule[i] !== currentPrice) {
        groupedSchedule.push({
          start,
          end: i,
          price: currentPrice
        });
        start = i + 1;
        currentPrice = schedule[i];
      }
    }

    groupedSchedule.push({
      start,
      end: schedule.length,
      price: currentPrice
    });
  }

  const notes = [];
  if (!promoLabel && !giftLabel && !state.bannerPromo) {
    notes.push("Brak dodatkowych uwag.");
  } else {
    if (promoNote) notes.push(promoNote);
    if (state.bannerPromo) notes.push("Promocja Banerowa: 1 dodatkowy miesiąc za 1 zł po głównej promocji.");
    if (giftNote) notes.push(giftNote);
  }

  return {
    base,
    afterIndefinite,
    consentPenalty,
    addonsMonthly: symmetricMonthly + internetPlusMonthly + securityMonthly + multiroomMonthly,
    tvMonthly,
    meshMonthly,
    monthly: normalMonthly,

    installation: finalInstallation,
    activation: multiroomActivation,
    meshActivation,
    tech: multiroomTech + meshTech,

    averageMonthly,
    groupedSchedule,
    savings,

    promoLabel,
    giftLabel,
    notes
  };
}

// ------------------------------------------
// 8. SUMMARY
// ------------------------------------------
function renderSummary(calc) {
  if (!calc) return;

  setText("summary-monthly", formatMoney(calc.monthly));
  setText("summary-start", formatMoney(calc.installation + calc.activation + calc.meshActivation + calc.tech));

  setText("sum-commitment", `${state.commitment} miesięcy`);
  setText("sum-building", state.building === "SFH" ? "Domek (SFH)" : "Blok (MFH)");
  setText("sum-status", state.status === "new" ? "Nowy klient" : "Obecny klient");
  setText("sum-tariff", state.tariff);

  setText("sum-base", formatMoney(calc.base));
  setText("sum-consents", calc.consentPenalty > 0 ? `+ ${formatMoney(calc.consentPenalty)}` : "0,00 zł");
  setText("sum-addons", calc.addonsMonthly > 0 ? `+ ${formatMoney(calc.addonsMonthly)}` : "0,00 zł");
  setText("sum-tv", calc.tvMonthly > 0 ? `+ ${formatMoney(calc.tvMonthly)}` : "0,00 zł");
  setText("sum-mesh-count", `${state.meshCount}x`);
  setText("sum-mesh", calc.meshMonthly > 0 ? `+ ${formatMoney(calc.meshMonthly)}` : "0,00 zł");

  setText("sum-installation", formatMoney(calc.installation));
  setText("sum-activation", calc.activation > 0 ? `+ ${formatMoney(calc.activation)}` : "0,00 zł");
  setText("sum-mesh-activation", calc.meshActivation > 0 ? `+ ${formatMoney(calc.meshActivation)}` : "0,00 zł");
  setText("sum-tech", calc.tech > 0 ? `+ ${formatMoney(calc.tech)}` : "0,00 zł");

  setText("summary-after-indefinite", formatMoney(calc.afterIndefinite));
  setText("summary-average", formatMoney(calc.averageMonthly));
  setText("summary-savings", formatMoney(calc.savings));

  const benefits = [];
  if (calc.promoLabel) benefits.push(calc.promoLabel);
  if (state.bannerPromo) benefits.push("Promocja Banerowa");
  if (calc.giftLabel) benefits.push(calc.giftLabel);

  setHTML(
    "benefits-list",
    benefits.length
      ? `<ul>${benefits.map((item) => `<li><strong>${item}</strong></li>`).join("")}</ul>`
      : `<p>Brak aktywnej promocji abonamentowej.</p>`
  );

  setHTML(
    "offer-notes",
    calc.notes && calc.notes.length
      ? `<ul>${calc.notes.map((item) => `<li>${item}</li>`).join("")}</ul>`
      : "<p>Brak dodatkowych uwag.</p>"
  );

  setHTML(
    "payment-schedule",
    calc.groupedSchedule && calc.groupedSchedule.length
      ? `
        <table class="schedule-table">
          <thead>
            <tr>
              <th>Miesiące</th>
              <th>Abonament</th>
            </tr>
          </thead>
          <tbody>
            ${calc.groupedSchedule
              .map((row) => {
                const label = row.start === row.end ? `${row.start}` : `${row.start}–${row.end}`;
                return `
                  <tr>
                    <td>${label}</td>
                    <td>${formatMoney(row.price)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      : "<p>brak aktywnej promocji abonamentowej</p>"
  );
}

// ------------------------------------------
// 9. VISUAL SYNC
// ------------------------------------------
function syncVisualCounters() {
  setText("mesh-out", String(state.meshCount));
  setText("wifi-out", String(state.meshCount));
  setText("multiroom-out", String(state.multiroomCount));
  setText("multiroom-count", String(state.multiroomCount));

  const meshSection = getSectionByHeading(["wifi premium", "mesh"]);
  if (meshSection) {
    qsa("span, div, strong, p", meshSection).forEach((node) => {
      const txt = normalizeText(node.textContent);
      if (txt === "0" || txt === "0 szt." || /^\d+\s*szt\.?$/.test(txt)) {
        node.textContent = txt.includes("szt") ? `${state.meshCount} szt.` : String(state.meshCount);
      }
    });
  }

  const multiSection = getSectionByHeading(["multiroom"]);
  if (multiSection) {
    qsa("span, div, strong, p", multiSection).forEach((node) => {
      const txt = normalizeText(node.textContent);
      if (txt === "0" || txt === "0 szt." || /^\d+\s*szt\.?$/.test(txt)) {
        node.textContent = txt.includes("szt") ? `${state.multiroomCount} szt.` : String(state.multiroomCount);
      }
    });
  }
}

function syncBasicControls() {
  qsa('input[name="commitment"]').forEach((el) => {
    el.checked = commitmentToInternal(el.value) === state.commitment;
  });

  qsa('input[name="building"]').forEach((el) => {
    el.checked = buildingToInternal(el.value) === state.building;
  });

  qsa('input[name="status"]').forEach((el) => {
    el.checked = statusToInternal(el.value) === state.status;
  });

  const ebill = firstExisting("addon-ebill", "ebill");
  if (ebill) ebill.checked = !!state.ebill;

  const marketing = firstExisting("addon-marketing", "marketing");
  if (marketing) marketing.checked = !!state.marketing;

  const symmetric = firstExisting("addon-sym", "symmetric");
  if (symmetric) {
    symmetric.checked = !!state.symmetric;
    symmetric.disabled = state.tariff === "2000/2000";
  }

  const internetPlus = firstExisting("addon-internet-plus", "internet-plus");
  if (internetPlus) internetPlus.checked = !!state.internetPlus;

  const tvBindings = [
    ["tv-max", "tvMax"],
    ["tv-cplus-sport", "tvCplusSport"],
    ["tv-cplus-films", "tvCplusFilms"],
    ["tv-pvr-m", "tvPvrM"],
    ["tv-pvr-l", "tvPvrL"]
  ];

  tvBindings.forEach(([id, key]) => {
    const el = byId(id);
    if (el) el.checked = !!state[key];
  });

  const banner = firstExisting("banner-promo", "bannerPromoEnabled", "bannerPromo");
  if (banner) banner.checked = !!state.bannerPromo;

  const securitySelect = findSecuritySelect();
  if (securitySelect) securitySelect.value = state.security;

  const promoSelect = findPromoSelect();
  if (promoSelect) promoSelect.value = state.promo;

  const giftSelect = findGiftSelect();
  if (giftSelect) giftSelect.value = state.gift;

  const promoMonthsInput = findPromoMonthsInput();
  if (promoMonthsInput) promoMonthsInput.value = String(state.promoMonths);

  qsa('input[name="mesh-install"], input[name="wifi-install"]').forEach((el) => {
    el.checked = el.value === state.meshInstall;
  });

  qsa('input[name="multiroom-install"]').forEach((el) => {
    el.checked = el.value === state.multiroomInstall;
  });
}

// ------------------------------------------
// 10. RENDER
// ------------------------------------------
function render() {
  if (!priceConfig?.base || Object.keys(priceConfig.base).length === 0) return;

  const currentGroup = priceConfig?.base?.[state.commitment]?.[state.building];
  if (currentGroup && !currentGroup[state.tariff]) {
    state.tariff = Object.keys(currentGroup)[0];
  }

  if (state.tariff === "2000/2000") {
    state.symmetric = false;
  }

  const tariffMeta = getTariffMeta(state.tariff);
  if (tariffMeta && tariffMeta.wifi === false) {
    state.meshCount = 0;
  }

  renderTariffs();
  renderPromoOptions();
  syncBasicControls();
  syncVisualCounters();

  const calc = calculatePrice();
  renderSummary(calc);

  saveState();
}

// ------------------------------------------
// 11. BINDERS
// ------------------------------------------
function bindCoreRadios() {
  qsa('input[name="commitment"]').forEach((el) => {
    if (el.dataset.boundCommitment) return;
    el.dataset.boundCommitment = "1";
    el.addEventListener("change", () => {
      state.commitment = commitmentToInternal(el.value);
      render();
    });
  });

  qsa('input[name="building"]').forEach((el) => {
    if (el.dataset.boundBuilding) return;
    el.dataset.boundBuilding = "1";
    el.addEventListener("change", () => {
      state.building = buildingToInternal(el.value);
      render();
    });
  });

  qsa('input[name="status"]').forEach((el) => {
    if (el.dataset.boundStatus) return;
    el.dataset.boundStatus = "1";
    el.addEventListener("change", () => {
      state.status = statusToInternal(el.value);
      if (state.status === "new") {
        state.gift = "none";
        if (state.promo === "retention") {
          state.promo = "none";
        }
      }
      render();
    });
  });
}

function bindBasicCheckboxes() {
  const ebill = firstExisting("addon-ebill", "ebill");
  if (ebill && !ebill.dataset.bound) {
    ebill.dataset.bound = "1";
    ebill.addEventListener("change", () => {
      state.ebill = !!ebill.checked;
      render();
    });
  }

  const marketing = firstExisting("addon-marketing", "marketing");
  if (marketing && !marketing.dataset.bound) {
    marketing.dataset.bound = "1";
    marketing.addEventListener("change", () => {
      state.marketing = !!marketing.checked;
      render();
    });
  }

  const symmetric = firstExisting("addon-sym", "symmetric");
  if (symmetric && !symmetric.dataset.bound) {
    symmetric.dataset.bound = "1";
    symmetric.addEventListener("change", () => {
      state.symmetric = state.tariff === "2000/2000" ? false : !!symmetric.checked;
      render();
    });
  }

  const internetPlus = firstExisting("addon-internet-plus", "internet-plus");
  if (internetPlus && !internetPlus.dataset.bound) {
    internetPlus.dataset.bound = "1";
    internetPlus.addEventListener("change", () => {
      state.internetPlus = !!internetPlus.checked;
      render();
    });
  }

  const banner = firstExisting("banner-promo", "bannerPromoEnabled", "bannerPromo");
  if (banner && !banner.dataset.bound) {
    banner.dataset.bound = "1";
    banner.addEventListener("change", () => {
      state.bannerPromo = !!banner.checked;
      render();
    });
  }
}

function bindSecurity() {
  const select = findSecuritySelect();
  if (!select || select.dataset.boundSecurity) return;

  select.dataset.boundSecurity = "1";
  const handler = () => {
    state.security = select.value || "none";
    render();
  };

  select.addEventListener("change", handler);
  select.addEventListener("input", handler);
}

function bindInstallTypes() {
  qsa('input[name="mesh-install"], input[name="wifi-install"]').forEach((el) => {
    if (el.dataset.boundInstall) return;
    el.dataset.boundInstall = "1";
    el.addEventListener("change", () => {
      state.meshInstall = el.value || "self";
      render();
    });
  });

  qsa('input[name="multiroom-install"]').forEach((el) => {
    if (el.dataset.boundInstall) return;
    el.dataset.boundInstall = "1";
    el.addEventListener("change", () => {
      state.multiroomInstall = el.value || "self";
      render();
    });
  });
}

function bindSteppers() {
  const bindStepperInSection = (sectionNames, minusFn, plusFn) => {
    const section = getSectionByHeading(sectionNames);
    if (!section) return;

    const buttons = qsa("button", section);
    if (buttons.length < 2) return;

    let minusButton = null;
    let plusButton = null;

    buttons.forEach((btn) => {
      const txt = normalizeText(btn.textContent || btn.getAttribute("aria-label") || "");
      const cls = normalizeText(btn.className || "");
      const action = normalizeText(btn.dataset?.action || "");

      if (!minusButton && (txt === "-" || txt.includes("minus") || cls.includes("minus") || action.includes("minus"))) {
        minusButton = btn;
      }
      if (!plusButton && (txt === "+" || txt.includes("plus") || cls.includes("plus") || action.includes("plus"))) {
        plusButton = btn;
      }
    });

    if (!minusButton) minusButton = buttons[0];
    if (!plusButton) plusButton = buttons[buttons.length - 1];

    if (minusButton && !minusButton.dataset.boundStep) {
      minusButton.dataset.boundStep = "1";
      minusButton.addEventListener("click", (e) => {
        e.preventDefault();
        minusFn();
        render();
      });
    }

    if (plusButton && !plusButton.dataset.boundStep) {
      plusButton.dataset.boundStep = "1";
      plusButton.addEventListener("click", (e) => {
        e.preventDefault();
        plusFn();
        render();
      });
    }
  };

  bindStepperInSection(
    ["wifi premium", "mesh"],
    () => {
      state.meshCount = Math.max(0, state.meshCount - 1);
    },
    () => {
      const tariffMeta = getTariffMeta(state.tariff);
      if (tariffMeta && tariffMeta.wifi === false) return;
      state.meshCount += 1;
    }
  );

  bindStepperInSection(
    ["multiroom"],
    () => {
      state.multiroomCount = Math.max(0, state.multiroomCount - 1);
    },
    () => {
      state.multiroomCount += 1;
    }
  );
}

function bindTv() {
  const exactBindings = [
    ["tv-max", "tvMax"],
    ["tv-cplus-sport", "tvCplusSport"],
    ["tv-cplus-films", "tvCplusFilms"],
    ["tv-pvr-m", "tvPvrM"],
    ["tv-pvr-l", "tvPvrL"]
  ];

  exactBindings.forEach(([id, key]) => {
    const el = byId(id);
    if (!el || el.dataset.boundTv) return;
    el.dataset.boundTv = "1";
    el.addEventListener("change", () => {
      state[key] = !!el.checked;
      render();
    });
  });

  const tvSection = getSectionByHeading(["tv i dodatki premium", "tv", "dodatki premium"]);
  if (!tvSection) return;

  const maps = [
    { phrases: ["tv max"], key: "tvMax" },
    { phrases: ["c+ super sport", "super sport"], key: "tvCplusSport" },
    { phrases: ["seriale i filmy"], key: "tvCplusFilms" },
    { phrases: ["pvr m"], key: "tvPvrM" },
    { phrases: ["pvr l"], key: "tvPvrL" }
  ];

  const clickables = qsa("label, button, .toggle-card, .select-card, .option-card, .card", tvSection);

  clickables.forEach((node) => {
    if (node.dataset.boundTvCard) return;

    const txt = normalizeText(node.textContent);
    const found = maps.find((item) => item.phrases.some((phrase) => txt.includes(normalizeText(phrase))));
    if (!found) return;

    node.dataset.boundTvCard = "1";
    node.addEventListener("click", (e) => {
      const tag = normalizeText(e.target.tagName);
      if (tag === "input" || tag === "select" || tag === "option") return;

      const nestedCheckbox = node.querySelector('input[type="checkbox"]');
      if (nestedCheckbox) {
        nestedCheckbox.checked = !nestedCheckbox.checked;
        state[found.key] = !!nestedCheckbox.checked;
      } else {
        state[found.key] = !state[found.key];
      }

      render();
    });
  });
}

// ------------------------------------------
// 12. INIT
// ------------------------------------------
async function init() {
  loadState();
  await loadPriceConfig();

  bindCoreRadios();
  bindBasicCheckboxes();
  bindSecurity();
  bindInstallTypes();
  bindSteppers();
  bindTv();

  render();
}

document.addEventListener("DOMContentLoaded", init);
