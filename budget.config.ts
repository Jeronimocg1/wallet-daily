// Edit this file to match your own budget categories and monthly limits.
// walletCategories: substring matches against BudgetBakers category names (case-insensitive).

export interface BudgetCategory {
  name: string;
  monthlyLimit: number;
  walletCategories: string[];
}

export const CURRENCY = "MXN";
export const TOTAL_MONTHLY_BUDGET = 17_293;

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  {
    name: "Restaurants",
    monthlyLimit: 9_000,
    walletCategories: [
      "Restaurants & fast food",
      "Food & Dining",
      "Groceries",
      "Free time",
    ],
  },
  {
    name: "Software & Electronics",
    monthlyLimit: 3_000,
    walletCategories: [
      "Software, apps, games",
      "Electronics",
      "Computers",
      "Fireflies",
    ],
  },
  {
    name: "Travel & Misc",
    monthlyLimit: 3_000,
    walletCategories: [
      "Travel",
      "Transport",
      "Holiday, trips, hotels",
      "Sport",
      "Leisure",
      "Others",
    ],
  },
  {
    name: "Streaming & Books",
    monthlyLimit: 1_293,
    walletCategories: ["Books, audio, subscription", "Streaming", "Music"],
  },
  {
    name: "Internet & Phone",
    monthlyLimit: 1_000,
    walletCategories: ["Phone, cell phones", "Internet", "Phone"],
  },
];
