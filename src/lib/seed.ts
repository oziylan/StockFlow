import type { NewProduct } from './types';
// Kaynak: kullanıcının "duz_stok_ve_kar_tablosu(1).xlsx" dosyasındaki 6 satır.
// İlk yükleme isteğe bağlı; canlı Firebase'e otomatik yazılmaz.
export const INITIAL_PRODUCTS: NewProduct[] = [
  { name: 'Single Towel 500 gr', brand: '', sku: '', initialQuantity: 300, unitCostCents: 1200, salePriceCents: 2500 },
  { name: 'Kitchen Towel 6×4 (24 rulo)', brand: '', sku: '', initialQuantity: 350, unitCostCents: 1200, salePriceCents: 1900 },
  { name: 'Toilet Paper 32×3 – 2 kat (96 rulo)', brand: '', sku: '', initialQuantity: 349, unitCostCents: 1700, salePriceCents: 2800 },
  { name: 'Toilet Paper 32×3 – 3 kat (96 rulo)', brand: '', sku: '', initialQuantity: 150, unitCostCents: 1900, salePriceCents: 3300 },
  { name: 'Toilet Paper 24×3 – 2 kat (72 rulo)', brand: '', sku: '', initialQuantity: 100, unitCostCents: 1500, salePriceCents: 2300 },
  { name: 'Toilet Paper 16×3 – 3 kat (48 rulo)', brand: '', sku: '', initialQuantity: 100, unitCostCents: 1100, salePriceCents: 2100 },
];
