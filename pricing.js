export const ITEMS = [
  { id: "donut", name: "Donut", unitPriceCents: 300, accent: "#b45309" },
  { id: "coffee", name: "Coffee", unitPriceCents: 300, accent: "#57534e" },
  { id: "water", name: "Water", unitPriceCents: 300, accent: "#2563eb" },
  { id: "soda", name: "Soda", unitPriceCents: 300, accent: "#be123c" }
];

export const DEAL_TYPES = {
  standard: "Standard combo",
  free: "Free",
  twoForOne: "2 for 1",
  threeForTwo: "3 for 2",
  custom: "Custom each"
};

const STANDARD_PAIR_PRICE_CENTS = 500;
const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function defaultQuantities() {
  return Object.fromEntries(ITEMS.map((item) => [item.id, 0]));
}

export function defaultItemDeals() {
  return Object.fromEntries(
    ITEMS.map((item) => [item.id, { type: "standard", customUnitPrice: "" }])
  );
}

export function formatMoney(cents) {
  return CURRENCY_FORMATTER.format((Number(cents) || 0) / 100);
}

export function moneyToCents(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/[$,\s]/g, "");
  if (normalized === "") {
    return 0;
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return NaN;
  }

  return Math.round(numericValue * 100);
}

export function optionalMoneyToCents(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return moneyToCents(value);
}

export function computeTransaction(input = {}) {
  const quantities = normalizeQuantities(input.quantities);
  const itemDeals = normalizeItemDeals(input.itemDeals);
  const directDonationCents = clampNonNegative(moneyToCents(input.directDonation));
  const tenderedCents = optionalMoneyToCents(input.tendered);
  const changeGivenCents = optionalMoneyToCents(input.changeGiven);
  const remainingQuantities = { ...quantities };
  const notes = [];
  const lineDetails = [];
  let specialSubtotalCents = 0;
  let grossCents = 0;
  let freeCoffeeQuantity = 0;

  for (const item of ITEMS) {
    grossCents += quantities[item.id] * item.unitPriceCents;
  }

  if (input.freeCoffeeWithDonut) {
    freeCoffeeQuantity = Math.min(remainingQuantities.coffee, quantities.donut);
    if (freeCoffeeQuantity > 0) {
      remainingQuantities.coffee -= freeCoffeeQuantity;
      notes.push(`Free coffee with donut: ${freeCoffeeQuantity} coffee comped`);
    }
  }

  const comboQuantities = defaultQuantities();

  for (const item of ITEMS) {
    const quantity = remainingQuantities[item.id];
    const deal = itemDeals[item.id];

    if (quantity <= 0) {
      continue;
    }

    if (deal.type === "free") {
      lineDetails.push({
        itemId: item.id,
        itemName: item.name,
        quantity,
        chargedQuantity: 0,
        amountCents: 0,
        note: `${item.name}: ${quantity} free`
      });
      notes.push(`${item.name}: ${quantity} free`);
      continue;
    }

    if (deal.type === "twoForOne") {
      const chargedQuantity = Math.ceil(quantity / 2);
      const amountCents = chargedQuantity * item.unitPriceCents;
      specialSubtotalCents += amountCents;
      lineDetails.push({
        itemId: item.id,
        itemName: item.name,
        quantity,
        chargedQuantity,
        amountCents,
        note: `${item.name}: ${quantity} sold as 2 for 1`
      });
      notes.push(`${item.name}: 2 for 1 applied`);
      continue;
    }

    if (deal.type === "threeForTwo") {
      const chargedQuantity = Math.floor(quantity / 3) * 2 + (quantity % 3);
      const amountCents = chargedQuantity * item.unitPriceCents;
      specialSubtotalCents += amountCents;
      lineDetails.push({
        itemId: item.id,
        itemName: item.name,
        quantity,
        chargedQuantity,
        amountCents,
        note: `${item.name}: ${quantity} sold as 3 for 2`
      });
      notes.push(`${item.name}: 3 for 2 applied`);
      continue;
    }

    if (deal.type === "custom") {
      const customUnitPriceCents = clampNonNegative(moneyToCents(deal.customUnitPrice));
      const amountCents = quantity * customUnitPriceCents;
      specialSubtotalCents += amountCents;
      lineDetails.push({
        itemId: item.id,
        itemName: item.name,
        quantity,
        chargedQuantity: quantity,
        amountCents,
        note: `${item.name}: ${formatMoney(customUnitPriceCents)} each`
      });
      notes.push(`${item.name}: ${formatMoney(customUnitPriceCents)} each`);
      continue;
    }

    comboQuantities[item.id] = quantity;
  }

  const comboQuantity = Object.values(comboQuantities).reduce((sum, quantity) => sum + quantity, 0);
  const comboPairs = Math.floor(comboQuantity / 2);
  const comboSingles = comboQuantity % 2;
  const comboSubtotalCents =
    comboPairs * STANDARD_PAIR_PRICE_CENTS + comboSingles * ITEMS[0].unitPriceCents;

  if (comboQuantity > 0) {
    notes.push(
      `Standard combo: ${comboPairs} pair${comboPairs === 1 ? "" : "s"} at $5` +
        (comboSingles ? " plus 1 single at $3" : "")
    );
  }

  const saleSubtotalCents = specialSubtotalCents + comboSubtotalCents;
  const markdownCents = grossCents - saleSubtotalCents;
  const totalOwedCents = saleSubtotalCents + directDonationCents;
  const validTenderedCents = Number.isFinite(tenderedCents) ? tenderedCents : null;
  const validChangeGivenCents = Number.isFinite(changeGivenCents) ? changeGivenCents : null;
  const recommendedChangeCents =
    validTenderedCents === null ? null : Math.max(0, validTenderedCents - totalOwedCents);
  const assumedChangeGivenCents =
    validTenderedCents === null
      ? null
      : validChangeGivenCents === null
        ? recommendedChangeCents
        : validChangeGivenCents;
  const changeDonationCents =
    validTenderedCents === null || assumedChangeGivenCents === null
      ? 0
      : Math.max(0, validTenderedCents - totalOwedCents - assumedChangeGivenCents);
  const cashKeptCents =
    validTenderedCents === null
      ? totalOwedCents
      : Math.max(0, validTenderedCents - Math.max(0, assumedChangeGivenCents));
  const underpaidCents = Math.max(0, totalOwedCents - cashKeptCents);
  const totalDonationCents = directDonationCents + changeDonationCents;
  const itemCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);

  return {
    quantities,
    itemDeals,
    itemCount,
    grossCents,
    saleSubtotalCents,
    directDonationCents,
    totalOwedCents,
    markdownCents,
    tenderedCents: validTenderedCents,
    recommendedChangeCents,
    changeGivenCents: validChangeGivenCents,
    assumedChangeGivenCents,
    changeDonationCents,
    totalDonationCents,
    cashKeptCents,
    underpaidCents,
    comboQuantity,
    comboPairs,
    comboSingles,
    freeCoffeeQuantity,
    lineDetails,
    notes
  };
}

export function summarizeTransactions(transactions = []) {
  const itemTotals = defaultQuantities();
  const totals = {
    transactionCount: 0,
    itemCount: 0,
    grossCents: 0,
    saleSubtotalCents: 0,
    directDonationCents: 0,
    changeDonationCents: 0,
    totalDonationCents: 0,
    markdownCents: 0,
    cashKeptCents: 0
  };

  for (const transaction of transactions) {
    if (transaction.voidedAt) {
      continue;
    }

    totals.transactionCount += 1;
    totals.itemCount += transaction.itemCount || 0;
    totals.grossCents += transaction.grossCents || 0;
    totals.saleSubtotalCents += transaction.saleSubtotalCents || 0;
    totals.directDonationCents += transaction.directDonationCents || 0;
    totals.changeDonationCents += transaction.changeDonationCents || 0;
    totals.totalDonationCents += transaction.totalDonationCents || 0;
    totals.markdownCents += transaction.markdownCents || 0;
    totals.cashKeptCents += transaction.cashKeptCents || 0;

    for (const item of ITEMS) {
      itemTotals[item.id] += transaction.quantities?.[item.id] || 0;
    }
  }

  return { totals, itemTotals };
}

function normalizeQuantities(quantities = {}) {
  return Object.fromEntries(
    ITEMS.map((item) => [
      item.id,
      Math.max(0, Math.floor(Number(quantities[item.id]) || 0))
    ])
  );
}

function normalizeItemDeals(itemDeals = {}) {
  return Object.fromEntries(
    ITEMS.map((item) => {
      const deal = itemDeals[item.id] || {};
      const type = Object.hasOwn(DEAL_TYPES, deal.type) ? deal.type : "standard";
      return [item.id, { type, customUnitPrice: deal.customUnitPrice ?? "" }];
    })
  );
}

function clampNonNegative(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}
