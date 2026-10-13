# StockFlow

**A lightweight, multilingual inventory, order, and profit tracking Progressive Web App (PWA).**

StockFlow was created to replace a spreadsheet-based inventory workflow with a responsive application for desktop and mobile. It helps small teams track products, record multi-item orders, and understand profitability without the complexity of a full ERP system.

**Built with:** React · TypeScript · Vite · Firebase Authentication · Cloud Firestore

**Current version:** v1.3.0  
**Interface languages:** Turkish · French · Dutch · English

## Features

- **Product management:** Add, edit, and archive products; track brands, SKU/EAN references, purchase costs, default selling prices, and inventory.
- **Excel import and export:** Import product catalogs from `.xlsx` files, preview entries, and avoid duplicate imports; export operational data to Excel.
- **No hard-coded catalog:** A new inventory starts empty. Users can import their own products from Excel or add them manually.
- **Multi-product orders:** Record multiple products and quantities in one order, with a custom selling price for each line.
- **Historical accuracy:** Store purchase-cost and sale-price snapshots on order lines so later price changes do not rewrite past results.
- **Shipping and packaging:** Track shipping parcels and cartons separately, with configurable per-parcel and per-carton costs. Multiple products in one parcel incur only one parcel charge.
- **Inventory consistency:** Use Firestore transactions for order creation and cancellation; canceling an order restores its stock.
- **Stock adjustments:** Record incoming stock and corrections without treating them as sales.
- **Real-time synchronization:** Keep authorized users up to date across devices.
- **Access approval:** Users can register with email and password but cannot access inventory until an administrator approves their membership.
- **Responsive PWA:** Desktop and mobile layouts with installable-app support in compatible browsers.
- **Light, dark, and system themes:** Switch appearance from the header or Settings; automatically follow device preferences and remember the selection locally.
- **Multilingual interface:** Switch between Turkish, French, Dutch, and English in Settings.

## Screens

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Inventory totals, sales, order history, and profit summaries |
| **Products** | Product catalog, pricing, stock changes, and archiving |
| **Orders** | Multi-product orders, parcel/carton counts, and cancellations |
| **Management** | Review membership records and approve or revoke inventory access |
| **Settings** | Language, appearance (light/dark/system), shipping/carton costs, Excel import/export, and inventory utilities |

## Getting Started

### Requirements

- Node.js LTS and npm
- A Firebase project for cloud-connected use

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

### Firebase setup

1. Create a Firebase project and register a Web app.
2. Enable **Authentication → Email/Password** and create a **Cloud Firestore** database.
3. Copy `.env.example` to `.env.local` and fill in the Firebase web configuration values.
4. Deploy the repository's Firestore security rules to **your own Firebase project**:

   ```bash
   firebase login
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

5. Register your first account. In Firestore, set that account's `members/{uid}` document to `active: true` and `role: "admin"` to bootstrap administration.
6. Subsequent users register normally and wait for approval in the Management screen.

**Security:** Review the rules before deployment. Do not use open read/write Firestore rules with real business data. The frontend alone does not enforce access permissions.

### Production build and hosting

```bash
npm run build
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

Firebase Hosting must be configured to serve the Vite `dist` directory with a single-page-app rewrite to `index.html`.

## Appearance

StockFlow offers **Light**, **Dark**, and **System** appearance modes across desktop and mobile layouts. Use the header theme toggle for quick switching, or open **Settings → Appearance** to select a mode. The System option follows your operating system’s color-scheme preference, including changes made while the app is open.

Theme preference is stored in the browser on each device, not in Firestore, and therefore does not alter or synchronize business data.

## Inventory and Profit Logic

Each order line captures the **unit selling price** and **unit purchase cost** at the time of sale. An order also captures the carton and shipping rates used at that time.

```text
Revenue                 = Σ (quantity × unit selling price)
Cost of goods sold      = Σ (quantity × unit purchase cost)
Gross profit            = Revenue − Cost of goods sold
Carton expense          = Carton count × carton unit cost
Shipping expense        = Parcel count × shipping cost per parcel
Profit after expenses   = Gross profit − Carton expense − Shipping expense
```

Shipping is counted **per parcel, not per product**. For example, two items sent together in one parcel incur one shipping charge. Carton quantity is recorded independently.

Amounts are represented as integer euro cents to avoid common floating-point rounding problems. Firestore transactions help keep stock and order updates consistent.

**Accounting scope:** The profit calculation does not automatically include VAT, marketplace commissions, refunds, or other operating expenses. The app is an operational tracker, not an accounting or ERP replacement.

## Technology

- React and TypeScript
- Vite
- Firebase Authentication (Email/Password)
- Cloud Firestore (real-time listeners and transactions)
- Firebase Hosting (optional deployment)
- Progressive Web App assets
- Lucide icons and responsive CSS
- ExcelJS for XLSX workflows

The current membership-approval workflow does **not** require Cloud Functions or the Firebase Blaze plan. Firebase free-tier usage limits still apply.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run test
```

## Roadmap

- [ ] Improve accessibility and keyboard navigation
- [ ] Expand automated tests for inventory and order flows
- [ ] Refine mobile and offline experiences
- [ ] Add screenshots and a short demo video
- [ ] Improve reporting and filtering

## Privacy and Repository Hygiene

- Never commit `.env.local`, service account keys, customer data, or private business exports.
- Keep `.env.example` as a configuration template without personal values.
- Use demo or anonymized data in public screenshots.
- Firebase Web SDK configuration is not a substitute for secure Firestore rules.

## Project Background

StockFlow began as a practical tool for a small e-commerce operation. Its goal is to make everyday inventory and order entry fast, understandable, and accessible across devices while keeping historical sales calculations consistent.

## License

No open-source license has been selected yet. Add a `LICENSE` file if you decide to release the source under an open-source license.
