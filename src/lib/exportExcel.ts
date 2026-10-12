import type { AppData } from './types';
import { byProduct, stats } from './calc';

export async function exportExcel(data: AppData) {
  // Büyük XLSX modülü sadece "Excel indir" tıklandığında yüklenir.
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  book.creator = 'StockFlow';
  book.created = new Date();
  const sheet = book.addWorksheet('Stok ve Kâr');
  sheet.columns = [
    { header: 'Ürün İsmi', key: 'name', width: 42 },
    { header: 'Toplam Adet', key: 'total', width: 17 },
    { header: 'Birim Maliyet (€)', key: 'cost', width: 20 },
    { header: 'Satış Fiyatı (€)', key: 'price', width: 20 },
    { header: 'Satılan Adet', key: 'sold', width: 18 },
    { header: 'Kalan Adet', key: 'remaining', width: 17 },
    { header: 'Satış Tutarı (€)', key: 'revenue', width: 23 },
    { header: 'Brüt Kâr (€)', key: 'profit', width: 20 },
  ];
  const grouped = byProduct(data);
  for (const p of data.products) {
    const s = grouped.get(p.id);
    sheet.addRow({ name: `${p.name}${p.archived ? ' (Arşiv)' : ''}`, total: p.totalQuantity, cost: p.unitCostCents / 100, price: p.salePriceCents / 100, sold: p.sold, remaining: p.quantity, revenue: (s?.revenueCents || 0) / 100, profit: (s?.grossProfitCents || 0) / 100 });
  }
  const s = stats(data);
  sheet.addRow({ name: 'TOPLAM', total: s.total, sold: s.sold, remaining: s.remaining, revenue: s.revenueCents / 100, profit: s.grossProfitCents / 100 });
  sheet.addRow([]);
  sheet.addRow(['Kullanılan toplam karton', s.cartonCount]);
  sheet.addRow(['Toplam karton gideri (€)', s.cartonCostCents / 100]);
  sheet.addRow(['Karton sonrası kâr (€)', s.netProfitCents / 100]);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173250' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of sheet.getRows(2, sheet.rowCount - 1) || []) for (const c of [3, 4, 7, 8]) row.getCell(c).numFmt = '#,##0.00 "€"';

  const orders = book.addWorksheet('Siparişler');
  orders.columns = [
    { header: 'Tarih', key: 'date', width: 24 }, { header: 'Referans', key: 'ref', width: 30 },
    { header: 'Durum', key: 'status', width: 16 }, { header: 'Ürün Adedi', key: 'qty', width: 16 },
    { header: 'Ciro (€)', key: 'revenue', width: 18 }, { header: 'Brüt Kâr (€)', key: 'profit', width: 20 },
    { header: 'Karton Sayısı', key: 'cartons', width: 17 }, { header: 'Karton Gideri (€)', key: 'cartonExpense', width: 22 },
    { header: 'İşlemi Yapan', key: 'user', width: 32 },
  ];
  const lines = book.addWorksheet('Sipariş Kalemleri');
  lines.columns = [
    { header: 'Sipariş ID', key: 'id', width: 34 }, { header: 'Tarih', key: 'date', width: 24 },
    { header: 'Ürün', key: 'product', width: 42 }, { header: 'Adet', key: 'qty', width: 12 },
    { header: 'Birim Satış (€)', key: 'price', width: 20 }, { header: 'Birim Maliyet (€)', key: 'cost', width: 20 },
    { header: 'Ciro (€)', key: 'revenue', width: 18 }, { header: 'Brüt Kâr (€)', key: 'profit', width: 22 }
  ];
  for (const o of data.orders) {
    const d = new Date(o.createdAt).toLocaleString('tr-TR');
    orders.addRow({ date: d, ref: o.reference || o.id, status: o.status === 'active' ? 'Aktif' : 'İptal', qty: o.items.reduce((n, l) => n + l.quantity, 0), revenue: o.revenueCents / 100, profit: o.grossProfitCents / 100, cartons: o.cartonCount, cartonExpense: o.cartonCount * o.cartonUnitCostCents / 100, user: o.createdBy });
    for (const l of o.items) lines.addRow({ id: o.id, date: d, product: l.productName, qty: l.quantity, price: l.unitSalePriceCents / 100, cost: l.unitCostCents / 100, revenue: l.quantity * l.unitSalePriceCents / 100, profit: l.quantity * (l.unitSalePriceCents - l.unitCostCents) / 100 });
  }
  for (const ws of [orders, lines]) {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173250' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const bytes = await book.xlsx.writeBuffer();
  const blob = new Blob([Uint8Array.from(bytes as Uint8Array)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `stockflow-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}
