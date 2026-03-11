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

  const NON_MONEY_KEYS = new Set(['monthsForOne', 'minimumServiceMonths', 'monthlyForOneActive']);

  function money(cents) {
    return `${(cents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
  }

  function toCentsTree(value, keyName = '') {
    if (typeof value === 'number') return NON_MONEY_KEYS.has(keyName) ? value : Math.round(value * 100);
    if (Array.isArray(value)) return value.map((item) => toCentsTree(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toCentsTree(v, k)]));
    return value;
  }

  function normalizeConfig(config) {
    return { ...DEFAULT_CONFIG, ...(config || {}) };
  }

  function speedAllowed(config, speed) {
    return !['100/10', '350/35', '500/100'].includes(speed) || !!config.technicalLimit;
  }

  function enforceRules(inputConfig) {
    const config = normalizeConfig(inputConfig);

    if (!speedAllowed(config, config.internetSpeed)) config.internetSpeed = '600/100';
    if (config.customerStatus !== 'existing') {
      config.promoAddonTo1 = false;
      config.promoMultiroomGift = false;
    }

    return config;
  }

  function getBaseSubscriptionPrice(prices, config) {
    return prices.basePackage[config.contractPeriod][config.buildingType][config.customerStatus][config.internetSpeed];
  }

  function getConsentAdjustments(prices, config) {
    const lines = [];
    if (!config.eInvoice) lines.push({ label: 'Brak e-faktury', value: prices.consents.eInvoicePenalty });
    if (!config.marketing) lines.push({ label: 'Brak zgody marketingowej', value: prices.consents.marketingPenalty });
    return lines;
  }

  function getSymmetricPricing(prices, config) {
    const isIncludedByTariff = config.internetSpeed === '2000/2000';

    if (isIncludedByTariff) {
      return {
        monthlyLines: [],
        benefits: [{ label: 'Łącze symetryczne w cenie taryfy 2000/2000', monthlySavings: prices.symmetricConnection.price, oneTimeSavings: 0 }],
        uiState: { included: true, effectiveMonthly: 0 },
      };
    }

    if (!config.symmetricConnection) {
      return { monthlyLines: [], benefits: [], uiState: { included: false, effectiveMonthly: 0 } };
    }

    const discount = config.customerStatus === 'existing' ? prices.symmetricConnection.existingDiscount : 0;
    const effectiveMonthly = prices.symmetricConnection.price - discount;

    const benefits = discount > 0
      ? [{ label: 'Rabat za obecnego klienta na łącze symetryczne', monthlySavings: discount, oneTimeSavings: 0 }]
      : [];

    return {
      monthlyLines: [{ label: 'Łącze symetryczne', value: effectiveMonthly }],
      benefits,
      uiState: { included: false, effectiveMonthly },
    };
  }

  function getTvPricing(prices, config) {
  const addonLines = (config.tvAddons || []).map((key) => ({
    label: prices.labels.tvAddons[key],
    value: prices.tvAddons[key],
  }));
  return { monthlyLines: addonLines };
}

  function getMultiroomPricing(prices, config) {
    const count = Number(config.multiroomCount) || 0;
    if (count <= 0) return { monthlyLines: [], oneTimeLines: [], benefits: [], recurringSavingsPerMonth: 0, oneTimeSavings: 0 };

    const regularUnit = prices.multiroom.monthly;
    const reducedUnit = config.customerStatus === 'existing' && config.promoAddonTo1 ? prices.promo.reducedAddonPrice : regularUnit;

    const giftUnits = config.customerStatus === 'existing' && config.promoMultiroomGift ? 1 : 0;
    const paidUnits = Math.max(0, count - giftUnits);

    const monthlyValue = paidUnits * reducedUnit;
    const activationValue = paidUnits * prices.multiroom.activation;

    const benefits = [];
    let recurringSavingsPerMonth = 0;
    let oneTimeSavings = 0;

    if (config.customerStatus === 'existing' && config.promoAddonTo1 && paidUnits > 0) {
      const savings = (regularUnit - reducedUnit) * paidUnits;
      recurringSavingsPerMonth += savings;
      benefits.push({ label: 'Obniżenie Multiroom do 1 zł', monthlySavings: savings, oneTimeSavings: 0 });
    }

    if (giftUnits > 0) {
      recurringSavingsPerMonth += regularUnit;
      oneTimeSavings += prices.multiroom.activation;
      benefits.push({ label: 'Multiroom w prezencie', monthlySavings: regularUnit, oneTimeSavings: prices.multiroom.activation });
    }

    const oneTimeLines = [{ label: `Aktywacja Multiroom (${count} szt.)`, value: activationValue }];
    if (config.multiroomAssistance) {
      oneTimeLines.push({
        label: 'Asysta technika (jednorazowo, niezależnie od liczby urządzeń)',
        value: prices.multiroom.technicianAssistance,
      });
    }

    return {
      monthlyLines: [{ label: `Multiroom (${count} szt.)`, value: monthlyValue }],
      oneTimeLines,
      benefits,
      recurringSavingsPerMonth,
      oneTimeSavings,
    };
  }

  function getWifiPremiumPricing(prices, config) {
    const count = Number(config.wifiCount) || 0;
    if (count <= 0) return { monthlyLines: [], oneTimeLines: [], benefits: [], recurringSavingsPerMonth: 0 };

    const regularUnit = prices.wifiPremium.monthly;
    const reducedUnit = config.customerStatus === 'existing' && config.promoAddonTo1 ? prices.promo.reducedAddonPrice : regularUnit;
    const monthlyValue = count * reducedUnit;
    const activationValue = count * prices.wifiPremium.activation;

    const recurringSavingsPerMonth = count * (regularUnit - reducedUnit);
    const benefits = recurringSavingsPerMonth > 0
      ? [{ label: 'Obniżenie WiFi Premium do 1 zł', monthlySavings: recurringSavingsPerMonth, oneTimeSavings: 0 }]
      : [];

    return {
      monthlyLines: [{ label: `WiFi Premium (MESH) (${count} szt.)`, value: monthlyValue }],
      oneTimeLines: [{ label: `Aktywacja WiFi Premium (${count} szt.)`, value: activationValue }],
      benefits,
      recurringSavingsPerMonth,
    };
  }

  function getInternetPlusPricing(prices, config) {
    return config.internetPlus ? [{ label: 'Internet+', value: prices.internetPlus }] : [];
  }

  function getCanalPricing(prices, config) {
    return (config.canalPlus || []).map((key) => ({ label: `${prices.labels.canalPlus[key]} (zobowiązanie 12 mies.)`, value: prices.canalPlus[key] }));
  }

  function getBitdefenderPricing(prices, config) {
    if (!config.bitdefender || config.bitdefender === 'none') return [];
    return [{ label: prices.labels.bitdefender[config.bitdefender], value: prices.bitdefender[config.bitdefender] }];
  }

  function getPhonePricing(prices, config) {
    return config.phoneService ? [{ label: 'Telefon bez limitu Max', value: prices.phoneService }] : [];
  }

  function getPromotionConfig(prices, config) {
    return prices.promotions[config.mainPromotion] || prices.promotions.none;
  }

  function buildPromotionalSchedule(finalMonthlyPrice, promotionConfig, contractMonths) {
    if (!promotionConfig || !promotionConfig.monthlyForOneActive) return 'Brak promocji abonamentowej';
    const months = Math.min(contractMonths, promotionConfig.monthsForOne);
    return `${months} mies. po ${money(promotionConfig.promoMonthlyPrice)} + potem ${money(finalMonthlyPrice)}`;
  }

  function calculateAverageMonthlyValue(finalMonthlyPrice, promotionConfig, contractMonths) {
    const months = Number(contractMonths);
    if (!promotionConfig || !promotionConfig.monthlyForOneActive) return finalMonthlyPrice;
    const promoMonths = Math.min(months, promotionConfig.monthsForOne);
    const total = promoMonths * promotionConfig.promoMonthlyPrice + (months - promoMonths) * finalMonthlyPrice;
    return Math.round(total / months);
  }

  function calculatePromotionSavings({ finalMonthlyPrice, promotionConfig, contractMonths, recurringBenefitsSavingsPerMonth, oneTimeBenefitsSavings }) {
    const months = Number(contractMonths);
    let monthlySavings = 0;

    if (promotionConfig && promotionConfig.monthlyForOneActive) {
      const promoMonths = Math.min(months, promotionConfig.monthsForOne);
      monthlySavings += (finalMonthlyPrice - promotionConfig.promoMonthlyPrice) * promoMonths;
    }

    monthlySavings += recurringBenefitsSavingsPerMonth * months;

    const oneTimeSavings = Math.max(0, oneTimeBenefitsSavings);
    const totalSavings = Math.max(0, monthlySavings + oneTimeSavings);

    return {
      monthlySavings: Math.max(0, monthlySavings),
      oneTimeSavings,
      totalSavings,
    };
  }

  function buildBenefitsBreakdown(benefits) {
    return benefits
      .filter((item) => item.monthlySavings > 0 || item.oneTimeSavings > 0)
      .map((item) => {
        const parts = [];
        if (item.monthlySavings > 0) parts.push(`-${money(item.monthlySavings)}/mies.`);
        if (item.oneTimeSavings > 0) parts.push(`-${money(item.oneTimeSavings)} jednorazowo`);
        return { label: item.label, text: parts.join(' oraz ') };
      });
  }

  function buildSummaryModel(rawConfig, prices) {
    const config = enforceRules(rawConfig);
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

    monthlyItems.push({ label: 'Abonament bazowy internetu (sprzęt + utrzymanie linii)', value: getBaseSubscriptionPrice(prices, config) });
    monthlyItems.push(...getConsentAdjustments(prices, config));

    const symmetric = getSymmetricPricing(prices, config);
    monthlyItems.push(...symmetric.monthlyLines);
    benefits.push(...symmetric.benefits);

    monthlyItems.push(...getTvPricing(prices, config).monthlyLines);

    const multiroom = getMultiroomPricing(prices, config);
    monthlyItems.push(...multiroom.monthlyLines);
    oneTimeItems.push(...multiroom.oneTimeLines);
    benefits.push(...multiroom.benefits);

    const wifi = getWifiPremiumPricing(prices, config);
    monthlyItems.push(...wifi.monthlyLines);
    oneTimeItems.push(...wifi.oneTimeLines);
    benefits.push(...wifi.benefits);

    monthlyItems.push(...getInternetPlusPricing(prices, config));
    monthlyItems.push(...getCanalPricing(prices, config));
    monthlyItems.push(...getBitdefenderPricing(prices, config));
    monthlyItems.push(...getPhonePricing(prices, config));
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
    const contractMonths = Number(config.contractPeriod);

    const scheduleText = buildPromotionalSchedule(finalMonthlyPrice, promotionConfig, contractMonths);
    const recurringBenefitsSavingsPerMonth = multiroom.recurringSavingsPerMonth + wifi.recurringSavingsPerMonth;
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
      contractMonths,
      recurringBenefitsSavingsPerMonth,
      oneTimeBenefitsSavings,
    });

    const avgMonthly = calculateAverageMonthlyValue(finalMonthlyPrice, promotionConfig, contractMonths);

    return {
      config,
      monthlyItems,
      oneTimeItems,
      benefitsBreakdown: buildBenefitsBreakdown(benefits),
      finalMonthlyPrice,
      finalOneTimePrice,
      scheduleText,
      avgMonthly,
      savings,
      promotionConfig,
      symmetricState: symmetric.uiState,
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
      `- Ograniczenia techniczne: ${model.config.technicalLimit ? 'Tak' : 'Nie'}`,
      `- E-faktura: ${model.config.eInvoice ? 'Tak' : 'Nie'}`,
      `- Zgoda marketingowa: ${model.config.marketing ? 'Tak' : 'Nie'}`,
      `- Łącze symetryczne: ${model.symmetricState.included ? 'W cenie przy 2000/2000' : model.config.symmetricConnection ? 'Aktywne' : 'Nieaktywne'}`,
      '',
      'Usługi i dodatki:',
      `- Multiroom: ${model.config.multiroomCount} szt.`,
      `- Asysta technika: ${model.config.multiroomAssistance ? 'Tak' : 'Nie'}`,
      `- WiFi Premium (MESH): ${model.config.wifiCount} szt.`,
      `- Internet+: ${model.config.internetPlus ? 'Tak' : 'Nie'}`,
      `- Dodatki TV: ${(model.config.tvAddons || []).map((x) => prices.labels.tvAddons[x]).join(', ') || 'Brak'}`,
      `- Canal+: ${(model.config.canalPlus || []).map((x) => prices.labels.canalPlus[x]).join(', ') || 'Brak'}`,
      `- Bitdefender: ${prices.labels.bitdefender[model.config.bitdefender] || 'Brak pakietu'}`,
      `- Telefon: ${model.config.phoneService ? 'Telefon bez limitu Max' : 'Brak'}`,
      '',
      'Promocje:',
      `- Promocja główna: ${model.promotionConfig.label}`,
      `- Obniżenie Multiroom/WiFi do 1 zł: ${model.config.promoAddonTo1 ? 'Tak' : 'Nie'}`,
      `- Multiroom w prezencie: ${model.config.promoMultiroomGift ? 'Tak' : 'Nie'}`,
      '',
      'Aktywna promocja i benefity:',
      ...(model.benefitsBreakdown.length ? model.benefitsBreakdown.map((x) => `- ${x.label}: ${x.text}`) : ['- Brak aktywnych benefitów']),
      '',
      'Pozycje miesięczne:',
      ...model.monthlyItems.map((x) => `- ${x.label}: ${money(x.value)}`),
      '',
      'Pozycje jednorazowe:',
      ...model.oneTimeItems.map((x) => `- ${x.label}: ${money(x.value)}`),
      '',
      `Cena końcowa miesięcznie: ${money(model.finalMonthlyPrice)}`,
      `Koszt startowy: ${money(model.finalOneTimePrice)}`,
      `Uśredniona wartość abonamentu: ${money(model.avgMonthly)}`,
      `Abonament w okresach promocji: ${model.scheduleText}`,
      `Łączna oszczędność z promocji: ${money(model.savings.totalSavings)}`,
      '',
      `Minimalny okres świadczenia: ${prices.promoRules.minimumServiceMonths} pełne miesiące`,
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
    enforceRules,
    speedAllowed,
    speedAllowed,
    enforceRules,
    getBaseSubscriptionPrice,
    getConsentAdjustments,
    getSymmetricPricing,
    getTvPricing,
    getMultiroomPricing,
    getWifiPremiumPricing,
    getInternetPlusPricing,
    getCanalPricing,
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
