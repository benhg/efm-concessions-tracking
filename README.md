# ASVARO concessions tracking

Offline-capable register for ASVARO electronics flea market concessions.

## Run locally

```sh
npm start
```

Then open http://localhost:5173.

The app is static and dependency-free. Once it has loaded over `localhost`, its service worker caches the app shell so it can keep opening while offline. Transactions are stored on the current device in `localStorage`.

## What it tracks

- Donuts, coffee, water, and soda sold per transaction.
- Editable standard pricing: default $3 per item, any 2 items for $5, 3 items for $8, and so on.
- Markdowns: free coffee with donut, item-level free, 2-for-1, 3-for-2, and custom per-item prices.
- Direct donations plus extra donation from change the customer declines.
- Amount paid, recommended change, actual change given, expected cash, discounts, and item totals.
- Margin estimates using editable item costs, coffee component costs, and sales tax assumptions.
- Voidable transaction history with CSV and JSON export.

## Tests

```sh
npm test
```

## GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`.

In GitHub, set **Settings -> Pages -> Build and deployment -> Source** to **GitHub Actions**. After that, pushes to `main` will run tests and deploy the static app to Pages.

If the workflow reports `Get Pages site failed`, Pages has not been enabled for the repository yet. Enable the setting above, then re-run the failed workflow or push a new commit.
