const state = {
  commitment: "24",
  building: "SFH",
  status: "new",
  tariff: "1000/300",
  ebill: true,
  marketing: true,
  symmetric: false,
  internetPlus: false,
  phone: false,
  meshCount: 0,
  meshInstall: "self",
  multiroomCount: 0,
  multiroomInstall: "self",
  security: "none",
  tvMax: false,
  tvCplusSport: false,
  tvCplusFilms: false,
  tvPvrM: false,
  tvPvrL: false,
  promo: "none",
  promoMonths: 1,
  gift: "none",
  bannerPromo: false,
};

let priceConfig = {
  tariffs: [],
  base: {},
  indefinite: {},
  installation: {},
  addons: {},
};

const STORAGE_KEY = "gigabox_calc_state_v8";

function byId(id) {
  return document.getElementById(id);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  return `${toNumber(value).toFixed(2).replace(".", ",")} zł`;
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function setHTML(id, value) {
  const el = byId(id);
  if (el) el.innerHTML = value;
}

function getAddonPrice(key) {
  return toNumber(priceConfig?.addons?.[key], 0) / 100;
}

function getSecurityPrice(code) {
  return toNumber(priceConfig?.addons?.security?.[code], 0) / 100;
}

function getTariffMeta(id) {
  return (priceConfig.tariffs || []).find((item) => item.id === id) || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Nie udało się zapisać stanu.", error);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return;

    Object.assign(state, parsed);
  } catch (error) {
    console.warn("Nie udało się odczytać stanu.", error);
  }
}

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

function validateState() {
  const validCommitment = ["12", "24"];
  const validBuilding = ["SFH", "MFH"];
  const validStatus = ["new", "current"];

  if (!validCommitment.includes(String(state.commitment)))
    state.commitment = "24";
  if (!validBuilding.includes(String(state.building))) state.building = "SFH";
  if (!validStatus.includes(String(state.status))) state.status = "new";

  const currentGroup =
    priceConfig?.base?.[state.commitment]?.[state.building] || {};
  if (!currentGroup[state.tariff]) {
    state.tariff = Object.keys(currentGroup)[0] || "1000/300";
  }

  const securityKeys = Object.keys(priceConfig?.addons?.security || {});
  if (!securityKeys.includes(state.security)) state.security = "none";

  const promoOptions =
    state.status === "new"
      ? ["none", "6za1", "ztr", "powrot"]
      : ["none", "retention"];

  if (!promoOptions.includes(state.promo)) state.promo = "none";

  const giftOptions =
    state.status === "current"
      ? ["none", "wifi12", "multiroom9", "router"]
      : ["none"];

  if (!giftOptions.includes(state.gift)) state.gift = "none";

  state.promoMonths = clamp(toNumber(state.promoMonths, 1), 1, 24);
  state.meshCount = Math.max(0, toNumber(state.meshCount, 0));
  state.multiroomCount = Math.max(0, toNumber(state.multiroomCount, 0));

  if (!["self", "tech"].includes(state.meshInstall)) state.meshInstall = "self";
  if (!["self", "tech"].includes(state.multiroomInstall))
    state.multiroomInstall = "self";

  if (state.tariff === "2000/2000") {
    state.symmetric = false;
  }

  const tariffMeta = getTariffMeta(state.tariff);
  if (tariffMeta && tariffMeta.wifi === false) {
    state.meshCount = 0;
    state.meshInstall = "self";
  }

  if (state.status === "new") {
    state.gift = "none";
  }

  if (state.bannerPromo && state.promo === "none" && state.gift === "none") {
    state.bannerPromo = false;
  }
}

function renderTariffs() {
  const container = byId("tariff-grid");
  const noteEl = byId("tariff-note");
  if (!container) return;

  const currentGroup =
    priceConfig?.base?.[state.commitment]?.[state.building] || {};
  const validTariffs = (priceConfig.tariffs || []).filter(
    (item) => currentGroup[item.id] !== undefined,
  );

  container.innerHTML = validTariffs
    .map((item) => {
      const checked = item.id === state.tariff ? "checked" : "";
      const pill = item.includedSym
        ? '<span class="pill success">symetryczne w cenie</span>'
        : "";

      return `
      <label class="choice">
        <input type="radio" name="tariff" value="${item.id}" ${checked}>
        <span class="card">
          <strong>${item.label}</strong>
          <small>${item.note || ""}</small>
          ${pill}
        </span>
      </label>
    `;
    })
    .join("");

  qsa('input[name="tariff"]', container).forEach((input) => {
    input.addEventListener("change", () => {
      state.tariff = input.value;
      const meta = getTariffMeta(state.tariff);
      if (state.tariff === "2000/2000") {
        state.symmetric = false;
      }
      if (meta && meta.wifi === false) {
        state.meshCount = 0;
        state.meshInstall = "self";
      }
      render();
    });
  });

  if (noteEl) {
    const meta = getTariffMeta(state.tariff);
    if (meta?.tech) {
      noteEl.style.display = "block";
      noteEl.textContent = `Info tech: ${meta.tech}`;
    } else {
      noteEl.style.display = "none";
      noteEl.textContent = "";
    }
  }
}

function renderPromoControls() {
  const promoSelect = byId("promo");
  const giftSelect = byId("gift");
  const promoMonthsWrap = byId("promo-months-wrap");
  const promoMonthsInput = byId("promo-months");
  const promoMonthsLabel = byId("promo-months-label");
  const promoNote = byId("promo-note");
  const giftNote = byId("gift-note");
  const banner = byId("banner-promo");
  const bannerNote = byId("banner-note");

  if (promoSelect) {
    promoSelect.innerHTML =
      state.status === "new"
        ? `
          <option value="none">Brak promocji głównej</option>
          <option value="6za1">6 za 1 / 3 za 1</option>
          <option value="ztr">ZTR 2026</option>
          <option value="powrot">Powrót do Multiplay</option>
        `
        : `
          <option value="none">Brak promocji głównej</option>
          <option value="retention">Promocja Utrzymaniowa</option>
        `;
    promoSelect.value = state.promo;
  }

  if (giftSelect) {
    giftSelect.innerHTML =
      state.status === "current"
        ? `
          <option value="none">Brak dodatkowego benefitu</option>
          <option value="wifi12">WiFi Premium za 1 zł przez 12 mies.</option>
          <option value="multiroom9">Multiroom: 1 dekoder za 1 zł przez 9 mies.</option>
          <option value="router">Wymiana routera</option>
        `
        : `
          <option value="none">Brak dodatkowego benefitu</option>
        `;
    giftSelect.value = state.gift;
    giftSelect.disabled = state.status !== "current";
  }

  const showPromoMonths = ["ztr", "powrot", "retention"].includes(state.promo);
  if (promoMonthsWrap)
    promoMonthsWrap.style.display = showPromoMonths ? "block" : "none";
  if (promoMonthsInput) promoMonthsInput.value = String(state.promoMonths);
  if (promoMonthsLabel) {
    promoMonthsLabel.textContent =
      state.promo === "retention"
        ? "Ilość miesięcy promocyjnych (do 1zł):"
        : "Pozostałe miesiące u obecnego operatora:";
  }

  if (promoNote) {
    let text = "Brak promocji głównej.";
    if (state.promo === "6za1")
      text =
        state.commitment === "24" ? "6 mies. za 1 zł." : "3 mies. za 1 zł.";
    if (state.promo === "ztr")
      text = `ZTR 2026: ${Math.min(state.promoMonths, 12)} mies. za 1 zł.`;
    if (state.promo === "powrot")
      text = `Powrót do Multiplay: ${Math.min(state.promoMonths + 3, 24)} mies. za 1 zł + instalacja za 1 zł.`;
    if (state.promo === "retention")
      text = `Promocja Utrzymaniowa: ${state.promoMonths} mies. do 1 zł.`;
    promoNote.style.display = "block";
    promoNote.textContent = text;
  }

  if (giftNote) {
    if (state.status !== "current") {
      giftNote.textContent =
        "Benefity odnowieniowe są przeznaczone dla obecnych klientów i mogą wymagać dodatkowego potwierdzenia w systemie.";
    } else if (state.gift === "wifi12") {
      giftNote.textContent =
        "Benefit: WiFi Premium za 1 zł przez 12 mies. dla wybranych urządzeń MESH.";
    } else if (state.gift === "multiroom9") {
      giftNote.textContent =
        "Benefit: opłata za 1 dekoder Multiroom spada do 1 zł / mies. przez 9 mies. Pozostałe dekodery są liczone standardowo.";
    } else if (state.gift === "router") {
      giftNote.textContent =
        "Benefit: wymiana routera. To benefit pozacenowy — nie zmienia miesięcznego abonamentu.";
    } else {
      giftNote.textContent =
        "Benefity odnowieniowe są przeznaczone dla obecnych klientów i mogą wymagać dodatkowego potwierdzenia w systemie.";
    }
  }

  const bannerAllowed = state.promo !== "none" || state.gift !== "none";
  if (banner) {
    banner.disabled = !bannerAllowed;
    if (!bannerAllowed) banner.checked = false;
    else banner.checked = !!state.bannerPromo;
  }

  if (bannerNote) {
    bannerNote.textContent = bannerAllowed
      ? "Banerowa doda 1 dodatkowy miesiąc abonamentu za 1 zł po zakończeniu promocji głównej lub jako dodatek do aktywnego benefitu."
      : "Aby aktywować Banerową, wybierz najpierw promocję główną albo benefit.";
  }
}

function syncControls() {
  qsa('input[name="commitment"]').forEach((input) => {
    input.checked = input.value === state.commitment;
  });

  qsa('input[name="building"]').forEach((input) => {
    input.checked = input.value === state.building;
  });

  qsa('input[name="status"]').forEach((input) => {
    input.checked = input.value === state.status;
  });

  const ebill = byId("consent-ebill");
  const marketing = byId("consent-marketing");
  const symmetric = byId("addon-sym");
  const internetPlus = byId("addon-internetplus");
  const phone = byId("addon-phone");
  const meshInstall = byId("mesh-install");
  const security = byId("security");
  const multiroomInstall = byId("multiroom-install");

  if (ebill) ebill.checked = !!state.ebill;
  if (marketing) marketing.checked = !!state.marketing;
  if (symmetric) {
    symmetric.checked = !!state.symmetric;
    symmetric.disabled = state.tariff === "2000/2000";
  }
  if (internetPlus) internetPlus.checked = !!state.internetPlus;
  if (phone) phone.checked = !!state.phone;
  if (meshInstall) meshInstall.value = state.meshInstall;
  if (security) security.value = state.security;
  if (multiroomInstall) multiroomInstall.value = state.multiroomInstall;

  const tvMap = [
    ["tv-max", "tvMax"],
    ["tv-cplus-sport", "tvCplusSport"],
    ["tv-cplus-films", "tvCplusFilms"],
    ["tv-pvr-m", "tvPvrM"],
    ["tv-pvr-l", "tvPvrL"],
  ];

  tvMap.forEach(([id, key]) => {
    const el = byId(id);
    if (el) el.checked = !!state[key];
  });

  const meshCount = byId("mesh-count");
  const meshLabel = byId("mesh-label");
  const multiroomCount = byId("multiroom-count");
  const multiroomLabel = byId("multiroom-label");
  const meshNote = byId("mesh-note");
  const meshMinus = byId("mesh-minus");
  const meshPlus = byId("mesh-plus");

  if (meshCount) meshCount.textContent = String(state.meshCount);
  if (meshLabel) meshLabel.textContent = `${state.meshCount} szt.`;
  if (multiroomCount) multiroomCount.textContent = String(state.multiroomCount);
  if (multiroomLabel)
    multiroomLabel.textContent = `${state.multiroomCount} szt.`;

  const tariffMeta = getTariffMeta(state.tariff);
  const meshAllowed = tariffMeta ? tariffMeta.wifi !== false : true;
  if (meshNote) meshNote.style.display = meshAllowed ? "none" : "block";
  if (meshMinus) meshMinus.disabled = !meshAllowed;
  if (meshPlus) meshPlus.disabled = !meshAllowed;

  const symLabel = byId("sym-label");
  const symPill = byId("sym-pill");
  if (symLabel) {
    symLabel.textContent =
      state.tariff === "2000/2000"
        ? "w cenie"
        : state.status === "current"
          ? "5 zł / mies."
          : "10 zł / mies.";
  }
  if (symPill) {
    if (state.tariff === "2000/2000") {
      symPill.textContent = "symetryczne w cenie";
      symPill.className = "pill success";
    } else if (state.status === "current") {
      symPill.textContent = "dla obecnych";
      symPill.className = "pill";
    } else {
      symPill.textContent = "opcjonalne";
      symPill.className = "pill";
    }
  }
}

function calculate() {
  const base =
    toNumber(
      priceConfig?.base?.[state.commitment]?.[state.building]?.[state.tariff],
      0,
    ) / 100;
  const afterIndefinite =
    toNumber(priceConfig?.indefinite?.[state.tariff], 0) / 100;
  const installationStandard =
    state.status === "new"
      ? toNumber(priceConfig?.installation?.[state.tariff], 0) / 100
      : 0;

  const consentPenalty =
    (!state.ebill ? getAddonPrice("consentEbill") : 0) +
    (!state.marketing ? getAddonPrice("consentMarketingDisplay") : 0);

  const symmetricMonthly =
    state.symmetric && state.tariff !== "2000/2000"
      ? state.status === "current"
        ? getAddonPrice("symmetricCurrentPreview")
        : getAddonPrice("symmetricNew")
      : 0;

  const internetPlusMonthly = state.internetPlus
    ? getAddonPrice("internetPlus")
    : 0;
  const phoneMonthly = state.phone ? getAddonPrice("phoneNoLimit") : 0;
  const securityMonthly = getSecurityPrice(state.security);
  const tvMonthly =
    (state.tvMax ? getAddonPrice("tvMax") : 0) +
    (state.tvCplusSport ? getAddonPrice("cplusSport") : 0) +
    (state.tvCplusFilms ? getAddonPrice("cplusFilms") : 0) +
    (state.tvPvrM ? getAddonPrice("pvrM") : 0) +
    (state.tvPvrL ? getAddonPrice("pvrL") : 0);

  const meshMonthlyUnit = getAddonPrice("wifiMonthly");
  const meshMonthly = state.meshCount * meshMonthlyUnit;
  const multiroomMonthlyUnit = getAddonPrice("multiroomMonthly");
  const multiroomMonthly = state.multiroomCount * multiroomMonthlyUnit;

  const normalMonthly = Number(
    (
      base +
      consentPenalty +
      symmetricMonthly +
      internetPlusMonthly +
      phoneMonthly +
      securityMonthly +
      tvMonthly +
      meshMonthly +
      multiroomMonthly
    ).toFixed(2),
  );

  const meshActivation = state.meshCount * getAddonPrice("wifiActivation");
  const multiroomActivation =
    state.multiroomCount * getAddonPrice("multiroomActivation");
  const meshTech =
    state.meshCount > 0 && state.meshInstall === "tech"
      ? getAddonPrice("techVisit")
      : 0;
  const multiroomTech =
    state.multiroomCount > 0 && state.multiroomInstall === "tech"
      ? getAddonPrice("techVisit")
      : 0;
  const tech = meshTech + multiroomTech;

  const commitmentMonths = toNumber(state.commitment, 24);
  let installation = installationStandard;
  let promoMonths = 0;
  let promoLabel = "";
  let promoNote = "";
  let giftLabel = "";
  let giftNote = "";

  if (state.status === "new") {
    if (state.promo === "6za1") {
      promoMonths = state.commitment === "24" ? 6 : 3;
      promoLabel = state.commitment === "24" ? "6 za 1" : "3 za 1";
      promoNote = `Abonament za 1 zł przez ${promoMonths} mies.`;
    } else if (state.promo === "ztr") {
      promoMonths = Math.min(commitmentMonths, Math.min(state.promoMonths, 12));
      promoLabel = "ZTR 2026";
      promoNote = `Abonament za 1 zł przez ${promoMonths} mies.`;
    } else if (state.promo === "powrot") {
      promoMonths = Math.min(
        commitmentMonths,
        Math.min(state.promoMonths + 3, 24),
      );
      promoLabel = "Powrót do Multiplay";
      promoNote = `Abonament za 1 zł przez ${promoMonths} mies. + instalacja za 1 zł.`;
      installation = 1;
    }
  } else {
    if (state.promo === "retention") {
      promoMonths = Math.min(commitmentMonths, state.promoMonths);
      promoLabel = "Promocja Utrzymaniowa";
      promoNote = `Rabat do 1 zł przez ${promoMonths} mies.`;
    }

    if (state.gift === "wifi12" && state.meshCount > 0) {
      giftLabel = "WiFi Premium 1 zł / 12 mies.";
      giftNote =
        "Dla urządzeń MESH opłata miesięczna spada do 1 zł / szt. przez 12 mies.";
    } else if (state.gift === "multiroom9" && state.multiroomCount > 0) {
      giftLabel = "Multiroom 1 zł / 9 mies.";
      giftNote =
        "Opłata za 1 dekoder Multiroom spada do 1 zł / mies. przez 9 mies. Pozostałe dekodery są liczone standardowo.";
    } else if (state.gift === "router") {
      giftLabel = "Wymiana routera";
      giftNote = "Benefit pozacenowy — bez wpływu na abonament miesięczny.";
    } else if (state.gift === "multiroom9") {
      giftLabel = "Multiroom 1 zł / 9 mies.";
      giftNote =
        "Benefit jest dostępny po dodaniu co najmniej 1 dekodera Multiroom.";
    }
  }

  const bannerMonths =
    state.bannerPromo && (state.promo !== "none" || state.gift !== "none")
      ? 1
      : 0;
  const totalPromoMonths = Math.min(
    commitmentMonths,
    promoMonths + bannerMonths,
  );

  const schedule = [];
  let totalCost = 0;

  for (let month = 1; month <= commitmentMonths; month += 1) {
    let monthPrice = normalMonthly;

    if (month <= totalPromoMonths) {
      monthPrice = 1;
    } else if (
      state.status === "current" &&
      state.gift === "wifi12" &&
      state.meshCount > 0 &&
      month <= 12
    ) {
      monthPrice = monthPrice - meshMonthly + state.meshCount;
    } else if (
      state.status === "current" &&
      state.gift === "multiroom9" &&
      state.multiroomCount > 0 &&
      month <= 9
    ) {
      monthPrice = monthPrice - multiroomMonthlyUnit + 1;
    }

    monthPrice = Number(monthPrice.toFixed(2));
    schedule.push(monthPrice);
    totalCost += monthPrice;
  }

  const groupedSchedule = [];
  if (schedule.length > 0) {
    let start = 1;
    let currentPrice = schedule[0];

    for (let i = 1; i < schedule.length; i += 1) {
      if (schedule[i] !== currentPrice) {
        groupedSchedule.push({ start, end: i, price: currentPrice });
        start = i + 1;
        currentPrice = schedule[i];
      }
    }

    groupedSchedule.push({ start, end: schedule.length, price: currentPrice });
  }

  const averageMonthly = Number((totalCost / commitmentMonths).toFixed(2));
  let savings = Number(
    (normalMonthly * commitmentMonths - totalCost).toFixed(2),
  );
  if (state.status === "new" && state.promo === "powrot") {
    savings += Number((installationStandard - installation).toFixed(2));
  }
  savings = Math.max(0, Number(savings.toFixed(2)));

  const badges = [];
  if (promoLabel) badges.push({ text: promoLabel, className: "pill success" });
  if (state.bannerPromo && bannerMonths > 0)
    badges.push({ text: "Promocja Banerowa", className: "pill" });
  if (giftLabel) badges.push({ text: giftLabel, className: "pill warning" });

  const notes = [];
  if (promoNote) notes.push(promoNote);
  if (giftNote) notes.push(giftNote);
  if (state.bannerPromo && bannerMonths > 0)
    notes.push("Dodatkowy 1 mies. abonamentu za 1 zł po promocji.");
  if (state.phone) {
    notes.push("Aktywny dodatek: Telefon NoLimit 9,99 zł / mies.");
  }
  if (
    state.symmetric &&
    state.status === "current" &&
    state.tariff !== "2000/2000"
  ) {
    notes.push(
      "Łącze symetryczne dla obecnego klienta liczone preview 5 zł / mies.",
    );
  }
  if (notes.length === 0) {
    notes.push("Brak dodatkowych uwag.");
  }

  return {
    base,
    afterIndefinite,
    consentPenalty,
    addonsMonthly:
      symmetricMonthly +
      internetPlusMonthly +
      phoneMonthly +
      securityMonthly +
      multiroomMonthly,
    tvMonthly,
    meshMonthly,
    installation,
    multiroomActivation,
    meshActivation,
    tech,
    monthly: normalMonthly,
    averageMonthly,
    groupedSchedule,
    savings,
    badges,
    notes,
  };
}

function renderSummary(calc) {
  setText("summary-monthly", money(calc.monthly));
  setText(
    "summary-start",
    money(
      calc.installation +
        calc.multiroomActivation +
        calc.meshActivation +
        calc.tech,
    ),
  );

  setText("sum-commitment", `${state.commitment} miesięcy`);
  setText(
    "sum-building",
    state.building === "SFH" ? "Domek (SFH)" : "Blok (MFH)",
  );
  setText(
    "sum-status",
    state.status === "new" ? "Nowy klient" : "Obecny klient",
  );
  setText("sum-tariff", state.tariff);
  setText("sum-base", money(calc.base));
  setText(
    "sum-consents",
    calc.consentPenalty > 0 ? `+ ${money(calc.consentPenalty)}` : "0,00 zł",
  );
  setText(
    "sum-addons",
    calc.addonsMonthly > 0 ? `+ ${money(calc.addonsMonthly)}` : "0,00 zł",
  );
  setText(
    "sum-tv",
    calc.tvMonthly > 0 ? `+ ${money(calc.tvMonthly)}` : "0,00 zł",
  );
  setText("sum-mesh-count", `${state.meshCount}x`);
  setText(
    "sum-mesh",
    calc.meshMonthly > 0 ? `+ ${money(calc.meshMonthly)}` : "0,00 zł",
  );
  setText("sum-installation", money(calc.installation));
  setText(
    "sum-activation",
    calc.multiroomActivation > 0
      ? `+ ${money(calc.multiroomActivation)}`
      : "0,00 zł",
  );
  setText(
    "sum-mesh-activation",
    calc.meshActivation > 0 ? `+ ${money(calc.meshActivation)}` : "0,00 zł",
  );
  setText("sum-tech", calc.tech > 0 ? `+ ${money(calc.tech)}` : "0,00 zł");

  setText("after-indefinite", `${money(calc.afterIndefinite)} / mies.`);
  setText("summary-note", calc.notes.join(" • "));
  setText("promo-average", `${money(calc.averageMonthly)} / mies.`);
  setText("promo-savings", money(calc.savings));

  setHTML(
    "summary-badges",
    calc.badges.length > 0
      ? calc.badges
          .map(
            (badge) => `<span class="${badge.className}">${badge.text}</span>`,
          )
          .join("")
      : '<span class="pill">Brak aktywnej promocji</span>',
  );

  setHTML(
    "promo-schedule",
    calc.groupedSchedule.length > 0
      ? calc.groupedSchedule
          .map((row) => {
            const range =
              row.start === row.end
                ? `${row.start}`
                : `${row.start}–${row.end}`;
            return `
            <div class="schedule-row">
              <span class="schedule-range">mies. ${range}</span>
              <strong class="schedule-price">${money(row.price)}</strong>
            </div>
          `;
          })
          .join("")
      : '<div class="schedule-row"><span class="schedule-range">brak aktywnej promocji abonamentowej</span><strong class="schedule-price">—</strong></div>',
  );
}

function render() {
  validateState();
  renderTariffs();
  renderPromoControls();
  syncControls();
  const calc = calculate();
  renderSummary(calc);
  saveState();
}

function bindStaticEvents() {
  qsa('input[name="commitment"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.commitment = input.value;
      render();
    });
  });

  qsa('input[name="building"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.building = input.value;
      render();
    });
  });

  qsa('input[name="status"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.status = input.value;
      render();
    });
  });

  const ebill = byId("consent-ebill");
  if (ebill) {
    ebill.addEventListener("change", () => {
      state.ebill = !!ebill.checked;
      render();
    });
  }

  const marketing = byId("consent-marketing");
  if (marketing) {
    marketing.addEventListener("change", () => {
      state.marketing = !!marketing.checked;
      render();
    });
  }

  const symmetric = byId("addon-sym");
  if (symmetric) {
    symmetric.addEventListener("change", () => {
      state.symmetric =
        state.tariff === "2000/2000" ? false : !!symmetric.checked;
      render();
    });
  }

  const internetPlus = byId("addon-internetplus");
  if (internetPlus) {
    internetPlus.addEventListener("change", () => {
      state.internetPlus = !!internetPlus.checked;
      render();
    });
  }

  const phone = byId("addon-phone");
  if (phone) {
    phone.addEventListener("change", () => {
      state.phone = !!phone.checked;
      render();
    });
  }

  const meshMinus = byId("mesh-minus");
  const meshPlus = byId("mesh-plus");
  const meshInstall = byId("mesh-install");

  if (meshMinus) {
    meshMinus.addEventListener("click", () => {
      state.meshCount = Math.max(0, state.meshCount - 1);
      render();
    });
  }

  if (meshPlus) {
    meshPlus.addEventListener("click", () => {
      const meta = getTariffMeta(state.tariff);
      if (meta && meta.wifi === false) return;
      state.meshCount += 1;
      render();
    });
  }

  if (meshInstall) {
    meshInstall.addEventListener("change", () => {
      state.meshInstall = meshInstall.value;
      render();
    });
  }

  const security = byId("security");
  if (security) {
    const handler = () => {
      state.security = security.value;
      render();
    };
    security.addEventListener("change", handler);
    security.addEventListener("input", handler);
  }

  const multiroomMinus = byId("multiroom-minus");
  const multiroomPlus = byId("multiroom-plus");
  const multiroomInstall = byId("multiroom-install");

  if (multiroomMinus) {
    multiroomMinus.addEventListener("click", () => {
      state.multiroomCount = Math.max(0, state.multiroomCount - 1);
      render();
    });
  }

  if (multiroomPlus) {
    multiroomPlus.addEventListener("click", () => {
      state.multiroomCount += 1;
      render();
    });
  }

  if (multiroomInstall) {
    multiroomInstall.addEventListener("change", () => {
      state.multiroomInstall = multiroomInstall.value;
      render();
    });
  }

  [
    ["tv-max", "tvMax"],
    ["tv-cplus-sport", "tvCplusSport"],
    ["tv-cplus-films", "tvCplusFilms"],
    ["tv-pvr-m", "tvPvrM"],
    ["tv-pvr-l", "tvPvrL"],
  ].forEach(([id, key]) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener("change", () => {
      state[key] = !!el.checked;
      render();
    });
  });

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
      state.promoMonths = clamp(toNumber(promoMonths.value, 1), 1, 24);
      render();
    };
    promoMonths.addEventListener("change", handler);
    promoMonths.addEventListener("input", handler);
  }

  const gift = byId("gift");
  if (gift) {
    gift.addEventListener("change", () => {
      state.gift = gift.value;
      render();
    });
  }

  const banner = byId("banner-promo");
  if (banner) {
    banner.addEventListener("change", () => {
      state.bannerPromo = !!banner.checked;
      render();
    });
  }
}

async function init() {
  loadState();
  await loadPriceConfig();
  bindStaticEvents();
  render();
}

document.addEventListener("DOMContentLoaded", init);
