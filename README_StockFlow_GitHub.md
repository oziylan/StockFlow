# StockFlow

**A lightweight inventory and order management Progressive Web App.**

StockFlow is a responsive application for managing products, recording sales, tracking stock movements, and monitoring gross profit in one place. It was created to replace a spreadsheet-based workflow with a faster interface that can be used from a desktop or mobile device.

Built with **React, TypeScript, Vite, and Firebase**, the app supports real-time data synchronization for approved team members.

> **Project status:** v1.0 — working application, with ongoing improvements. The current interface is in Turkish; multilingual support is planned.

## Features

- **Inventory management:** Add, edit, and archive products; manage brands, SKU/EAN references, purchase costs, selling prices, and stock quantities.
- **Stock adjustments:** Record incoming stock and manual corrections separately from sales.
- **Order management:** Add multiple products to one order, set quantities, enter an optional order reference, and override the selling price for each order line.
- **Profit tracking:** Calculate sales revenue, cost of goods sold, gross profit, and packaging expenses.
- **Packaging costs:** Track the number of cartons used per order rather than assuming one carton per product.
- **Order history:** Review past orders and cancel an incorrect order while restoring its stock.
- **Excel integration:** Import products from `.xlsx` files with a preview and duplicate checks; export inventory and sales reports to Excel.
- **Real-time synchronization:** Share inventory updates across approved users via Cloud Firestore.
- **Access control:** Email/password registration with administrator approval before inventory access is granted.
- **Responsive PWA:** Designed for desktop and mobile browsers, with installable-app support on compatible devices.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling | Responsive CSS |
| Backend services | Firebase Authentication, Cloud Firestore |
| Hosting | Firebase Hosting (optional) |
| Spreadsheet handling | ExcelJS |
| Icons | Lucide React |
| Testing | Vitest |
| PWA | Web app manifest and service worker |

**No custom backend or Cloud Functions are required for the current version.** The Firebase Spark plan can be used within its free usage limits.

## Getting Started

### Prerequisites

- Node.js (LTS) and npm
- A Firebase project if you want cloud synchronization

### 1. Install and run

```bash
git clone https://github.com/YOUR_USERNAME/stockflow.git
cd stockflow
npm install
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

> Without Firebase configuration, StockFlow runs in a **local demo mode**. Demo data is stored in the browser and is not shared with other devices.

### 2. Connect Firebase

1. Create a project in [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication → Email/Password**.
3. Create a **Cloud Firestore** database.
4. Register a **Web app** under Firebase project settings.
5. Copy `.env.example` to `.env.local` and fill in your Firebase Web SDK configuration:

```dotenv
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
```

6. Install the Firebase CLI, authenticate, and deploy the Firestore rules:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

7. Restart the development server:

```bash
npm run dev
```

**Important:** Review `firestore.rules` before using real data. Never publish a database with open read/write permissions.

### 3. Approve users

New users can create an email/password account, but **registration does not automatically grant inventory access**. A new `members/{uid}` document starts with `active: false`.

For the initial administrator, manually set the following fields on their Firestore `members/{uid}` document:

| Field | Type | Value |
| --- | --- | --- |
| `active` | Boolean | `true` |
| `role` | String | `admin` |

Once the first administrator is configured, the **Management** page can approve or revoke other users' access without opening Firebase Console. Only approved members can read or write operational data.

> The Management page lists Firestore membership records, not every account in Firebase Authentication. Authentication account deletion and password administration remain in Firebase Console in this no-Cloud-Functions version.

## How It Works

### Order and inventory consistency

- An order can contain several products, each with its own quantity and selling price.
- Each order line records a **snapshot** of the unit selling price and purchase cost at the time of sale.
- Changing a product's default price does **not** recalculate past orders.
- Firestore transactions update order and stock data together to reduce the risk of inconsistent quantities during concurrent operations.
- Canceling an order restores inventory while preserving the canceled record in the history.

### Profit calculations

```text
Revenue            = Σ (quantity × unit selling price)
Cost of goods sold = Σ (quantity × unit purchase cost)
Gross profit       = Revenue − Cost of goods sold
Packaging cost     = Cartons used × Cost per carton
Profit after cartons = Gross profit − Packaging cost
```

Monetary values are stored as **integer euro cents** to avoid floating-point rounding issues.

**Accounting note:** The displayed profit does not include VAT, shipping charges, marketplace commissions, or other operating expenses. StockFlow is a lightweight operations tool, not a full accounting or ERP solution.

## Available Commands

```bash
npm run dev      # Start the local development server
npm run build    # Type-check and build for production
npm run preview  # Preview the production build
npm run test     # Run automated tests
```

To deploy the built app with Firebase Hosting, configure Hosting for your own Firebase project and run:

```bash
npm run build
firebase deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

## Roadmap

- [ ] Multilingual interface: **Turkish, French, Dutch, and English**
- [ ] Improved mobile usability and accessibility
- [ ] More automated tests for inventory and order workflows
- [ ] Better filtering and reporting options
- [ ] Expanded documentation and real application screenshots

## Security and Privacy

- Access to Firestore data is enforced through **Firestore Security Rules**, not just hidden frontend controls.
- New accounts are inactive until approved by an administrator.
- Keep `.env.local`, local data exports, credentials, and any service account keys out of Git.
- Firebase client configuration is not a server-side secret; access control still depends on correctly configured Authentication and security rules.
- Never commit real customer details, private inventory exports, or business-sensitive screenshots to a public repository.

## Background

StockFlow started as a practical effort to simplify a spreadsheet-based inventory workflow. The focus is on **simple data entry, consistent stock calculations, and an interface that works across devices**, rather than building a complex ERP system.

## License

No open-source license has been selected yet. Add a `LICENSE` file before distributing the project under a specific license.
