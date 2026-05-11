import Anthropic from "@anthropic-ai/sdk";
import { BUDGET_CATEGORIES, CURRENCY, TOTAL_MONTHLY_BUDGET } from "../budget.config.js";

const client = new Anthropic();

export interface SpendingCategory {
  name: string;
  monthlyLimit: number;
  monthToDate: number;
  yesterday: number;
  percentUsed: number;
}

export interface DailyData {
  date: string;
  daysInMonth: number;
  dayOfMonth: number;
  categories: SpendingCategory[];
  totalYesterday: number;
  totalMonthToDate: number;
  notableTransactions: Array<{
    amount: number;
    category: string;
    description: string;
  }>;
}

const SYSTEM_PROMPT = `You are a concise personal finance assistant for a Mexican professional tracking monthly budget goals.

Budget configuration:
- Currency: ${CURRENCY}
- Total monthly budget: $${TOTAL_MONTHLY_BUDGET.toLocaleString()}
- Long-term goal: reach MXN $1,000,000 net worth by December 31, 2026

Monthly category limits:
${BUDGET_CATEGORIES.map((c) => `  • ${c.name}: $${c.monthlyLimit.toLocaleString()}`).join("\n")}

Your task: analyze the provided daily spending JSON and produce two outputs.

OUTPUT FORMAT — respond ONLY with valid JSON (no markdown fences):
{
  "notification": "push notification text (max 5 lines, plain text, emoji OK)",
  "report": "markdown report content (tables, analysis)"
}

Notification rules:
- Line 1: date + total spent yesterday (e.g. "May 10 · $432 spent")
- Lines 2-4: only categories with spend > $0 (e.g. "Software $321 · Restaurants $109")
- Last line: month status (e.g. "Month: 22% budget used, 35% of days gone ✓")
- Flag ⚠ if any category % used > % of month elapsed + 10 points
- Keep each line under 200 chars

Report rules:
- Markdown table: Category | Yesterday | Month-to-date | Limit | % Used | Status
- Status: ✓ on track, ⚠ watch it, 🚨 over pace
- Brief 2-sentence analysis below the table
- Flag any likely miscategorized transactions`;

export async function analyzeDailySpending(
  data: DailyData,
): Promise<{ notification: string; report: string }> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: JSON.stringify(data, null, 2),
      },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip markdown code fences if Claude added them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      notification: `Budget Guardian · ${data.date}\nTotal yesterday: $${data.totalYesterday}\nCould not parse full summary — check report file.`,
      report: raw,
    };
  }
}
