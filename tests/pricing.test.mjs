import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMarginReport,
  computeTransaction,
  defaultItemDeals,
  defaultQuantities,
  summarizeTransactions
} from "../pricing.js";

test("standard combo charges singles at $3 and pairs at $5", () => {
  assert.equal(priceFor({ donut: 1 }), 300);
  assert.equal(priceFor({ donut: 2 }), 500);
  assert.equal(priceFor({ donut: 2, coffee: 1 }), 800);
  assert.equal(priceFor({ donut: 1, coffee: 1, water: 1, soda: 1 }), 1000);
});

test("standard combo pricing can be changed for markdowns", () => {
  const result = computeTransaction({
    quantities: { donut: 2, coffee: 1 },
    standardPricing: { unitPrice: "2.00", pairPrice: "3.00" }
  });

  assert.equal(result.saleSubtotalCents, 500);
  assert.equal(result.markdownCents, 400);
  assert.equal(result.standardPricing.unitPriceCents, 200);
  assert.equal(result.standardPricing.pairPriceCents, 300);
});

test("free coffee with donut comps one coffee per donut before combo pricing", () => {
  const result = computeTransaction({
    quantities: { donut: 1, coffee: 1 },
    freeCoffeeWithDonut: true
  });

  assert.equal(result.saleSubtotalCents, 300);
  assert.equal(result.markdownCents, 300);
  assert.equal(result.freeCoffeeQuantity, 1);
});

test("item markdowns can price one item separately from the standard combo", () => {
  const itemDeals = defaultItemDeals();
  itemDeals.donut = { type: "twoForOne", customUnitPrice: "" };

  const result = computeTransaction({
    quantities: { donut: 3, coffee: 1 },
    itemDeals
  });

  assert.equal(result.saleSubtotalCents, 900);
  assert.equal(result.markdownCents, 300);
});

test("three for two charges two units for each group of three", () => {
  const itemDeals = defaultItemDeals();
  itemDeals.donut = { type: "threeForTwo", customUnitPrice: "" };

  assert.equal(
    computeTransaction({ quantities: { donut: 3 }, itemDeals }).saleSubtotalCents,
    600
  );
  assert.equal(
    computeTransaction({ quantities: { donut: 4 }, itemDeals }).saleSubtotalCents,
    900
  );
});

test("custom and free markdowns preserve sold quantities", () => {
  const itemDeals = defaultItemDeals();
  itemDeals.water = { type: "custom", customUnitPrice: "1.50" };
  itemDeals.soda = { type: "free", customUnitPrice: "" };

  const result = computeTransaction({
    quantities: { water: 2, soda: 2 },
    itemDeals
  });

  assert.equal(result.saleSubtotalCents, 300);
  assert.equal(result.markdownCents, 900);
  assert.equal(result.quantities.water, 2);
  assert.equal(result.quantities.soda, 2);
});

test("direct donation and kept change both count as donations", () => {
  const result = computeTransaction({
    quantities: { donut: 2 },
    directDonation: "2",
    tendered: "10",
    changeGiven: "2"
  });

  assert.equal(result.saleSubtotalCents, 500);
  assert.equal(result.directDonationCents, 200);
  assert.equal(result.totalOwedCents, 700);
  assert.equal(result.recommendedChangeCents, 300);
  assert.equal(result.changeDonationCents, 100);
  assert.equal(result.totalDonationCents, 300);
  assert.equal(result.cashKeptCents, 800);
});

test("summary excludes voided transactions", () => {
  const active = {
    ...computeTransaction({ quantities: { donut: 2 }, directDonation: "1" }),
    id: "active"
  };
  const voided = {
    ...computeTransaction({ quantities: { coffee: 1 } }),
    id: "voided",
    voidedAt: new Date().toISOString()
  };

  const { totals, itemTotals } = summarizeTransactions([active, voided]);

  assert.equal(totals.transactionCount, 1);
  assert.equal(totals.saleSubtotalCents, 500);
  assert.equal(totals.totalDonationCents, 100);
  assert.equal(itemTotals.donut, 2);
  assert.equal(itemTotals.coffee, 0);
});

test("margin report handles tax included in item sales", () => {
  const transactions = [
    computeTransaction({
      quantities: { donut: 2, coffee: 1 },
      directDonation: "2"
    })
  ];

  const report = calculateMarginReport(transactions, {
    taxRate: "10",
    taxMode: "included",
    costs: {
      donut: "1.00",
      coffeeCup: "0.10",
      coffeeBeans: "0.40"
    }
  });

  assert.equal(report.taxableSalesCents, 800);
  assert.equal(report.salesTaxCents, 73);
  assert.equal(report.netSalesCents, 727);
  assert.equal(report.totalCostCents, 250);
  assert.equal(report.grossProfitCents, 477);
  assert.equal(report.cashAfterTaxAndCostsCents, 677);
  assert.equal(report.costRows.find((row) => row.id === "coffee").unitCostCents, 50);
});

test("margin report can estimate tax added on top of sales", () => {
  const transactions = [computeTransaction({ quantities: { donut: 2 } })];
  const report = calculateMarginReport(transactions, {
    taxRate: "10",
    taxMode: "added",
    costs: { donut: "1.00" }
  });

  assert.equal(report.taxableSalesCents, 500);
  assert.equal(report.salesTaxCents, 50);
  assert.equal(report.grossReceiptsCents, 550);
  assert.equal(report.netSalesCents, 500);
  assert.equal(report.totalCostCents, 200);
  assert.equal(report.grossProfitCents, 300);
});

function priceFor(quantities) {
  const normalized = { ...defaultQuantities(), ...quantities };
  return computeTransaction({ quantities: normalized }).saleSubtotalCents;
}
