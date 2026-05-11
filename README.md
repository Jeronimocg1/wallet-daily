# wallet-daily

Daily budget summaries from your [BudgetBakers Wallet](https://budgetbakers.com) via Claude — delivered as push notifications to your phone every morning.

Forked from [lowwave/wallet-mcp](https://github.com/lowwave/wallet-mcp), which provides the underlying MCP server for interactive Claude Desktop queries. This project adds a standalone daily job on top of it.

## What it does

Every morning at 8:00 AM:
1. Fetches yesterday's transactions from BudgetBakers Wallet API
2. Fetches this month's spending for budget rollup
3. Sends the data to Claude (Haiku) for analysis
4. Pushes a summary notification to your phone via [ntfy](https://ntfy.sh)
5. Saves a full markdown report to a local directory

**Example notification:**
```
May 10 · $432 spent
Software $321 · Restaurants $109
Month: 22% budget used, 35% of days gone ✓
```

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| [Bun](https://bun.sh) | v1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| BudgetBakers Wallet | Premium | [budgetbakers.com](https://budgetbakers.com) |
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| ntfy app | — | [ntfy.sh](https://ntfy.sh) (iOS / Android, free) |

> **Windows users:** Install Bun via `powershell -c "irm bun.sh/install.ps1 | iex"` in an admin terminal.

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/wallet-daily
cd wallet-daily
bun install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `WALLET_API_TOKEN` | Wallet app → Settings → API Tokens |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NTFY_TOPIC` | Any unique string, e.g. `budget-yourname-abc123` |
| `REPORTS_DIR` | Path where markdown reports will be saved |

### 3. Set your budget

Edit [`budget.config.ts`](./budget.config.ts) to match your categories and monthly limits:

```typescript
export const CURRENCY = "MXN";
export const TOTAL_MONTHLY_BUDGET = 17_293;

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  {
    name: "Restaurants",
    monthlyLimit: 9_000,
    walletCategories: ["Restaurants & fast food", "Food & Dining"],
  },
  // add/remove categories to match your Wallet setup
];
```

`walletCategories` is a list of BudgetBakers category names — any transaction whose category name **contains** one of these strings (case-insensitive) is counted in that budget slot.

### 4. Subscribe to push notifications

1. Install the [ntfy app](https://ntfy.sh) on your phone (iOS or Android)
2. Tap **+** and subscribe to the topic you set in `NTFY_TOPIC`
3. That's it — no account needed for basic use

### 5. Test manually

```bash
bun run daily
```

You should see the script fetch data, call Claude, send a notification, and save a report.

### 6. Schedule for daily 8 AM runs

**macOS / Linux:**
```bash
bash scripts/schedule-mac.sh
```

**Windows (run as Administrator):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\schedule-windows.ps1
```

## MCP server (interactive queries)

The original `wallet-mcp` MCP server is still included. To use it with Claude Desktop, add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "bun",
      "args": ["run", "/path/to/wallet-daily/src/index.ts"],
      "env": {
        "WALLET_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Project structure

```
wallet-daily/
├── src/
│   ├── daily.ts          ← standalone daily report script (new)
│   ├── analyze.ts        ← Claude API integration with prompt caching (new)
│   ├── notify.ts         ← ntfy push notifications (new)
│   ├── index.ts          ← MCP server entry point (original)
│   ├── client.ts         ← BudgetBakers API client (original)
│   ├── tools/            ← MCP tool handlers (original)
│   ├── types/            ← TypeScript types (original)
│   └── utils/            ← Pagination + date helpers (original)
├── budget.config.ts      ← your budget categories and limits (edit this)
├── scripts/
│   ├── schedule-mac.sh       ← installs launchd agent (Mac/Linux)
│   └── schedule-windows.ps1  ← installs Task Scheduler job (Windows)
├── .env.example          ← copy to .env and fill in your values
└── README.md
```

## Sharing with friends

1. Fork this repo on GitHub
2. Friends clone your fork: `git clone https://github.com/YOUR/wallet-daily`
3. They follow the Setup steps above
4. They edit `budget.config.ts` with their own categories and limits

The only account-specific things are in `.env` (never committed) and `budget.config.ts`.

## Costs

| Service | Cost |
|---|---|
| BudgetBakers Wallet | ~$3/month (Premium required for API) |
| Anthropic (Claude Haiku) | ~$0.001 per daily run |
| ntfy.sh | Free for basic use |

## License

MIT — same as the upstream [wallet-mcp](https://github.com/lowwave/wallet-mcp).
