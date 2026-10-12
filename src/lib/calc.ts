import type { AppData, NewOrderLine, Order, Product } from './types';
export const eur = (cents: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const num = (n: number) => new Intl.NumberFormat('tr-TR').format(n);
export const dateTime = (n: number) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(n));
export function parseMoney(text: string): number {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}
export const moneyInput = (cents: number) => (cents / 100).toFixed(2);
export function validQty(value: number) { return Number.isSafeInteger(value) && value >= 0; }
export function orderTotals(items: NewOrderLine[], products: Product[], cartonCount: number, cartonCostCents: number) {
  let revenueCents = 0, itemCostCents = 0;
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) continue;
    revenueCents += item.unitSalePriceCents * item.quantity;
    itemCostCents += product.unitCostCents * item.quantity;
  }
  const grossProfitCents = revenueCents - itemCostCents;
  return { revenueCents, itemCostCents, grossProfitCents, cartonCostCents: cartonCount * cartonCostCents, netProfitCents: grossProfitCents - cartonCount * cartonCostCents };
}
export function orderRevenue(order: Order) { return order.items.reduce((v, l) => v + l.unitSalePriceCents * l.quantity, 0); }
export function orderGrossProfit(order: Order) { return order.items.reduce((v, l) => v + (l.unitSalePriceCents - l.unitCostCents) * l.quantity, 0); }
export function stats(data: AppData) {
  const orders = data.orders.filter(o => o.status === 'active');
  const total = data.products.reduce((v, p) => v + p.totalQuantity, 0);
  const sold = data.products.reduce((v, p) => v + p.sold, 0);
  const remaining = data.products.reduce((v, p) => v + p.quantity, 0);
  const revenueCents = orders.reduce((v, o) => v + o.revenueCents, 0);
  const grossProfitCents = orders.reduce((v, o) => v + o.grossProfitCents, 0);
  const cartonCount = orders.reduce((v, o) => v + o.cartonCount, 0);
  const cartonCostCents = orders.reduce((v, o) => v + o.cartonCount * o.cartonUnitCostCents, 0);
  return { total, sold, remaining, revenueCents, grossProfitCents, cartonCount, cartonCostCents, netProfitCents: grossProfitCents - cartonCostCents, activeOrders: orders.length };
}
export function byProduct(data: AppData): Map<string, { revenueCents: number; grossProfitCents: number }> {
  const map = new Map<string, { revenueCents: number; grossProfitCents: number }>();
  for (const o of data.orders) if (o.status === 'active') {
    for (const l of o.items) {
      const prev = map.get(l.productId) || { revenueCents: 0, grossProfitCents: 0 };
      prev.revenueCents += l.quantity * l.unitSalePriceCents;
      prev.grossProfitCents += l.quantity * (l.unitSalePriceCents - l.unitCostCents);
      map.set(l.productId, prev);
    }
  }
  return map;
}
