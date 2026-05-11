// Shared data fetching and grouping utilities used by daily, weekly, monthly, and alert scripts.

import { get } from "./client.js";
import { fetchAllPages } from "./utils/pagination.js";
import type { WalletRecord } from "./types/api.js";
import { BUDGET_CATEGORIES, type BudgetCategory } from "../budget.config.js";

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

export function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchActiveAccountIds(): Promise<string[]> {
  const result = await get<AccountsResponse>("/v1/api/accounts", { limit: 100 });
  if (!result.ok) return [];
  return result.data.accounts
    .filter((a) => !a.archived && !a.excludeFromStats)
    .map((a) => a.id);
}

export async function fetchExpenses(dateFrom: string, dateTo: string): Promise<WalletRecord[]> {
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

export function matchBudgetCategory(walletCategoryName: string): string {
  const lower = walletCategoryName.toLowerCase();
  for (const cat of BUDGET_CATEGORIES) {
    if (cat.walletCategories.some((wc) => lower.includes(wc.toLowerCase()))) {
      return cat.name;
    }
  }
  return "Other";
}

export function groupExpenses(
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

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
