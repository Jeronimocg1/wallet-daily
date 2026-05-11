// Midday overspending alert — no Claude needed, pure math.
// Runs at 1 PM daily. Fires a high-priority push notification only if
// a category is tracking more than 50% over its daily pace.

import { validateConfig } from "./client.js";
import { fetchExpenses, groupExpenses, formatDate } from "./data.js";
import { sendPushNotification } from "./notify.js";
import { BUDGET_CATEGORIES, TOTAL_MONTHLY_BUDGET } from "../budget.config.js";

function getDates() {
  const now = new Date();
  const today = formatDate(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const hourFraction = (now.getHours() + now.getMinutes() / 60) / 24;
  return { today, daysInMonth, dayOfMonth: now.getDate(), hourFraction };
}

interface OverpaceCategory {
  name: string;
  monthlyLimit: number;
  spentToday: number;
  dailyAllowance: number;
  overpaceBy: number;
}

async function main() {
  validateConfig();

  const { today, daysInMonth, dayOfMonth, hourFraction } = getDates();
  console.log(`[alert] Checking spending pace for ${today}...`);

  const todayExpenses = await fetchExpenses(today, today);
  const groups = groupExpenses(todayExpenses);

  const monthStart = today.slice(0, 8) + "01";
  const monthExpenses = await fetchExpenses(monthStart, today);
  const monthGroups = groupExpenses(monthExpenses);

  const alerts: OverpaceCategory[] = [];

  for (const cat of BUDGET_CATEGORIES) {
    const dailyAllowance = cat.monthlyLimit / daysInMonth;
    const spentToday = groups.get(cat.name)?.total ?? 0;
    const monthToDate = monthGroups.get(cat.name)?.total ?? 0;

    // Flag if today's spend alone exceeds 1.5x the daily allowance
    // OR if month-to-date exceeds expected pace by more than 20%
    const monthPace = (dayOfMonth / daysInMonth) * cat.monthlyLimit;
    const overMonthPace = monthToDate > monthPace * 1.2;
    const overDayPace = spentToday > dailyAllowance * 1.5;

    if (overDayPace || overMonthPace) {
      alerts.push({
        name: cat.name,
        monthlyLimit: cat.monthlyLimit,
        spentToday: Math.round(spentToday * 100) / 100,
        dailyAllowance: Math.round(dailyAllowance * 100) / 100,
        overpaceBy: Math.round(((monthToDate / monthPace - 1) * 100) * 10) / 10,
      });
    }
  }

  if (alerts.length === 0) {
    console.log("[alert] All categories on track — no notification sent.");
    return;
  }

  const lines = [
    `Spending Alert - ${today}`,
    "",
    ...alerts.map(
      (a) =>
        `${a.name}: $${a.spentToday} today (allowance $${a.dailyAllowance}/day, ${a.overpaceBy > 0 ? `+${a.overpaceBy}% over monthly pace` : "over daily pace"})`,
    ),
  ];

  await sendPushNotification({
    title: "Spending Alert",
    message: lines.join("\n"),
    priority: "high",
    tags: ["warning"],
  });

  console.log(`[alert] Sent alert for ${alerts.length} over-pace category/categories.`);
}

main().catch((err) => {
  console.error("[alert] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
