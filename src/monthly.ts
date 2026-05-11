// Monthly close report — runs on the 1st of each month.
// Covers the full previous month.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateConfig } from "./client.js";
import { fetchExpenses, groupExpenses, formatDate } from "./data.js";
import { analyzeMonthlySpending } from "./analyze.js";
import { sendPushNotification } from "./notify.js";
import { BUDGET_CATEGORIES, TOTAL_MONTHLY_BUDGET } from "../budget.config.js";

function getLastMonthDates() {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 1);
  const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);

  return {
    dateFrom: formatDate(firstOfPrevMonth),
    dateTo: formatDate(lastOfPrevMonth),
    monthName: firstOfPrevMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    monthKey: formatDate(firstOfPrevMonth).slice(0, 7),
    daysInMonth: lastOfPrevMonth.getDate(),
  };
}

function saveReport(monthName: string, monthKey: string, content: string) {
  const dir = process.env.REPORTS_DIR
    ? join(process.env.REPORTS_DIR, "..", "monthly")
    : "./reports/monthly";

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filepath = join(dir, `${monthKey}.md`);
  const full = `# Monthly Close Report — ${monthName}\n\n${content}\n\n---\n*wallet-daily · ${new Date().toISOString()}*\n`;

  writeFileSync(filepath, full, "utf-8");
  console.log(`[monthly] Report saved -> ${filepath}`);
}

async function main() {
  validateConfig();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[monthly] ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  const { dateFrom, dateTo, monthName, monthKey, daysInMonth } = getLastMonthDates();
  console.log(`[monthly] Running close report for ${monthName}...`);

  const expenses = await fetchExpenses(dateFrom, dateTo);
  console.log(`[monthly] ${expenses.length} expense(s) for ${monthName}`);

  const groups = groupExpenses(expenses);

  const categories = BUDGET_CATEGORIES.map((cat) => {
    const total = groups.get(cat.name)?.total ?? 0;
    return {
      name: cat.name,
      monthlyLimit: cat.monthlyLimit,
      total: Math.round(total * 100) / 100,
      percentUsed: Math.round((total / cat.monthlyLimit) * 10000) / 100,
      underOver: Math.round((cat.monthlyLimit - total) * 100) / 100,
    };
  });

  const totalSpent = Math.round(
    expenses.reduce((s, r) => s + Math.abs(r.amount.value), 0) * 100,
  ) / 100;

  const totalSaved = Math.round((TOTAL_MONTHLY_BUDGET - totalSpent) * 100) / 100;

  const topTransactions = expenses
    .sort((a, b) => Math.abs(b.amount.value) - Math.abs(a.amount.value))
    .slice(0, 10)
    .map((r) => ({
      amount: Math.round(Math.abs(r.amount.value) * 100) / 100,
      category: r.category?.name ?? "Unknown",
      description: r.note || r.payee || r.payer || "No description",
      date: r.recordDate.slice(0, 10),
    }));

  const data = {
    monthName,
    dateFrom,
    dateTo,
    daysInMonth,
    categories,
    totalSpent,
    totalBudget: TOTAL_MONTHLY_BUDGET,
    totalSaved,
    topTransactions,
    savingsTarget: 61_000,
  };

  console.log("[monthly] Analyzing with Claude...");
  const { notification, report } = await analyzeMonthlySpending(data);

  await sendPushNotification({
    title: monthName + " Close",
    message: notification,
    tags: ["calendar"],
    priority: totalSpent > TOTAL_MONTHLY_BUDGET ? "high" : "default",
  });

  saveReport(monthName, monthKey, report);
  console.log("[monthly] Done.");
}

main().catch((err) => {
  console.error("[monthly] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
