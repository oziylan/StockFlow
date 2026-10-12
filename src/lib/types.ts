export interface Product {
  id: string;
  name: string;
  brand: string;
  sku: string;
  quantity: number;          // Mevcut fiziksel stok
  totalQuantity: number;     // Toplam = mevcut + satılan (düzeltme dahil)
  sold: number;
  unitCostCents: number;
  salePriceCents: number;   // Varsayılan güncel satış fiyatı
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface OrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitSalePriceCents: number; // Sipariş anındaki gerçek fiyat
  unitCostCents: number;      // Sipariş anındaki maliyet
}
export interface Order {
  id: string;
  reference: string;
  items: OrderLine[];
  cartonCount: number;
  cartonUnitCostCents: number;
  shippingParcelCount?: number;   // Eski siparişlerde mevcut olmayabilir
  shippingUnitCostCents?: number;  // Sipariş anındaki kargo fiyatı
  revenueCents: number;
  grossProfitCents: number;
  createdAt: number;
  createdBy: string;
  status: 'active' | 'canceled';
  canceledAt?: number;
}
export interface Adjustment {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  note: string;
  createdBy: string;
  createdAt: number;
}
export interface Settings { cartonUnitCostCents: number; shippingUnitCostCents: number; seeded: boolean; shippingSeparatedAt?: number }
export interface AppData {
  products: Product[];
  orders: Order[];
  adjustments: Adjustment[];
  settings: Settings;
}
export interface NewProduct { name: string; brand: string; sku: string; initialQuantity: number; unitCostCents: number; salePriceCents: number }
export interface NewOrderLine { productId: string; quantity: number; unitSalePriceCents: number }
export interface NewOrder { reference: string; items: NewOrderLine[]; cartonCount: number; shippingParcelCount: number }
export type DataListener = (value: AppData) => void;
export interface StockRepository {
  subscribe: (listener: DataListener, onError: (e: Error) => void) => () => void;
  saveProduct: (product: NewProduct, id?: string) => Promise<void>;
  adjustStock: (productId: string, delta: number, note: string) => Promise<void>;
  toggleArchive: (productId: string, archived: boolean) => Promise<void>;
  saveOrder: (order: NewOrder) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  updateCartonCost: (priceCents: number) => Promise<void>;
  updateShippingCost: (priceCents: number) => Promise<void>;
  separateShippingFromExistingCosts: () => Promise<{updated: number; skipped: number}>;
  importProducts: (products: NewProduct[]) => Promise<{added: number; skipped: number}>;
}
