import {
  DEAL_TYPES,
  ITEMS,
  calculateMarginReport,
  computeTransaction,
  defaultItemDeals,
  defaultMarginSettings,
  defaultQuantities,
  defaultStandardPricing,
  formatMoney,
  summarizeTransactions
} from "./pricing.js";

const STORAGE_KEY = "asvaro-concessions-transactions-v1";
const SETTINGS_KEY = "asvaro-concessions-settings-v1";
const $ = (selector) => document.querySelector(selector);

const savedSettings = loadSettings();
const state = {
  quantities: defaultQuantities(),
  itemDeals: defaultItemDeals(),
  standardPricing: savedSettings.standardPricing || defaultStandardPricing(),
  marginSettings: mergeMarginSettings(savedSettings.marginSettings),
  freeCoffeeWithDonut: false,
  transactions: loadTransactions(),
  deferredInstallPrompt: null
};

const itemGrid = $("#itemGrid");
const markdownGrid = $("#markdownGrid");
const standardSingleInput = $("#standardSingleInput");
const standardPairInput = $("#standardPairInput");
const taxRateInput = $("#taxRateInput");
const taxModeSelect = $("#taxModeSelect");
const marginCostInputs = document.querySelectorAll("[data-margin-cost]");
const freeCoffeeToggle = $("#freeCoffeeToggle");
const directDonationInput = $("#directDonationInput");
const tenderedInput = $("#tenderedInput");
const changeGivenInput = $("#changeGivenInput");
const summaryList = $("#summaryList");
const pricingNotes = $("#pricingNotes");
const validationMessage = $("#validationMessage");
const recordButton = $("#recordButton");
const totalsGrid = $("#totalsGrid");
const marginSummaryGrid = $("#marginSummaryGrid");
const marginBreakdownBody = $("#marginBreakdownBody");
const itemTotalsBody = $("#itemTotalsBody");
const historyList = $("#historyList");
const offlineStatus = $("#offlineStatus");
const installButton = $("#installButton");

renderStaticControls();
bindEvents();
registerServiceWorker();
updateOnlineStatus();
render();

function renderStaticControls() {
  itemGrid.innerHTML = ITEMS.map(
    (item) => `
      <article class="item-control" style="--accent:${item.accent}">
        <div>
          <h3>${item.name}</h3>
          <p data-item-price-for="${item.id}">$3.00 standard</p>
        </div>
        <div class="stepper" aria-label="${item.name} quantity">
          <button type="button" data-quantity-action="decrement" data-item-id="${item.id}" aria-label="Remove ${item.name}">-</button>
          <output id="${item.id}Count">${state.quantities[item.id]}</output>
          <button type="button" data-quantity-action="increment" data-item-id="${item.id}" aria-label="Add ${item.name}">+</button>
        </div>
      </article>
    `
  ).join("");

  markdownGrid.innerHTML = ITEMS.map(
    (item) => `
      <div class="markdown-row">
        <label for="${item.id}Deal">${item.name}</label>
        <select id="${item.id}Deal" data-deal-for="${item.id}">
          ${Object.entries(DEAL_TYPES)
            .map(([value, label]) => `<option value="${value}">${label}</option>`)
            .join("")}
        </select>
        <input
          class="custom-price-input"
          data-custom-price-for="${item.id}"
          inputmode="decimal"
          min="0"
          step="0.01"
          type="number"
          placeholder="$ each"
          hidden
        >
      </div>
    `
  ).join("");
}

function bindEvents() {
  itemGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quantity-action]");
    if (!button) {
      return;
    }

    const itemId = button.dataset.itemId;
    const delta = button.dataset.quantityAction === "increment" ? 1 : -1;
    state.quantities[itemId] = Math.max(0, state.quantities[itemId] + delta);
    render();
  });

  markdownGrid.addEventListener("change", (event) => {
    const dealSelect = event.target.closest("[data-deal-for]");
    if (!dealSelect) {
      return;
    }

    const itemId = dealSelect.dataset.dealFor;
    state.itemDeals[itemId].type = dealSelect.value;
    render();
  });

  markdownGrid.addEventListener("input", (event) => {
    const customInput = event.target.closest("[data-custom-price-for]");
    if (!customInput) {
      return;
    }

    const itemId = customInput.dataset.customPriceFor;
    state.itemDeals[itemId].customUnitPrice = customInput.value;
    render();
  });

  freeCoffeeToggle.addEventListener("change", () => {
    state.freeCoffeeWithDonut = freeCoffeeToggle.checked;
    render();
  });

  [standardSingleInput, standardPairInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.standardPricing = {
        unitPrice: standardSingleInput.value,
        pairPrice: standardPairInput.value
      };
      saveSettings();
      render();
    });
  });

  taxRateInput.addEventListener("input", () => {
    state.marginSettings.taxRate = taxRateInput.value;
    saveSettings();
    renderReports();
  });

  taxModeSelect.addEventListener("change", () => {
    state.marginSettings.taxMode = taxModeSelect.value;
    saveSettings();
    renderReports();
  });

  marginCostInputs.forEach((input) => {
    input.addEventListener("input", () => {
      state.marginSettings.costs[input.dataset.marginCost] = input.value;
      saveSettings();
      renderReports();
    });
  });

  [directDonationInput, tenderedInput, changeGivenInput].forEach((input) => {
    input.addEventListener("input", render);
  });

  document.querySelector(".quick-cash").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const transaction = getCurrentTransaction();

    if (button.dataset.tender === "exact") {
      tenderedInput.value = centsToInputValue(transaction.totalOwedCents);
      changeGivenInput.value = "";
    } else if (button.dataset.tender) {
      tenderedInput.value = button.dataset.tender;
      changeGivenInput.value = "";
    }

    if (button.dataset.change === "recommended" && transaction.recommendedChangeCents !== null) {
      changeGivenInput.value = centsToInputValue(transaction.recommendedChangeCents);
    }

    if (button.dataset.change === "none") {
      changeGivenInput.value = "0.00";
    }

    render();
  });

  $("#clearSaleButton").addEventListener("click", clearCurrentSale);
  recordButton.addEventListener("click", recordTransaction);
  $("#exportCsvButton").addEventListener("click", exportCsv);
  $("#exportJsonButton").addEventListener("click", exportJson);
  $("#resetDayButton").addEventListener("click", resetDay);

  historyList.addEventListener("click", (event) => {
    const voidButton = event.target.closest("[data-void-id]");
    if (!voidButton) {
      return;
    }

    voidTransaction(voidButton.dataset.voidId);
  });

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) {
      return;
    }

    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}

function render() {
  standardSingleInput.value = state.standardPricing.unitPrice;
  standardPairInput.value = state.standardPricing.pairPrice;
  const transaction = getCurrentTransaction();

  for (const item of ITEMS) {
    $(`#${item.id}Count`).textContent = state.quantities[item.id];
    $(`[data-item-price-for="${item.id}"]`).textContent =
      `${formatMoney(transaction.standardPricing.unitPriceCents)} standard`;

    const select = $(`[data-deal-for="${item.id}"]`);
    const customPriceInput = $(`[data-custom-price-for="${item.id}"]`);
    select.value = state.itemDeals[item.id].type;
    customPriceInput.value = state.itemDeals[item.id].customUnitPrice;
    customPriceInput.hidden = state.itemDeals[item.id].type !== "custom";
  }

  freeCoffeeToggle.checked = state.freeCoffeeWithDonut;
  renderSummary(transaction);
  renderReports();
}

function renderSummary(transaction) {
  const summaryRows = [
    ["Items at list price", formatMoney(transaction.grossCents)],
    ["Markdowns", formatMoney(transaction.markdownCents)],
    ["Sale subtotal", formatMoney(transaction.saleSubtotalCents)],
    ["Direct donation", formatMoney(transaction.directDonationCents)],
    ["Amount owed", formatMoney(transaction.totalOwedCents)],
    [
      "Recommended change",
      transaction.recommendedChangeCents === null
        ? "Enter amount paid"
        : formatMoney(transaction.recommendedChangeCents)
    ],
    ["Change kept as donation", formatMoney(transaction.changeDonationCents)],
    ["Total donations", formatMoney(transaction.totalDonationCents)],
    ["Cash kept", formatMoney(transaction.cashKeptCents)]
  ];

  summaryList.innerHTML = summaryRows
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  pricingNotes.innerHTML = transaction.notes.length
    ? transaction.notes.map((note) => `<p>${note}</p>`).join("")
    : "<p>No items selected.</p>";

  const validation = getValidationMessage(transaction);
  validationMessage.hidden = !validation;
  validationMessage.textContent = validation;
  recordButton.disabled = Boolean(validation);
}

function renderReports() {
  const { totals, itemTotals } = summarizeTransactions(state.transactions);
  const activeTransactions = state.transactions.filter((transaction) => !transaction.voidedAt);
  const voidedTransactions = state.transactions.length - activeTransactions.length;
  const marginReport = calculateMarginReport(state.transactions, state.marginSettings);

  totalsGrid.innerHTML = [
    ["Sales", formatMoney(totals.saleSubtotalCents)],
    ["Donations", formatMoney(totals.totalDonationCents)],
    ["Cash expected", formatMoney(totals.cashKeptCents)],
    ["Markdowns", formatMoney(totals.markdownCents)],
    ["Transactions", String(totals.transactionCount)],
    ["Voided", String(voidedTransactions)]
  ]
    .map(
      ([label, value]) => `
        <article class="total-tile">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  renderMarginReport(marginReport);

  itemTotalsBody.innerHTML = ITEMS.map(
    (item) => `
      <tr>
        <td>${item.name}</td>
        <td class="numeric">${itemTotals[item.id]}</td>
        <td class="numeric">${formatMoney(itemTotals[item.id] * item.unitPriceCents)}</td>
      </tr>
    `
  ).join("");

  if (state.transactions.length === 0) {
    historyList.innerHTML = '<p class="empty-state">No transactions recorded yet.</p>';
    return;
  }

  historyList.innerHTML = state.transactions
    .slice()
    .reverse()
    .map(renderHistoryItem)
    .join("");
}

function renderMarginReport(marginReport) {
  taxRateInput.value = state.marginSettings.taxRate;
  taxModeSelect.value = state.marginSettings.taxMode;
  marginCostInputs.forEach((input) => {
    input.value = state.marginSettings.costs[input.dataset.marginCost] ?? "";
  });

  marginSummaryGrid.innerHTML = [
    ["Taxed item receipts", formatMoney(marginReport.grossReceiptsCents)],
    ["Net item sales", formatMoney(marginReport.netSalesCents)],
    ["Sales tax", formatMoney(marginReport.salesTaxCents)],
    ["Cost of goods", formatMoney(marginReport.totalCostCents)],
    ["Gross profit", formatMoney(marginReport.grossProfitCents)],
    ["Gross margin", `${marginReport.marginPercent.toFixed(1)}%`],
    ["Cash after tax/costs", formatMoney(marginReport.cashAfterTaxAndCostsCents)]
  ]
    .map(
      ([label, value]) => `
        <article class="margin-tile">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  marginBreakdownBody.innerHTML = marginReport.costRows
    .map(
      (row) => `
        <tr>
          <td>${row.label}</td>
          <td class="numeric">${row.quantity}</td>
          <td class="numeric">${formatMoney(row.unitCostCents)}</td>
          <td class="numeric">${formatMoney(row.totalCostCents)}</td>
        </tr>
      `
    )
    .join("");
}

function renderHistoryItem(transaction) {
  const time = new Date(transaction.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  const itemSummary = ITEMS
    .filter((item) => (transaction.quantities?.[item.id] || 0) > 0)
    .map((item) => `${transaction.quantities[item.id]} ${item.name}`)
    .join(", ");
  const noteSummary = transaction.notes?.length ? transaction.notes.join("; ") : "No pricing notes";
  const status = transaction.voidedAt ? `<span class="voided-label">Voided</span>` : "";

  return `
    <article class="history-item ${transaction.voidedAt ? "is-voided" : ""}">
      <div>
        <div class="history-title">
          <strong>${time}</strong>
          ${status}
        </div>
        <p>${itemSummary || "Donation only"}</p>
        <small>${noteSummary}</small>
      </div>
      <div class="history-money">
        <strong>${formatMoney(transaction.cashKeptCents)}</strong>
        <span>Sales ${formatMoney(transaction.saleSubtotalCents)} · Donations ${formatMoney(transaction.totalDonationCents)}</span>
        ${
          transaction.voidedAt
            ? ""
            : `<button class="secondary-button small-button" type="button" data-void-id="${transaction.id}">Void</button>`
        }
      </div>
    </article>
  `;
}

function getCurrentTransaction() {
  return computeTransaction({
    quantities: state.quantities,
    itemDeals: state.itemDeals,
    standardPricing: state.standardPricing,
    freeCoffeeWithDonut: state.freeCoffeeWithDonut,
    directDonation: directDonationInput.value,
    tendered: tenderedInput.value,
    changeGiven: changeGivenInput.value
  });
}

function getValidationMessage(transaction) {
  if (transaction.itemCount === 0 && transaction.directDonationCents === 0) {
    return "Add at least one item or a donation.";
  }

  if (standardSingleInput.value === "") {
    return "Enter a standard single-item price.";
  }

  if (standardPairInput.value === "") {
    return "Enter a standard two-item price.";
  }

  const customDealWithoutPrice = ITEMS.find(
    (item) =>
      state.quantities[item.id] > 0 &&
      state.itemDeals[item.id].type === "custom" &&
      state.itemDeals[item.id].customUnitPrice === ""
  );
  if (customDealWithoutPrice) {
    return `Enter a custom price for ${customDealWithoutPrice.name}.`;
  }

  if (transaction.tenderedCents !== null && transaction.tenderedCents < 0) {
    return "Amount paid cannot be negative.";
  }

  if (transaction.changeGivenCents !== null && transaction.changeGivenCents < 0) {
    return "Change given cannot be negative.";
  }

  if (
    transaction.tenderedCents !== null &&
    transaction.changeGivenCents !== null &&
    transaction.changeGivenCents > transaction.tenderedCents
  ) {
    return "Change given cannot be more than amount paid.";
  }

  if (transaction.underpaidCents > 0) {
    return `Payment is short by ${formatMoney(transaction.underpaidCents)}.`;
  }

  return "";
}

function recordTransaction() {
  const transaction = getCurrentTransaction();
  const validation = getValidationMessage(transaction);
  if (validation) {
    return;
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    freeCoffeeWithDonut: state.freeCoffeeWithDonut,
    ...transaction
  };

  state.transactions.push(record);
  saveTransactions();
  clearCurrentSale();
}

function clearCurrentSale() {
  state.quantities = defaultQuantities();
  state.itemDeals = defaultItemDeals();
  state.freeCoffeeWithDonut = false;
  directDonationInput.value = "";
  tenderedInput.value = "";
  changeGivenInput.value = "";
  render();
}

function voidTransaction(id) {
  const transaction = state.transactions.find((record) => record.id === id);
  if (!transaction || transaction.voidedAt) {
    return;
  }

  const confirmed = window.confirm("Void this transaction? It will stay in history but no longer count in totals.");
  if (!confirmed) {
    return;
  }

  transaction.voidedAt = new Date().toISOString();
  saveTransactions();
  render();
}

function resetDay() {
  if (state.transactions.length === 0) {
    return;
  }

  const confirmed = window.confirm("Clear all transactions for this device?");
  if (!confirmed) {
    return;
  }

  state.transactions = [];
  saveTransactions();
  render();
}

function exportCsv() {
  const header = [
    "created_at",
    "voided_at",
    ...ITEMS.map((item) => item.id),
    "sale_subtotal",
    "direct_donation",
    "change_donation",
    "total_donation",
    "markdowns",
    "tendered",
    "change_given",
    "cash_kept",
    "notes"
  ];
  const rows = state.transactions.map((transaction) => [
    transaction.createdAt,
    transaction.voidedAt || "",
    ...ITEMS.map((item) => transaction.quantities[item.id] || 0),
    centsToCsvValue(transaction.saleSubtotalCents),
    centsToCsvValue(transaction.directDonationCents),
    centsToCsvValue(transaction.changeDonationCents),
    centsToCsvValue(transaction.totalDonationCents),
    centsToCsvValue(transaction.markdownCents),
    transaction.tenderedCents === null ? "" : centsToCsvValue(transaction.tenderedCents),
    transaction.assumedChangeGivenCents === null
      ? ""
      : centsToCsvValue(transaction.assumedChangeGivenCents),
    centsToCsvValue(transaction.cashKeptCents),
    (transaction.notes || []).join("; ")
  ]);

  downloadFile(
    `asvaro-concessions-${dateStamp()}.csv`,
    [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"),
    "text/csv"
  );
}

function exportJson() {
  downloadFile(
    `asvaro-concessions-${dateStamp()}.json`,
    JSON.stringify(state.transactions, null, 2),
    "application/json"
  );
}

function loadTransactions() {
  try {
    const rawTransactions = localStorage.getItem(STORAGE_KEY);
    return rawTransactions ? JSON.parse(rawTransactions) : [];
  } catch {
    return [];
  }
}

function loadSettings() {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_KEY);
    return rawSettings ? JSON.parse(rawSettings) : {};
  } catch {
    return {};
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      standardPricing: state.standardPricing,
      marginSettings: state.marginSettings
    })
  );
}

function mergeMarginSettings(settings = {}) {
  const defaults = defaultMarginSettings();
  const taxMode = settings.taxMode === "added" ? "added" : defaults.taxMode;
  return {
    ...defaults,
    ...settings,
    taxMode,
    costs: {
      ...defaults.costs,
      ...(settings.costs || {})
    }
  };
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function centsToInputValue(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function centsToCsvValue(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function updateOnlineStatus() {
  const hasServiceWorker = "serviceWorker" in navigator;
  offlineStatus.textContent = navigator.onLine
    ? hasServiceWorker
      ? "Online · offline cache ready after first load"
      : "Online"
    : "Offline";
  offlineStatus.classList.toggle("is-offline", !navigator.onLine);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    updateOnlineStatus();
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
    updateOnlineStatus();
  } catch {
    offlineStatus.textContent = "Online · offline cache unavailable";
  }
}
