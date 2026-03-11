(function initCalculatorCore(globalScope) {
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

  function money(cents) {
    return `${(cents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
  }

  function toCentsTree(value, keyName = '') {
    const nonMonetaryKeys = new Set(['monthsForOne', 'minimumServiceMonths']);
    if (typeof value === 'number') {
      return nonMonetaryKeys.has(keyName) ? value : Math.round(value * 100);
    }
    if (Array.isArray(value)) return value.map((item) => toCentsTree(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toCentsTree(v, k)]));
    return value;
  }

  function normalizeConfig(config) {
    return { ...DEFAULT_CONFIG, ...(config || {}) };
  }

  function speedAllowed(config, speed) {
    const restricted = ['100/10', '350/35', '500/100'];
    if (!restricted.includes(speed)) return true;
    return !!config.technicalLimit;
  }

  function enforceRules(config) {
    const next = normalizeConfig(config);
    if (!speedAllowed(next, next.internetSpeed)) next.internetSpeed = '600/100';
    if (next.internetSpeed === '2000/2000') next.symmetricConnection = false;
    if (next.customerStatus !== 'existing') {
      next.promoAddonTo1 = false;
      next.promoMultiroomGift = false;
    }
    return next;
  }

  function getBaseSubscriptionPrice(prices, config) {
    return prices.basePackage[config.contractPeriod][config.buildingType][config.customerStatus][config.internetSpeed];
  }

  function getConsentAdjustments(prices, config) {
    let value = 0;
    const lines = [];
    if (!config.eInvoice) {
      value += prices.consents.eInvoicePenalty;
      lines.push({ label: 'Brak e-faktury', value: prices.consents.eInvoicePenalty, type: 'monthly' });
    }
    if (!config.marketing) {
      value += prices.consents.marketingPenalty;
      lines.push({ label: 'Brak zgody marketingowej', value: prices.consents.marketingPenalty, type: 'monthly' });
    }
    return { value, lines };
  }

  function getSymmetricPricing(prices, config) {
    if (!config.symmetricConnection) return { monthly: 0, lines: [], benefits: [], included: false };
    if (config.internetSpeed === '2000/2000') {
      return {
        monthly: 0,
        included: true,
        lines: [{ label: 'Łącze symetryczne (w cenie przy 2000/2000)', value: 0, type: 'monthly' }],
        benefits: [{ label: 'Łącze symetryczne w cenie taryfy 2000/2000', monthlySavings: prices.symmetricConnection.price, oneTimeSavings: 0 }],
      };
    }

    const discount = config.customerStatus === 'existing' ? prices.symmetricConnection.existingDiscount : 0;
    const monthly = prices.symmetricConnection.price - discount;
    const benefits = discount > 0
      ? [{ label: 'Rabat za obecnego klienta na łącze symetryczne', monthlySavings: discount, oneTimeSavings: 0 }]
      : [];
    return {
      monthly,
      included: false,
      lines: [{ label: 'Łącze symetryczne', value: monthly, type: 'monthly' }],
      benefits,
    };
  }

  function getTvPricing(prices, config) {
    const monthlyLines = [{ label: 'TV Multi (obowiązkowe)', value: prices.tvMulti, type: 'monthly' }];
    const addons = (config.tvAddons || []).map((key) => ({ label: prices.labels.tvAddons[key], value: prices.tvAddons[key], type: 'monthly' }));
    return { monthlyLines: [...monthlyLines, ...addons], benefits: [] };
  }

  function getMultiroomPricing(prices, config) {
    const count = Number(config.multiroomCount) || 0;
    if (count <= 0) return { monthlyLines: [], oneTimeLines: [], benefits: [], recurringSavings: 0, oneTimeSavings: 0 };

    const regularMonthlyUnit = prices.multiroom.monthly;
    const reducedMonthlyUnit = (config.customerStatus === 'existing' && config.promoAddonTo1) ? prices.promo.reducedAddonPrice : regularMonthlyUnit;

    let freeUnits = 0;
    if (config.customerStatus === 'existing' && config.promoMultiroomGift) freeUnits = 1;

    const chargeableUnits = Math.max(0, count - freeUnits);
    const monthlyValue = chargeableUnits * reducedMonthlyUnit;
    const activationValue = chargeableUnits * prices.multiroom.activation;

    const benefits = [];
    let recurringSavings = 0;
    let oneTimeSavings = 0;

    if (config.customerStatus === 'existing' && config.promoAddonTo1 && chargeableUnits > 0) {
      const unitSavings = regularMonthlyUnit - reducedMonthlyUnit;
      recurringSavings += chargeableUnits * unitSavings;
      benefits.push({
        label: 'Obniżenie Multiroom do 1 zł',
        monthlySavings: chargeableUnits * unitSavings,
        oneTimeSavings: 0,
      });
    }

    if (freeUnits > 0) {
      recurringSavings += regularMonthlyUnit;
      oneTimeSavings += prices.multiroom.activation;
      benefits.push({
        label: 'Multiroom w prezencie',
        monthlySavings: regularMonthlyUnit,
        oneTimeSavings: prices.multiroom.activation,
      });
    }

    const oneTimeLines = [{ label: `Aktywacja Multiroom (${count} szt.)`, value: activationValue, type: 'oneTime' }];
    if (config.multiroomAssistance) {
      oneTimeLines.push({
        label: 'Asysta technika (jednorazowo, niezależnie od liczby urządzeń)',
        value: prices.multiroom.technicianAssistance,
        type: 'oneTime',
      });
    }

    return {
      monthlyLines: [{ label: `Multiroom (${count} szt.)`, value: monthlyValue, type: 'monthly' }],
      oneTimeLines,
      benefits,
      recurringSavings,
      oneTimeSavings,
    };
  }

  function getWifiPremiumPricing(prices, config) {
    const count = Number(config.wifiCount) || 0;
    if (count <= 0) return { monthlyLines: [], oneTimeLines: [], benefits: [], recurringSavings: 0 };

    const regularMonthlyUnit = prices.wifiPremium.monthly;
    const reducedMonthlyUnit = (config.customerStatus === 'existing' && config.promoAddonTo1) ? prices.promo.reducedAddonPrice : regularMonthlyUnit;

    const monthlyValue = count * reducedMonthlyUnit;
    const activationValue = count * prices.wifiPremium.activation;

    const benefits = [];
    let recurringSavings = 0;

    if (config.customerStatus === 'existing' && config.promoAddonTo1) {
      const unitSavings = regularMonthlyUnit - reducedMonthlyUnit;
      recurringSavings = count * unitSavings;
      if (recurringSavings > 0) {
        benefits.push({
          label: 'Obniżenie WiFi Premium do 1 zł',
          monthlySavings: recurringSavings,
          oneTimeSavings: 0,
        });
      }
    }

    return {
      monthlyLines: [{ label: `WiFi Premium (MESH) (${count} szt.)`, value: monthlyValue, type: 'monthly' }],
      oneTimeLines: [{ label: `Aktywacja WiFi Premium (${count} szt.)`, value: activationValue, type: 'oneTime' }],
      benefits,
      recurringSavings,
    };
  }

  function getInternetPlusPricing(prices, config) {
    return config.internetPlus ? { monthlyLines: [{ label: 'Internet+', value: prices.internetPlus, type: 'monthly' }] } : { monthlyLines: [] };
  }

  function getCanalPricing(prices, config) {
    const lines = (config.canalPlus || []).map((key) => ({
      label: `${prices.labels.canalPlus[key]} (zobowiązanie 12 mies.)`,
      value: prices.canalPlus[key],
      type: 'monthly',
    }));
    return { monthlyLines: lines };
  }

  function getBitdefenderPricing(prices, config) {
    if (!config.bitdefender || config.bitdefender === 'none') return { monthlyLines: [] };
    return {
      monthlyLines: [{
        label: prices.labels.bitdefender[config.bitdefender],
        value: prices.bitdefender[config.bitdefender],
        type: 'monthly',
      }],
    };
  }

  function getPhonePricing(prices, config) {
    return config.phoneService ? { monthlyLines: [{ label: 'Telefon bez limitu Max', value: prices.phoneService, type: 'monthly' }] } : { monthlyLines: [] };
  }

  function getPromotionConfig(prices, config) {
    const key = config.mainPromotion;
    return prices.promotions[key] || prices.promotions.none;
  }

  function buildPromotionalSchedule(finalMonthlyPrice, promotionConfig) {
    if (!promotionConfig || !promotionConfig.monthlyForOneActive) return 'Brak promocji abonamentowej';
    const months = promotionConfig.monthsForOne;
    const promoPrice = promotionConfig.promoMonthlyPrice;
    return `${months} mies. po ${money(promoPrice)} + potem ${money(finalMonthlyPrice)}`;
  }

  function calculateAverageMonthlyValue(finalMonthlyPrice, promotionConfig, contractMonths) {
    const months = Number(contractMonths);
    if (!promotionConfig || !promotionConfig.monthlyForOneActive) return finalMonthlyPrice;
    const promoMonths = Math.min(months, promotionConfig.monthsForOne);
    const promoTotal = promoMonths * promotionConfig.promoMonthlyPrice;
    const regularTotal = (months - promoMonths) * finalMonthlyPrice;
    return Math.round((promoTotal + regularTotal) / months);
  }

  function calculatePromotionSavings({ finalMonthlyPrice, promotionConfig, contractMonths, recurringBenefitsSavings, oneTimeBenefitsSavings }) {
    const months = Number(contractMonths);
    let monthlySavings = 0;

    if (promotionConfig && promotionConfig.monthlyForOneActive) {
      const promoMonths = Math.min(months, promotionConfig.monthsForOne);
      monthlySavings += (finalMonthlyPrice - promotionConfig.promoMonthlyPrice) * promoMonths;
    }

    monthlySavings += recurringBenefitsSavings * months;

    const oneTimeSavings = oneTimeBenefitsSavings;
    const totalSavings = Math.max(0, monthlySavings + oneTimeSavings);

    return {
      monthlySavings: Math.max(0, monthlySavings),
      oneTimeSavings: Math.max(0, oneTimeSavings),
      totalSavings,
    };
  }

  function buildBenefitsBreakdown(benefits, contractMonths) {
    return benefits
      .filter((benefit) => benefit.monthlySavings > 0 || benefit.oneTimeSavings > 0)
      .map((benefit) => {
        const parts = [];
        if (benefit.monthlySavings > 0) parts.push(`-${money(benefit.monthlySavings)}/mies.`);
        if (benefit.oneTimeSavings > 0) parts.push(`-${money(benefit.oneTimeSavings)} jednorazowo`);
        return { label: benefit.label, text: parts.join(' oraz ') };
      });
  }

  function buildSummaryModel(rawConfig, rawPrices) {
    const prices = rawPrices;
    const config = enforceRules(normalizeConfig(rawConfig));

    const monthlyItems = [];
    const oneTimeItems = [];
    const benefits = [];

    const basePrice = getBaseSubscriptionPrice(prices, config);
    monthlyItems.push({ label: 'Abonament bazowy (internet + TV Multi + sprzęt + utrzymanie linii)', value: basePrice });

    const consent = getConsentAdjustments(prices, config);
    monthlyItems.push(...consent.lines.map((line) => ({ label: line.label, value: line.value })));

    const symmetric = getSymmetricPricing(prices, config);
    monthlyItems.push(...symmetric.lines.map((line) => ({ label: line.label, value: line.value })));
    benefits.push(...symmetric.benefits);

    const tv = getTvPricing(prices, config);
    monthlyItems.push(...tv.monthlyLines.map((line) => ({ label: line.label, value: line.value })));

    const multiroom = getMultiroomPricing(prices, config);
    monthlyItems.push(...multiroom.monthlyLines.map((line) => ({ label: line.label, value: line.value })));
    oneTimeItems.push(...multiroom.oneTimeLines.map((line) => ({ label: line.label, value: line.value })));
    benefits.push(...multiroom.benefits);

    const wifi = getWifiPremiumPricing(prices, config);
    monthlyItems.push(...wifi.monthlyLines.map((line) => ({ label: line.label, value: line.value })));
    oneTimeItems.push(...wifi.oneTimeLines.map((line) => ({ label: line.label, value: line.value })));
    benefits.push(...wifi.benefits);

    monthlyItems.push(...getInternetPlusPricing(prices, config).monthlyLines.map((line) => ({ label: line.label, value: line.value })));
    monthlyItems.push(...getCanalPricing(prices, config).monthlyLines.map((line) => ({ label: line.label, value: line.value })));
    monthlyItems.push(...getBitdefenderPricing(prices, config).monthlyLines.map((line) => ({ label: line.label, value: line.value })));
    monthlyItems.push(...getPhonePricing(prices, config).monthlyLines.map((line) => ({ label: line.label, value: line.value })));

    oneTimeItems.unshift({ label: 'Instalacja Internet + TV', value: prices.installation });

    const finalMonthlyPrice = monthlyItems.reduce((sum, item) => sum + item.value, 0);
    const finalOneTimePrice = oneTimeItems.reduce((sum, item) => sum + item.value, 0);

    const promotionConfig = getPromotionConfig(prices, config);
    const scheduleText = buildPromotionalSchedule(finalMonthlyPrice, promotionConfig);

    const recurringBenefitsSavings = multiroom.recurringSavings + wifi.recurringSavings;
    const oneTimeBenefitsSavings = multiroom.oneTimeSavings;

    if (promotionConfig.monthlyForOneActive) {
      benefits.push({
        label: `${promotionConfig.label}: miesiące za 1 zł`,
        monthlySavings: finalMonthlyPrice - promotionConfig.promoMonthlyPrice,
        oneTimeSavings: 0,
      });
    }

    const savings = calculatePromotionSavings({
      finalMonthlyPrice,
      promotionConfig,
      contractMonths: Number(config.contractPeriod),
      recurringBenefitsSavings,
      oneTimeBenefitsSavings,
    });

    const avgMonthly = calculateAverageMonthlyValue(finalMonthlyPrice, promotionConfig, Number(config.contractPeriod));

    return {
      config,
      monthlyItems,
      oneTimeItems,
      finalMonthlyPrice,
      finalOneTimePrice,
      scheduleText,
      avgMonthly,
      savings,
      benefitsBreakdown: buildBenefitsBreakdown(benefits, Number(config.contractPeriod)),
      promotionConfig,
    };
  }

  function buildCopySummaryText(model, prices) {
    const lines = [
      'Kalkulator GigaBOX 03.2026 GigaBox_3.1_MESH_10ZL',
      '',
      'Parametry oferty:',
      `- Okres: ${model.config.contractPeriod} miesięcy`,
      `- Budynek: ${model.config.buildingType === 'SFH' ? 'Domek (SFH)' : 'Blok (MFH)'}`,
      `- Status klienta: ${model.config.customerStatus === 'new' ? 'Nowy klient' : 'Obecny klient'}`,
      `- Taryfa internetowa: ${model.config.internetSpeed}`,
      `- E-faktura: ${model.config.eInvoice ? 'Tak' : 'Nie'}`,
      `- Zgoda marketingowa: ${model.config.marketing ? 'Tak' : 'Nie'}`,
      '',
      'Dodatki i usługi:',
      `- Multiroom: ${model.config.multiroomCount} szt.`,
      `- WiFi Premium (MESH): ${model.config.wifiCount} szt.`,
      `- Bitdefender: ${prices.labels.bitdefender[model.config.bitdefender] || 'Brak pakietu'}`,
      `- Telefon: ${model.config.phoneService ? 'Telefon bez limitu Max' : 'Brak'}`,
      `- Promocja główna: ${model.promotionConfig.label}`,
      '',
      'Pozycje miesięczne:',
      ...model.monthlyItems.map((item) => `- ${item.label}: ${money(item.value)}`),
      '',
      'Pozycje jednorazowe:',
      ...model.oneTimeItems.map((item) => `- ${item.label}: ${money(item.value)}`),
      '',
      'Aktywna promocja i benefity:',
      ...(model.benefitsBreakdown.length
        ? model.benefitsBreakdown.map((benefit) => `- ${benefit.label}: ${benefit.text}`)
        : ['- Brak aktywnych benefitów']),
      '',
      `Cena końcowa miesięcznie: ${money(model.finalMonthlyPrice)}`,
      `Koszt startowy: ${money(model.finalOneTimePrice)}`,
      `Uśredniona wartość abonamentu: ${money(model.avgMonthly)}`,
      `Abonament w okresach promocji: ${model.scheduleText}`,
      `Łączna oszczędność z promocji: ${money(model.savings.totalSavings)}`,
      '',
      'Uwagi ofertowe:',
      `- Minimalny okres świadczenia: ${prices.promoRules.minimumServiceMonths} pełne miesiące`,
      '- Zmiana na wyższy wariant: w dowolnym momencie',
      `- Zmiana na niższy wariant: po ${prices.promoRules.minimumServiceMonths} miesiącach`,
    ];

    return lines.join('\n');
  }

  const api = {
    DEFAULT_CONFIG,
    money,
    toCentsTree,
    normalizeConfig,
    speedAllowed,
    enforceRules,
    getBaseSubscriptionPrice,
    getConsentAdjustments,
    getSymmetricPricing,
    getTvPricing,
    getWifiPremiumPricing,
    getMultiroomPricing,
    getBitdefenderPricing,
    getPhonePricing,
    getPromotionConfig,
    buildPromotionalSchedule,
    calculateAverageMonthlyValue,
    calculatePromotionSavings,
    buildBenefitsBreakdown,
    buildSummaryModel,
    buildCopySummaryText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.CalculatorCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
