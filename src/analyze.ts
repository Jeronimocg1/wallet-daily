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
  "notification": "...",
  "report": "..."
}

NOTIFICATION FORMAT — use this exact structure:
Line 1: "Daily Budget Guardian — [date]"
Line 2: blank
Line 3: "TODAY'S ACTIVITY"
Lines 4+: one bullet per transaction: "• [description]: -$[amount] ([category])"
          for income use: "• [description]: +$[amount]"
          if no transactions: "• No spending yesterday"
Line N: blank
Line N+1: "MAY - Day [X] of [Y] ([Z]% of month gone)"
Lines N+2+: one line per category:
            "[emoji] [Category]: $[spent] / $[limit] ([%]%)"
            emoji: ✅ on track, ⚠️ watch it, 🚨 over pace
            Include ALL categories, even $0 ones
Line last: blank then "Total: $[monthToDate] / $[totalBudget]"

Keep category names short. Use real transaction descriptions (payee/note), not generic labels.
Flag ⚠️ if % used > % of month elapsed + 10 points.

REPORT FORMAT — full markdown with:
- Transaction table with date, description, category, amount
- Budget status table: Category | Limit | Month-to-date | % Used | Status
- 2-sentence analysis`;

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

// ─── Weekly ───────────────────────────────────────────────────────────────────

const WEEKLY_PROMPT = `You are a personal finance assistant producing a weekly budget summary.

Budget: ${CURRENCY} $${TOTAL_MONTHLY_BUDGET.toLocaleString()}/month. Weekly equivalent: ~$${Math.round(TOTAL_MONTHLY_BUDGET / 4.33).toLocaleString()}.
Categories: ${BUDGET_CATEGORIES.map((c) => `${c.name} ($${c.monthlyLimit.toLocaleString()}/mo)`).join(", ")}

Respond ONLY with valid JSON (no markdown fences):
{"notification": "...", "report": "..."}

NOTIFICATION: 5-7 lines covering:
- Line 1: "Weekly Report - [week label]"
- Line 2: total spent vs weekly budget
- Lines 3-5: top spending categories
- Last line: overall assessment (under/over pace)

REPORT: markdown with transaction table (top 10), category breakdown table vs weekly limits, and 3-sentence analysis.`;

export async function analyzeWeeklySpending(data: object): Promise<{ notification: string; report: string }> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: [{ type: "text", text: WEEKLY_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(data, null, 2) }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return { notification: "Weekly report generated — check report file.", report: raw };
  }
}

// ─── Monthly ──────────────────────────────────────────────────────────────────

const MONTHLY_PROMPT = `You are a personal finance assistant producing a monthly close report.

Budget: ${CURRENCY} $${TOTAL_MONTHLY_BUDGET.toLocaleString()}/month. Savings target: $61,000/month to Revolut.
Long-term goal: MXN $1,000,000 net worth by December 31, 2026.
Categories: ${BUDGET_CATEGORIES.map((c) => `${c.name} ($${c.monthlyLimit.toLocaleString()})`).join(", ")}

Respond ONLY with valid JSON (no markdown fences):
{"notification": "...", "report": "..."}

NOTIFICATION: 6-8 lines covering:
- Line 1: "Monthly Close - [month]"
- Line 2: total spent vs budget, amount saved
- Lines 3-5: categories that went over or were notably under
- Line 6: savings vs $61,000 target
- Last line: one-line verdict on the month

REPORT: full markdown with:
- Category table: name | limit | spent | under/over | status
- Top 10 transactions
- Savings summary ($spent vs $17,293 budget, implied savings)
- 3-sentence month assessment`;

export async function analyzeMonthlySpending(data: object): Promise<{ notification: string; report: string }> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: [{ type: "text", text: MONTHLY_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(data, null, 2) }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return { notification: "Monthly report generated — check report file.", report: raw };
  }
}
