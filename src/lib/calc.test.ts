import { describe, it, expect } from 'vitest';
import { byProduct, orderGrossProfit, orderRevenue, orderTotals, parseMoney, stats } from './calc';
import type { AppData, Product, Order } from './types';
const product: Product = { id: 'p1', name: 'Test ürün', brand: '', sku: '', quantity: 77, totalQuantity: 100, sold: 23, unitCostCents: 1000, salePriceCents: 2500, archived: false, createdAt: 0, updatedAt: 0 };
const orders: Order[] = [
  { id:'o1', reference:'a',items:[{ productId:'p1', productName:'Test ürün', quantity:3, unitSalePriceCents:2000, unitCostCents:1000 }], cartonCount:1, cartonUnitCostCents:50, revenueCents:6000, grossProfitCents:3000, createdAt:0, createdBy:'tester',status:'active' },
  { id:'o2', reference:'b',items:[{ productId:'p1', productName:'Test ürün', quantity:20, unitSalePriceCents:1500, unitCostCents:1000 }], cartonCount:2, cartonUnitCostCents:50, revenueCents:30000, grossProfitCents:10000, createdAt:0, createdBy:'tester',status:'active' }
];
const data:AppData={products:[product],orders,adjustments:[],settings:{cartonUnitCostCents:50,shippingUnitCostCents:360,seeded:true}};
describe('sales at changing prices',()=>{
  it('3 × €20 plus 20 × €15 = €360 revenue, €130 gross profit',()=>{
    expect(stats(data).revenueCents).toBe(36000);
    expect(stats(data).grossProfitCents).toBe(13000);
    expect(stats(data).netProfitCents).toBe(12850);
    expect(byProduct(data).get('p1')?.revenueCents).toBe(36000);
  });
  it('historical orders do not use the new default selling price',()=>{
    expect(orderRevenue(orders[0])).toBe(6000);
    expect(orderGrossProfit(orders[1])).toBe(10000);
    const changed={...data,products:[{...product,salePriceCents:5000}]};
    expect(stats(changed).revenueCents).toBe(36000);
  });
  it('properly calculates order-specific cartons',()=>{
    const t=orderTotals([{productId:'p1',quantity:2,unitSalePriceCents:1500}],[product],3,50);
    expect(t.revenueCents).toBe(3000);expect(t.grossProfitCents).toBe(1000);expect(t.netProfitCents).toBe(850);
  });
  it('charges shipping once for two items in one parcel, not twice',()=>{
    const updatedProduct={...product,unitCostCents:840,salePriceCents:2500};
    const result=orderTotals([{productId:'p1',quantity:2,unitSalePriceCents:2500}],[updatedProduct],1,50,1,360);
    expect(result.revenueCents).toBe(5000);
    expect(result.itemCostCents).toBe(1680);
    expect(result.shippingCostCents).toBe(360);
    expect(result.netProfitCents).toBe(2910);
    const twoParcels=orderTotals([{productId:'p1',quantity:2,unitSalePriceCents:2500}],[updatedProduct],1,50,2,360);
    expect(twoParcels.netProfitCents).toBe(2550);
  });
  it('preserves old orders without a separate shipping charge',()=>{
    expect(stats(data).shippingCostCents).toBe(0);
    expect(stats(data).netProfitCents).toBe(12850);
  });
  it('rejects invalid money input',()=>{
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('12.50')).toBe(1250);
    expect(Number.isNaN(parseMoney('12,345'))).toBe(true);
  });
});
