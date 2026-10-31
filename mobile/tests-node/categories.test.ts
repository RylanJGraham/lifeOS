// Run: node --experimental-strip-types --test tests-node/categories.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalCategory, categoryBreakdown, resolveBudgets } from "../src/lib/categories.ts";

test("short, long and messy names collapse to one category", () => {
  for (const raw of ["Food", "food", "Food & Dining", " FOOD & DINING ", "Groceries"]) assert.equal(canonicalCategory(raw), "Food & Dining");
  assert.equal(canonicalCategory("Shopping"), "Shopping & Goods");
  assert.equal(canonicalCategory("Health"), "Health & Fitness");
  assert.equal(canonicalCategory("Entertainment"), "Entertainment & Subscriptions");
});

test("unknown, empty and null go to Other", () => {
  for (const raw of [null, undefined, "", "  ", "Uncategorized", "zzz"]) assert.equal(canonicalCategory(raw as string | null), "Other");
});

test("breakdown merges Food and Food & Dining, counts only expenses, sorts by spend", () => {
  const { rows, total } = categoryBreakdown([
    { amount: -10, category: "Food" }, { amount: -5.5, category: "Food & Dining" }, { amount: -100, category: "Shopping" },
    { amount: 2000, category: "Income" }, { amount: 7, category: "Food & Dining" }, // positives are ignored (not spending)
    { amount: -3, category: "Income" },                                              // never counted as spending
    { amount: null, category: "Food" },
  ]);
  assert.deepEqual(rows.map((r) => [r.category, r.spent, r.count]), [["Shopping & Goods", 100, 1], ["Food & Dining", 15.5, 2]]);
  assert.equal(total, 115.5);
  assert.ok(Math.abs(rows.reduce((a, r) => a + r.share, 0) - 100) < 1e-9);
});

test("string amounts (numeric columns from the API) are handled", () => {
  const { rows } = categoryBreakdown([{ amount: "-12.50", category: "Food" }, { amount: "oops", category: "Food" }]);
  assert.deepEqual(rows.map((r) => [r.category, r.spent]), [["Food & Dining", 12.5]]);
});

test("no spending gives an empty breakdown without dividing by zero", () => {
  assert.deepEqual(categoryBreakdown([]), { rows: [], total: 0 });
});

test("budgets: shares of take-home by default, none without a base, saved budgets win (any spelling)", () => {
  assert.equal(resolveBudgets(3000)["Food & Dining"], 540);
  assert.deepEqual(resolveBudgets(0), {});
  assert.equal(resolveBudgets(3000, [{ category: "Food", monthly_limit: 400 }])["Food & Dining"], 400);
  assert.equal(resolveBudgets(0, [{ category: "Shopping", monthly_limit: 150 }])["Shopping & Goods"], 150);
});

test("rows carry their budget", () => {
  const { rows } = categoryBreakdown([{ amount: -50, category: "Food" }], resolveBudgets(1000));
  assert.equal(rows[0].budget, 180);
});

import { monthlyTakeHome } from "../src/lib/finance.ts";
const NOW = new Date(2026, 9, 31); // 31 Oct 2026

test("take-home: this month's income wins, then last month's", () => {
  assert.equal(monthlyTakeHome(32000, [{ transaction_date: "2026-10-27", amount: 2231.77, category: "Income" }], NOW), 2232);
  assert.equal(monthlyTakeHome(32000, [{ transaction_date: "2026-09-27", amount: 2100, category: "Income" }], NOW), 2100);
});

test("take-home: falls back to an annual salary / 12, or a small salary as monthly, or 0", () => {
  assert.equal(monthlyTakeHome(32000, [], NOW), 2667);
  assert.equal(monthlyTakeHome("2500", [], NOW), 2500);
  assert.equal(monthlyTakeHome(null, [], NOW), 0);
});

test("take-home: refunds and tiny credits are not income; other categories' positives are ignored", () => {
  const txs = [{ transaction_date: "2026-10-05", amount: 20, category: "Income" }, { transaction_date: "2026-10-06", amount: 900, category: "Shopping & Goods" }];
  assert.equal(monthlyTakeHome(32000, txs, NOW), 2667);
});
