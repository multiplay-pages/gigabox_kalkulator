// ==========================================
// 1. ZARZĄDZANIE STANEM (STATE)
// ==========================================
const state = {
  commitment: "24",
  building: "SFH",
  status: "new",
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
  tvCplusFilms: false,
  tvPvrM: false,
  tvPvrL: false,
  promo: "none",
  promoMonths: 1, 
  gift: "none",
  bannerPromo: false
};

// ==========================================
// 2. CENNIK (PRICE CONFIG)
// ==========================================
let priceConfig = { tariffs: [], base: {}, indefinite: {}, installation: {}, addons: {} };

async function loadPriceConfig() {
  try {
    const response = await fetch("prices.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("HTTP error " + response.status);
    }
    priceConfig = await response.json();
  } catch (error) {
    console.error("Nie udało się załadować prices.json:", error);
    alert("BŁĄD: Nie udało się pobrać pliku prices.json. Upewnij się, że plik znajduje się w tym samym folderze i korzystasz z serwera lokalnego (np. uruchomiłeś 'python3 -m http.server 4173').");
  }
}

// ==========================================
// 3. PERSISTENCE (LOCAL STORAGE)
// ==========================================
const STORAGE_KEY = "gigabox_calc_state_v2";

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Nie udało się zapisać stanu do localStorage.");
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state, parsed);
    }
  } catch (e) {
    console.warn("Nie udało się odczytać stanu z localStorage.");
  }
}

// ==========================================
// 4. GŁÓWNA LOGIKA KALKULATORA (SINGLE SOURCE OF TRUTH)
// ==========================================
function calculatePrice() {
  const data = priceConfig;
  if (!data.base || Object.keys(data.base).length === 0) return null;

  const commitmentMonths = parseInt(state.commitment, 10);
  
  let baseTariffPrice = 0;
  if (data.base[state.commitment] && data.base[state.commitment][state.building]) {
      baseTariffPrice = data.base[state.commitment][state.building][state.tariff] || 0;
  }

  const base = baseTariffPrice / 100;
  const afterIndefinite = (data.indefinite && data.indefinite[state.tariff]) ? (data.indefinite[state.tariff] / 100) : 0; 
  const installation = state.status === "new" && data.installation ? (data.installation[state.tariff] / 100 || 249) : 0;

  let consentPenalty = 0;
  const ebillPenalty = (data.addons.consentEbill || 1000) / 100;
  const marketingPenalty = (data.addons.consentMarketingDisplay || 500) / 100;

  if (!state.ebill) consentPenalty += ebillPenalty;
  if (!state.marketing) consentPenalty += marketingPenalty;

  let symmetricMonthly = 0;
  if (state.symmetric) {
    symmetricMonthly = state.status === "current" ? (data.addons.symmetricCurrentPreview / 100) : (data.addons.symmetricNew / 100);
  }

  const internetPlusMonthly = state.internetPlus ? (data.addons.internetPlus / 100) : 0;
  
  const tvMonthly = (state.tvCplusFilms ? (data.addons.cplusFilms / 100 || 24.99) : 0) + 
                    (state.tvPvrM ? (data.addons.pvrM / 100 || 10) : 0) + 
                    (state.tvPvrL ? (data.addons.pvrL / 100 || 15) : 0);

  const securityMonthly = data.addons.security ? (data.addons.security[state.security] / 100 || 0) : 0;
  const multiroomMonthly = state.multiroomCount * (data.addons.multiroomMonthly / 100);
  
  const meshMonthlyUnit = data.addons.wifiMonthly / 100;
  const baseMeshMonthly = state.meshCount * meshMonthlyUnit;

  const normalAddonsMonthly = symmetricMonthly + internetPlusMonthly + tvMonthly + securityMonthly + multiroomMonthly + baseMeshMonthly;
  const normalMonthly = base + consentPenalty + normalAddonsMonthly;

  const multiroomActivation = state.multiroomCount * (data.addons.multiroomActivation / 100);
  const multiroomTech = state.multiroomCount > 0 && state.multiroomInstall === "tech" ? (data.addons.techVisit / 100) : 0;
  const meshActivation = state.meshCount * (data.addons.wifiActivation / 100);
  const meshTech = state.meshCount > 0 && state.meshInstall === "tech" ? (data.addons.techVisit / 100) : 0;

  let mainPromoMonths = 0;
  let bannerMonths = state.bannerPromo ? 1 : 0;
  let promoLabel = "";
  let promoNote = "";
  let giftLabel = "";
  let giftNote = "";
  let isRetension = false;
  let installationOverride = installation;

  if (state.status === "new") {
    if (state.promo === "6za1") {
      mainPromoMonths = commitmentMonths === 24 ? 6 : 3;
      promoLabel = `${mainPromoMonths} za 1`;
      promoNote = `Abonament obniżony do 1 zł przez pierwsze ${mainPromoMonths} mies.`;
    } else if (state.promo === "ztr") {
      mainPromoMonths = Math.min(commitmentMonths, Math.min(Number(state.promoMonths || 0), 12));
      promoLabel = "ZTR 2026";
      promoNote = `Promocja dla nowych klientów (${mainPromoMonths} mies., max 12).`;
    } else if (state.promo === "powrot") {
      mainPromoMonths = Math.min(commitmentMonths, Math.min(Number(state.promoMonths || 0) + 3, 24));
      promoLabel = "Powrót do Multiplay";
      promoNote = `Promocja na ${mainPromoMonths} mies. Instalacja za 1 zł.`;
      installationOverride = 1;
    }
  } else if (state.status === "current") {
    if (state.promo === "retention") {
      mainPromoMonths = Math.min(commitmentMonths, Number(state.promoMonths || 1));
      promoLabel = "Promocja Utrzymaniowa";
      promoNote = `Rabat na wszystkie usługi do 1 zł przez ${mainPromoMonths} mies.`;
      isRetension = true;
    }
    
    if (state.gift === "wifi12" && state.meshCount > 0) {
      giftLabel = "Prezent: WiFi Premium 1 zł";
      giftNote = "Opłata za wszystkie urządzenia Mesh obniżona do 1 zł przez 12 mies.";
    } else if (state.gift === "router") {
      giftLabel = "Prezent: Wymiana routera";
      giftNote = "Wymiana urządzenia bazowego (nie wpływa na cenę abonamentu).";
    }
  }

  let totalCost = 0;
  const scheduleArray = [];
  const totalPromoMonths = Math.min(commitmentMonths, mainPromoMonths + bannerMonths);
  
  for (let month = 1; month <= commitmentMonths; month++) {
    let monthPrice = 0;
    
    if (month <= totalPromoMonths) {
       monthPrice = 1;
       if (consentPenalty > 0) monthPrice += consentPenalty;
    } else {
       monthPrice = normalMonthly;
       if (state.status === "current" && state.gift === "wifi12" && state.meshCount > 0 && month <= 12) {
         monthPrice -= baseMeshMonthly;
         monthPrice += (1 * state.meshCount); 
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
    for (let m = 2; m <= scheduleArray.length; m++) {
      if (scheduleArray[m - 1] !== currentVal) {
        scheduleRows.push({ start: startM, end: m - 1, price: currentVal });
        startM = m;
        currentVal = scheduleArray[m - 1];
      }
    }
    scheduleRows.push({ start: startM, end: scheduleArray.length, price: currentVal });
  }

  const averageMonthly = Number((totalCost / commitmentMonths).toFixed(2));
  
  const theoreticalTotalCost = normalMonthly * commitmentMonths;
  let totalSavings = theoreticalTotalCost - totalCost;
  if (state.status === "new" && state.promo === "powrot") {
    totalSavings += (installation - 1);
  }
  totalSavings = Math.max(0, Number(totalSavings.toFixed(2)));

  const notes = [];
  if (consentPenalty > 0 && totalPromoMonths > 0) {
    notes.push("Uwaga: w miesiącach promocyjnych „za 1 zł” kary za brak zgód wciąż obowiązują i podnoszą rachunek.");
  }
  if (state.symmetric && state.status === "current") {
    notes.push("Rabat z 10 zł na 5 zł dla obecnych klientów na łącze symetryczne wchodzi od kolejnego okresu rozliczeniowego i wymaga potwierdzenia.");
  }

  return {
    base, afterIndefinite, consentPenalty, addonsMonthly: normalAddonsMonthly,
    installation: installationOverride, activation: multiroomActivation,
    meshActivation, tech: meshTech + multiroomTech, monthly: normalMonthly,
    averageMonthly, promoLabel, promoNote, bannerMonths, scheduleRows,
    giftLabel, giftNote, totalSavings, notes
  };
}

function formatMoney(val) {
  return Number(val).toFixed(2).replace('.', ',') + " zł";
}

// ==========================================
// 5. RENDEROWANIE INTERFEJSU
// ==========================================
function renderTariffs() {
  const container = document.getElementById("tariff-grid");
  const noteEl = document.getElementById("tariff-note");
  if (!container || !noteEl) return;

  const currentBuildingConfig = priceConfig.base[state.commitment][state.building];
  
  if (!currentBuildingConfig[state.tariff]) {
     state.tariff = Object.keys(currentBuildingConfig)[0];
  }

  const validTariffs = priceConfig.tariffs.filter(t => currentBuildingConfig[t.id] !== undefined);

  container.innerHTML = validTariffs.map(t => {
    return `
      <label class="choice">
        <input type="radio" name="tariff" value="${t.id}" ${t.id === state.tariff ? "checked" : ""}>
        <span class="card">
          <strong>${t.label}</strong>
          <small>${t.note}</small>
          ${t.includedSym ? '<span class="pill success">symetryczne w cenie</span>' : ""}
        </span>
      </label>
    `;
  }).join("");

  const tObj = priceConfig.tariffs.find(t => t.id === state.tariff);
  if (tObj && tObj.tech) {
    noteEl.style.display = "block";
    noteEl.textContent = "Info tech: " + tObj.tech;
  } else {
    noteEl.style.display = "none";
  }

  container.querySelectorAll('input[name="tariff"]').forEach(input => {
    input.addEventListener("change", e => {
      state.tariff = e.target.value;
      if (state.tariff === "2000/2000") state.symmetric = false;
      const t = priceConfig.tariffs.find(x => x.id === state.tariff);
      if (!t?.wifi) {
        state.meshCount = 0;
        state.meshInstall = "self";
      }
      render();
    });
  });
}

function updatePromoOptions() {
  const isNew = state.status === "new";
  const promoSelect = document.getElementById("promo");
  if (!promoSelect) return;

  const currentSelection = state.promo;
  let optionsHtml = '<option value="none">Brak promocji głównej</option>';

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
  
  if (Array.from(promoSelect.options).some(opt => opt.value === currentSelection)) {
      promoSelect.value = currentSelection;
  } else {
      promoSelect.value = "none";
      state.promo = "none";
  }

  const promoMonthsWrap = document.getElementById("promo-months-wrap");
  if (promoMonthsWrap) {
      promoMonthsWrap.style.display = (state.promo === "ztr" || state.promo === "powrot" || state.promo === "retention") ? "block" : "none";
  }
  
  const giftWrap = document.getElementById("gift-wrap");
  if (giftWrap) giftWrap.style.display = isNew ? "none" : "block";
  
  const promoMonthsLabel = document.getElementById("promo-months-label");
  if(promoMonthsLabel) {
      if(state.promo === "retention") {
          promoMonthsLabel.textContent = "Ilość miesięcy promocyjnych (do 1zł):";
      } else {
          promoMonthsLabel.textContent = "Pozostałe miesiące u obecnego operatora:";
      }
  }

  const promoMonthsInput = document.getElementById("promo-months");
  if(promoMonthsInput) promoMonthsInput.value = state.promoMonths;

  const bannerWrap = document.getElementById("banner-wrap");
  if (bannerWrap) bannerWrap.style.display = (state.promo !== "none") ? "flex" : "none";
}

function render() {
  if (Object.keys(priceConfig.base).length === 0) return;

  saveState();

  const isSymIncluded = state.tariff === "2000/2000";
  const symCheckbox = document.getElementById("addon-sym");
  const symLabel = document.getElementById("addon-sym-label");
  const symPill = document.getElementById("addon-sym-pill");
  
  if (isSymIncluded) {
    if (symCheckbox) symCheckbox.disabled = true;
    if (symLabel) symLabel.textContent = "W cenie";
    if (symPill) {
        symPill.textContent = "2000/2000";
        symPill.className = "pill success";
    }
  } else {
    if (symCheckbox) symCheckbox.disabled = false;
    if (symLabel && symPill) {
        if (state.status === "current") {
            symLabel.textContent = "5 zł / mies. (preview)";
            symPill.textContent = "wymaga potwierdzenia";
            symPill.className = "pill warning";
        } else {
            symLabel.textContent = "10 zł / mies.";
            symPill.textContent = "dla nowych";
            symPill.className = "pill";
        }
    }
  }

  const tObj = priceConfig.tariffs.find(t => t.id === state.tariff);
  const wifiAllowed = tObj?.wifi;
  
  const meshWrap = document.getElementById("mesh-wrap");
  const meshNote = document.getElementById("mesh-note");
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

  const meshOut = document.getElementById("mesh-out");
  if(meshOut) meshOut.textContent = state.meshCount;
  
  const multiroomOut = document.getElementById("multiroom-out");
  if(multiroomOut) multiroomOut.textContent = state.multiroomCount;

  updatePromoOptions();

  const calc = calculatePrice();
  if(!calc) return;
  
  const sumMonthly = document.getElementById("summary-monthly");
  if(sumMonthly) sumMonthly.textContent = formatMoney(calc.monthly);
  
  const sumStart = document.getElementById("summary-start");
  const startCost = calc.installation + calc.activation + calc.meshActivation + calc.tech;
  if(sumStart) sumStart.textContent = formatMoney(startCost);

  const sumComm = document.getElementById("sum-commitment");
  if(sumComm) sumComm.textContent = `${state.commitment} miesięcy`;

  const sumBuild = document.getElementById("sum-building");
  if(sumBuild) sumBuild.textContent = state.building === "SFH" ? "Domek (SFH)" : "Blok (MFH)";

  const sumStat = document.getElementById("sum-status");
  if(sumStat) sumStat.textContent = state.status === "new" ? "Nowy klient" : "Obecny klient";

  const sumTariff = document.getElementById("sum-tariff");
  if(sumTariff) sumTariff.textContent = state.tariff;

  const sumAvg = document.getElementById("sum-avg");
  if(sumAvg) sumAvg.textContent = `${formatMoney(calc.averageMonthly)} / mies.`;

  const sumSav = document.getElementById("sum-savings");
  if(sumSav) sumSav.textContent = formatMoney(calc.totalSavings);

  const schedEl = document.getElementById("sum-schedule");
  if(schedEl) {
      schedEl.innerHTML = calc.scheduleRows.map(r => {
        const range = r.start === r.end ? `${r.start} mies.` : `${r.start}–${r.end} mies.`;
        return `<div class="schedule-row"><span class="schedule-range">${range}</span><strong class="schedule-price">${formatMoney(r.price)} / mies.</strong></div>`;
      }).join("");
  }

  const benList = [];
  if (calc.promoLabel) benList.push(`<strong>${calc.promoLabel}</strong><div class="tiny">${calc.promoNote}</div>`);
  if (calc.bannerMonths > 0) benList.push(`<strong>Promocja Banerowa</strong><div class="tiny">1 mies. za 1 zł przedłużenia</div>`);
  if (calc.giftLabel) benList.push(`<strong>${calc.giftLabel}</strong><div class="tiny">${calc.giftNote}</div>`);
  if (isSymIncluded) benList.push(`<strong>Symetryczne w cenie</strong><div class="tiny">Cecha taryfy 2000/2000</div>`);
  if (state.meshCount > 0) benList.push(`<strong>MESH: ${state.meshCount} szt.</strong><div class="tiny">Dodatek płatny</div>`);
  if (state.multiroomCount > 0) benList.push(`<strong>Multiroom: ${state.multiroomCount} szt.</strong><div class="tiny">Dekoder dodatkowy</div>`);

  const benefitsEl = document.getElementById("sum-benefits");
  if(benefitsEl) {
      benefitsEl.innerHTML = benList.length ? benList.map(b => `<div style="margin-bottom:8px">${b}</div>`).join("") : '<div class="tiny">Brak</div>';
  }

  const elBase = document.getElementById("bd-base");
  if(elBase) elBase.textContent = formatMoney(calc.base);
  
  const elConsent = document.getElementById("bd-consent");
  if(elConsent) elConsent.textContent = calc.consentPenalty > 0 ? `+ ${formatMoney(calc.consentPenalty)}` : "0,00 zł";
  
  const elAddons = document.getElementById("bd-addons");
  if(elAddons) elAddons.textContent = calc.addonsMonthly > 0 ? `+ ${formatMoney(calc.addonsMonthly)}` : "0,00 zł";
  
  const elInstall = document.getElementById("bd-install");
  if(elInstall) elInstall.textContent = formatMoney(calc.installation);
  
  const elActivation = document.getElementById("bd-activation");
  const actTotal = calc.activation + calc.meshActivation + calc.tech;
  if(elActivation) elActivation.textContent = actTotal > 0 ? `+ ${formatMoney(actTotal)}` : "0,00 zł";

  const notesEl = document.getElementById("sum-notes");
  if (notesEl) {
      if (calc.notes.length > 0) {
        notesEl.style.display = "block";
        notesEl.innerHTML = `<strong>Ważne uwagi:</strong><ul class="muted-list">${calc.notes.map(n => `<li>${n}</li>`).join("")}</ul>`;
      } else {
        notesEl.style.display = "none";
      }
  }
}

// ==========================================
// 6. INICJALIZACJA I BINDING
// ==========================================
function bind() {
  document.querySelectorAll('input[name="commitment"]').forEach(el => {
    el.addEventListener("change", e => { state.commitment = e.target.value; renderTariffs(); render(); });
  });
  document.querySelectorAll('input[name="building"]').forEach(el => {
    el.addEventListener("change", e => { state.building = e.target.value; renderTariffs(); render(); });
  });
  document.querySelectorAll('input[name="status"]').forEach(el => {
    el.addEventListener("change", e => { state.status = e.target.value; updatePromoOptions(); render(); });
  });

  const cbEbill = document.getElementById("consent-ebill");
  if(cbEbill) cbEbill.addEventListener("change", e => { state.ebill = e.target.checked; render(); });
  
  const cbMarketing = document.getElementById("consent-marketing");
  if(cbMarketing) cbMarketing.addEventListener("change", e => { state.marketing = e.target.checked; render(); });

  const cbSym = document.getElementById("addon-sym");
  if(cbSym) cbSym.addEventListener("change", e => { state.symmetric = e.target.checked; render(); });
  
  const cbIntPlus = document.getElementById("addon-internetplus");
  if(cbIntPlus) cbIntPlus.addEventListener("change", e => { state.internetPlus = e.target.checked; render(); });

  const selMeshInst = document.getElementById("mesh-install");
  if(selMeshInst) selMeshInst.addEventListener("change", e => { state.meshInstall = e.target.value; render(); });
  
  const btnMeshMinus = document.getElementById("mesh-minus");
  if(btnMeshMinus) btnMeshMinus.addEventListener("click", () => { state.meshCount = Math.max(0, state.meshCount - 1); render(); });
  
  const btnMeshPlus = document.getElementById("mesh-plus");
  if(btnMeshPlus) btnMeshPlus.addEventListener("click", () => { state.meshCount = Math.min(5, state.meshCount + 1); render(); });

  const tvCplus = document.getElementById("tv-cplus-films");
  if(tvCplus) tvCplus.addEventListener("change", e => { state.tvCplusFilms = e.target.checked; render(); });
  
  const tvPvrM = document.getElementById("tv-pvr-m");
  if(tvPvrM) tvPvrM.addEventListener("change", e => { state.tvPvrM = e.target.checked; render(); });
  
  const tvPvrL = document.getElementById("tv-pvr-l");
  if(tvPvrL) tvPvrL.addEventListener("change", e => { state.tvPvrL = e.target.checked; render(); });

  const selMultiInst = document.getElementById("multiroom-install");
  if(selMultiInst) selMultiInst.addEventListener("change", e => { state.multiroomInstall = e.target.value; render(); });
  
  const btnMultiMinus = document.getElementById("multiroom-minus");
  if(btnMultiMinus) btnMultiMinus.addEventListener("click", () => { state.multiroomCount = Math.max(0, state.multiroomCount - 1); render(); });
  
  const btnMultiPlus = document.getElementById("multiroom-plus");
  if(btnMultiPlus) btnMultiPlus.addEventListener("click", () => { state.multiroomCount = Math.min(5, state.multiroomCount + 1); render(); });

  const selPromo = document.getElementById("promo");
  if(selPromo) selPromo.addEventListener("change", e => { state.promo = e.target.value; updatePromoOptions(); render(); });
  
  const inpPromoM = document.getElementById("promo-months");
  if(inpPromoM) inpPromoM.addEventListener("input", e => {
      let val = parseInt(e.target.value, 10);
      if(isNaN(val) || val < 1) val = 1;
      if(val > 24) val = 24;
      e.target.value = val;
      state.promoMonths = val; 
      render(); 
  });
  
  const selGift = document.getElementById("gift");
  if(selGift) selGift.addEventListener("change", e => { state.gift = e.target.value; render(); });
  
  const cbBanner = document.getElementById("banner-promo");
  if(cbBanner) cbBanner.addEventListener("change", e => { state.bannerPromo = e.target.checked; render(); });

  if(cbEbill) state.ebill = cbEbill.checked;
  if(cbMarketing) state.marketing = cbMarketing.checked;
  
  const commChecked = document.querySelector('input[name="commitment"]:checked');
  if(commChecked) state.commitment = commChecked.value;
  
  const buildChecked = document.querySelector('input[name="building"]:checked');
  if(buildChecked) state.building = buildChecked.value;
  
  const statusChecked = document.querySelector('input[name="status"]:checked');
  if(statusChecked) state.status = statusChecked.value;
}

async function init() {
  await loadPriceConfig();
  loadState(); 
  
  const commNode = document.querySelector(`input[name="commitment"][value="${state.commitment}"]`);
  if(commNode) commNode.checked = true;
  
  const buildNode = document.querySelector(`input[name="building"][value="${state.building}"]`);
  if(buildNode) buildNode.checked = true;
  
  const statusNode = document.querySelector(`input[name="status"][value="${state.status}"]`);
  if(statusNode) statusNode.checked = true;

  const cbEbill = document.getElementById("consent-ebill");
  if(cbEbill) cbEbill.checked = state.ebill;
  
  const cbMarketing = document.getElementById("consent-marketing");
  if(cbMarketing) cbMarketing.checked = state.marketing;
  
  const cbSym = document.getElementById("addon-sym");
  if(cbSym) cbSym.checked = state.symmetric;
  
  const cbIntPlus = document.getElementById("addon-internetplus");
  if(cbIntPlus) cbIntPlus.checked = state.internetPlus;
  
  const tvCplus = document.getElementById("tv-cplus-films");
  if(tvCplus) tvCplus.checked = state.tvCplusFilms;
  
  const tvPvrM = document.getElementById("tv-pvr-m");
  if(tvPvrM) tvPvrM.checked = state.tvPvrM;
  
  const tvPvrL = document.getElementById("tv-pvr-l");
  if(tvPvrL) tvPvrL.checked = state.tvPvrL;
  
  const cbBanner = document.getElementById("banner-promo");
  if(cbBanner) cbBanner.checked = state.bannerPromo;
  
  const selMeshInst = document.getElementById("mesh-install");
  if(selMeshInst) selMeshInst.value = state.meshInstall;
  
  const selMultiInst = document.getElementById("multiroom-install");
  if(selMultiInst) selMultiInst.value = state.multiroomInstall;
  
  renderTariffs();
  bind();
  render();
}

// Zabezpieczenie przed niewłaściwym wywołaniem w stosunku do parsowania dokumentu
function startCalculator() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

startCalculator();
