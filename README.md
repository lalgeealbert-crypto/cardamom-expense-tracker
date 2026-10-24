# Cardamom Plantation Expense Tracker

A lightweight, offline, browser-only expense tracker built with plain HTML, CSS, and JavaScript. No installation, server, or build tools required.

## How to open

1. Copy the whole `CardamomExpenseTracker` folder anywhere you like (keep `index.html`, `style.css`, and `script.js` together in the same folder).
2. Double-click `index.html` (or open it with your browser via `File > Open`).
3. The app runs entirely offline using `file://` — no internet connection needed.

## First run

The first time you open the app you'll see a **First-Time Setup** screen. Create:
- One **Admin** account (username + password)
- One **User** account (username + password)

There are no default/built-in passwords — you choose them yourself during setup.

After setup, you'll land on the login screen. Sign in with either account to continue.

## Roles

**Admin** can:
- Manage user accounts (add, edit, deactivate)
- Add, rename, reorder, and deactivate expense categories
- Create custom expense fields (text, number, date, dropdown; mark as required)
- View and manage all expenses from every user
- View reports (monthly, by user) and export data

**User** can:
- Add, view, search, filter, and edit their own expense records
- View their personal dashboard and summaries
- Export their own data and import/export JSON backups of their own records

## Managing expenses

Default fields include: expense date, category, description, amount & currency, payment method, supplier/recipient, receipt/reference number, and notes.

Default categories: Labour, Fertilizer, Pesticides, Irrigation, Tools, Transport, Harvesting, Packaging, Maintenance, Miscellaneous.

Admins can add more categories or custom fields at any time from the sidebar (**Categories** / **Custom Fields**) — no code editing needed. Renaming or deactivating a category or field does **not** delete any existing expense records; historical data is preserved.

## Filtering & reports

From **Expenses**, filter by date range, category, payment method, or free-text search, and see live totals. Use **Export CSV** to download the filtered results as a spreadsheet-ready file. Admins also get a **Reports** page with monthly and per-user totals.

## Backup & restore

Go to **Data Management**:
- **Export Full Backup (JSON)** — downloads all your data as a `.json` file. Keep this somewhere safe.
- **Import Backup** (admin only) — restores data from a previously exported JSON file. This replaces all current data in the browser.
- **Reset All Data** (admin only) — permanently wipes everything stored in this browser, after confirmation.

## ⚠️ Important security & data limitations

This is a **prototype**, not a production-grade secure system:

- All data (including usernames and passwords) is stored in your browser's **Local Storage**, in plain form. It is **not encrypted**.
- Anyone with access to this browser/profile (or who opens the browser's Developer Tools) can view or modify the stored data, including bypassing login.
- Data is **local to this specific browser on this specific device**. It is not synced, backed up automatically, or shared across devices/browsers. Clearing browser data, switching browsers, or using a private/incognito window will not show your saved data (and incognito data disappears when the window closes).
- Do **not** enter real sensitive financial information, real passwords you reuse elsewhere, or anything you wouldn't want someone with local device access to see.
- There is no network transmission of data — everything stays on your machine, which is good for privacy but means **you are responsible for backups** (use the JSON export regularly).

For real business use with multiple users, sensitive data, or audit requirements, this app should be replaced with a proper server + database solution with real authentication and encryption.

## Troubleshooting

- **Forgot admin password / locked out**: there is no password recovery (no server/email). If you still have an active admin session, add a new admin user before this happens. Otherwise, use "Reset application data" on the login screen (this erases all data) and run setup again.
- **"Corrupted data" or unexpected reset**: if browser storage becomes corrupted, the app will fall back to safe defaults so it doesn't crash, but you may lose data — restore from your latest JSON backup.
- **Storage full**: browsers typically allow several MB of Local Storage per site. If you hit limits, export a backup and reset old data you no longer need.
