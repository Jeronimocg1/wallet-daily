// Weekly budget report — runs every Monday morning.
// Covers the previous Monday through Sunday (last full week).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateConfig } from "./client.js";
import { fetchExpenses, groupExpenses, formatDate } from "./data.js";
import { analyzeWeeklySpending } from "./analyze.js";
import { sendPushNotification } from "./notify.js";
import { BUDGET_CATEGORIES, TOTAL_MONTHLY_BUDGET } from "../budget.config.js";
import type { WalletRecord } from "./types/api.js";

function getWeekDates() {
  const now = new Date();
  // Last Monday
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - now.getDay() - 6);
  // Last Sunday
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    dateFrom: formatDate(lastMonday),
    dateTo: formatDate(lastSunday),
    label: `${lastMonday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${lastSunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
}

function saveReport(weekLabel: string, dateFrom: string, content: string) {
  const dir = process.env.REPORTS_DIR
    ? join(process.env.REPORTS_DIR, "..", "weekly")
    : "./reports/weekly";

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `${dateFrom}-week.md`;
  const filepath = join(dir, filename);
  const full = `# Weekly Budget Report — ${weekLabel}\n\n${content}\n\n---\n*wallet-daily · ${new Date().toISOString()}*\n`;

  writeFileSync(filepath, full, "utf-8");
  console.log(`[weekly] Report saved -> ${filepath}`);
}

async function main() {
  validateConfig();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[weekly] ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  const { dateFrom, dateTo, label } = getWeekDates();
  console.log(`[weekly] Running for week ${label}...`);

  const expenses = await fetchExpenses(dateFrom, dateTo);
  console.log(`[weekly] ${expenses.length} expense(s) for the week`);

  const groups = groupExpenses(expenses);

  const weeklyBudget = TOTAL_MONTHLY_BUDGET / 4.33;

  const categories = BUDGET_CATEGORIES.map((cat) => {
    const total = groups.get(cat.name)?.total ?? 0;
    const weeklyLimit = cat.monthlyLimit / 4.33;
    return {
      name: cat.name,
      weeklyLimit: Math.round(weeklyLimit * 100) / 100,
      monthlyLimit: cat.monthlyLimit,
      total: Math.round(total * 100) / 100,
      percentOfWeeklyLimit: Math.round((total / weeklyLimit) * 10000) / 100,
    };
  });

  const totalSpent = Math.round(
    expenses.reduce((s, r) => s + Math.abs(r.amount.value), 0) * 100,
  ) / 100;

  const topTransactions = expenses
    .sort((a, b) => Math.abs(b.amount.value) - Math.abs(a.amount.value))
    .slice(0, 5)
    .map((r) => ({
      amount: Math.round(Math.abs(r.amount.value) * 100) / 100,
      category: r.category?.name ?? "Unknown",
      description: r.note || r.payee || r.payer || "No description",
      date: r.recordDate.slice(0, 10),
    }));

  const data = {
    weekLabel: label,
    dateFrom,
    dateTo,
    categories,
    totalSpent,
    weeklyBudget: Math.round(weeklyBudget * 100) / 100,
    topTransactions,
  };

  console.log("[weekly] Analyzing with Claude...");
  const { notification, report } = await analyzeWeeklySpending(data);

  await sendPushNotification({
    title: "Weekly Budget - " + label,
    message: notification,
    tags: ["bar_chart"],
    priority: totalSpent > weeklyBudget * 1.1 ? "high" : "default",
  });

  saveReport(label, dateFrom, report);
  console.log("[weekly] Done.");
}

main().catch((err) => {
  console.error("[weekly] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
