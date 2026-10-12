# StockFlow

A lightweight, mobile-first, cross-platform inventory, order and profit tracking Progressive Web App (PWA), built with **React**, **TypeScript**, **Vite** and **Firebase**.

**Features:** product catalog, brands and SKU/EAN, stock adjustments, multi-product orders, per-order sale price snapshots, historical unit costs, carton/packaging cost tracking, real-time multi-user sync, reversible order cancellation, and XLSX export. A modern responsive interface is available in Turkish.

## Screens

- **Overview:** total stock, sold, remaining, gross profit, recent orders and net profit after cartons.
- **Products:** add/edit/archive products, default prices, inventory corrections and change history.
- **Orders:** create multi-product orders with editable sale prices and carton counts, view/cancel previous orders.
- **Settings:** carton unit cost, Excel export and optional sample catalog import.

## Run locally

Requirements: **Node.js LTS**, npm.

```sh
npm install
npm run dev
```

Open the displayed localhost address. Without Firebase environment variables, StockFlow runs in an explicitly labeled **browser-only demo mode** with six example products drawn from the owner's original inventory sheet. This mode is NOT cloud-connected.

For cloud use, copy `.env.example` to `.env`, fill in your Firebase web app config, enable Email/Password Authentication and Cloud Firestore, deploy `firestore.rules`, and create `members/{uid}` documents with `{ active: true }` for authorized users. Then run the build and deploy to Firebase Hosting.

**Full Windows/Firebase/iPhone/Android setup in Turkish:** [KURULUM-TR.md](KURULUM-TR.md).

## Data logic

- Currency values are stored as **integer euro cents** to avoid floating-point money errors.
- Each order item snapshots **unit sale price and unit cost**. Editing current product prices never changes historical profitability.
- Inventory removal through an order uses a **Cloud Firestore transaction** so simultaneous writes cannot silently oversell.
- Order references, when supplied, have a SHA-256-based uniqueness document; an active duplicate cannot be submitted.
- Cancellation atomically restores stock and retains the canceled order in history.
- Carton expense = actual carton count × per-order carton cost snapshot. It is not charged per product.
- Manual stock adjustments affect physical inventory but are not treated as sales.
- Product deletion is replaced by archiving to preserve order history.

**Accounting disclaimer:** Profit is before taxes, marketplace fees, shipping, and other expenses. No batch costing (FIFO / weighted average) is implemented. This is a lightweight operations tracker, not full ERP/accounting software.

## Security

The app does not offer public user registration. An administrator manually provisions Auth users and `members/{uid}` entries in Firebase Console. **Firestore Security Rules, not frontend hiding, determine access**. Members have equal edit permissions per the intended workflow. `service account` secrets must never be committed.

## Tech

- React + TypeScript + Vite
- Firebase Authentication (Email/Password)
- Firestore (real-time snapshots + atomic transactions)
- Firebase Hosting (HTTPS, optional)
- PWA manifest + service worker (minimal shell, online-first)
- Lucide icons, custom responsive CSS
- ExcelJS on-demand for `.xlsx` exports

## Scripts

```sh
npm run dev
npm run build
npm run preview
npm run test
```

## License / source

Personal portfolio project. Add a `LICENSE` file of your choice before distributing as open source.
