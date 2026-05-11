import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { get, validateConfig } from "./client.js";
import { fetchAllPages } from "./utils/pagination.js";
import type { WalletRecord } from "./types/api.js";
import {
  BUDGET_CATEGORIES,
  TOTAL_MONTHLY_BUDGET,
  type BudgetCategory,
} from "../budget.config.js";
import { analyzeDailySpending, type DailyData, type SpendingCategory } from "./analyze.js";
import { sendPushNotification } from "./notify.js";

interface RecordsResponse {
  limit: number;
  offset: number;
  nextOffset?: number;
  records: WalletRecord[];
}

interface AccountsResponse {
  limit: number;
  offset: number;
  accounts: Array<{ id: string; archived: boolean; excludeFromStats: boolean }>;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDateRanges() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    yesterdayStr: formatDate(yesterday),
    monthStart: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    todayStr: formatDate(now),
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    dayOfMonth: now.getDate(),
    displayDate: yesterday.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchActiveAccountIds(): Promise<string[]> {
  const result = await get<AccountsResponse>("/v1/api/accounts", { limit: 100 });
  if (!result.ok) {
    console.error("[daily] Could not fetch accounts:", result.error.message);
    return [];
  }
  return result.data.accounts
    .filter((a) => !a.archived && !a.excludeFromStats)
    .map((a) => a.id);
}

async function fetchExpenses(dateFrom: string, dateTo: string): Promise<WalletRecord[]> {
  const accountIds = await fetchActiveAccountIds();
  const all: WalletRecord[] = [];

  for (const accountId of accountIds) {
    const records = await fetchAllPages<WalletRecord>(async (offset) => {
      const result = await get<RecordsResponse>("/v1/api/records", {
        accountId,
        recordDate: [`gte.${dateFrom}`, `lte.${dateTo}`],
        limit: 100,
        offset,
        sortBy: "-recordDate",
      });
      if (!result.ok) return { items: [] };
      return { items: result.data.records, nextOffset: result.data.nextOffset };
    });
    all.push(...records);
  }

  return all.filter((r) => r.recordType === "expense");
}

// ─── Budget grouping ──────────────────────────────────────────────────────────

function matchBudgetCategory(walletCategoryName: string): string {
  const lower = walletCategoryName.toLowerCase();
  for (const cat of BUDGET_CATEGORIES) {
    if (cat.walletCategories.some((wc) => lower.includes(wc.toLowerCase()))) {
      return cat.name;
    }
  }
  return "Other";
}

function groupExpenses(
  records: WalletRecord[],
): Map<string, { total: number; items: WalletRecord[] }> {
  const map = new Map<string, { total: number; items: WalletRecord[] }>();

  for (const cat of [...BUDGET_CATEGORIES, { name: "Other" } as BudgetCategory]) {
    map.set(cat.name, { total: 0, items: [] });
  }

  for (const r of records) {
    const budgetCat = matchBudgetCategory(r.category?.name ?? "");
    const entry = map.get(budgetCat)!;
    entry.total += Math.abs(r.amount.value);
    entry.items.push(r);
  }

  return map;
}

// ─── Data assembly ────────────────────────────────────────────────────────────

function buildDailyData(
  yesterdayRecords: WalletRecord[],
  monthRecords: WalletRecord[],
  dates: ReturnType<typeof getDateRanges>,
): DailyData {
  const yesterdayGroups = groupExpenses(yesterdayRecords);
  const monthGroups = groupExpenses(monthRecords);

  const categories: SpendingCategory[] = BUDGET_CATEGORIES.map((cat) => {
    const mtd = monthGroups.get(cat.name)?.total ?? 0;
    const yest = yesterdayGroups.get(cat.name)?.total ?? 0;
    return {
      name: cat.name,
      monthlyLimit: cat.monthlyLimit,
      monthToDate: Math.round(mtd * 100) / 100,
      yesterday: Math.round(yest * 100) / 100,
      percentUsed: Math.round((mtd / cat.monthlyLimit) * 10000) / 100,
    };
  });

  const totalYesterday =
    Math.round(
      yesterdayRecords.reduce((s, r) => s + Math.abs(r.amount.value), 0) * 100,
    ) / 100;

  const totalMonthToDate =
    Math.round(
      monthRecords.reduce((s, r) => s + Math.abs(r.amount.value), 0) * 100,
    ) / 100;

  const notableTransactions = yesterdayRecords
    .filter((r) => Math.abs(r.amount.value) >= 500)
    .map((r) => ({
      amount: Math.abs(r.amount.value),
      category: r.category?.name ?? "Unknown",
      description: r.note || r.payee || r.payer || "No description",
    }));

  return {
    date: dates.displayDate,
    daysInMonth: dates.daysInMonth,
    dayOfMonth: dates.dayOfMonth,
    categories,
    totalYesterday,
    totalMonthToDate,
    notableTransactions,
  };
}

// ─── Report saving ────────────────────────────────────────────────────────────

function saveReport(date: string, reportContent: string): void {
  const dir = process.env.REPORTS_DIR ?? "./reports";

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filepath = join(dir, `${date}.md`);
  const fullReport = `# Daily Budget Report — ${date}\n\n${reportContent}\n\n---\n*wallet-daily · ${new Date().toISOString()}*\n`;

  writeFileSync(filepath, fullReport, "utf-8");
  console.log(`[daily] Report saved → ${filepath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  validateConfig();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[daily] ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  const dates = getDateRanges();
  console.log(`[daily] Running for ${dates.displayDate} (yesterday)...`);

  const [yesterdayExpenses, monthExpenses] = await Promise.all([
    fetchExpenses(dates.yesterdayStr, dates.yesterdayStr),
    fetchExpenses(dates.monthStart, dates.todayStr),
  ]);

  console.log(
    `[daily] ${yesterdayExpenses.length} expense(s) yesterday · ${monthExpenses.length} this month`,
  );

  const data = buildDailyData(yesterdayExpenses, monthExpenses, dates);

  console.log("[daily] Analyzing with Claude...");
  const { notification, report } = await analyzeDailySpending(data);

  const monthPct = Math.round((dates.dayOfMonth / dates.daysInMonth) * 100);
  const isOverPace = data.categories.some(
    (c) => c.percentUsed > monthPct + 10,
  );

  await sendPushNotification({
    title: `Budget - ${dates.displayDate}`,
    message: notification,
    tags: ["moneybag"],
    priority: isOverPace ? "high" : "default",
  });

  saveReport(dates.yesterdayStr, report);
  console.log("[daily] Done ✓");
}

main().catch((err) => {
  console.error("[daily] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
