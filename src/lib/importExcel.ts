import { translate } from '../i18n';
import type { NewProduct } from './types';

export interface ParsedProduct extends NewProduct { sourceRow: number }
export interface ParsedExcel { sheetName: string; fileName: string; products: ParsedProduct[]; warnings: string[]; usedRemaining: boolean }

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/[₺€()]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '').trim();
}
function getText(cell: { value: unknown; text: string }): string {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: string; richText?: Array<{ text: string }> };
    if (o.result != null) return String(o.result).trim();
    if (o.richText) return o.richText.map(t => t.text).join('').trim();
    if (o.text) return String(o.text).trim();
  }
  return cell.text.trim();
}
function decimal(value: string): number {
  const s = value.trim().replace(/[^\d,.\-]/g, '');
  if (!s || s.startsWith('-')) return Number.NaN;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    return Number(comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  }
  if (comma >= 0) return Number(s.replace(',', '.'));
  return Number(s);
}
const labels = {
  name: ['urunismi', 'urunadi', 'urun', 'productname', 'product', 'name', 'description', 'aciklama'],
  quantity: ['kalanadet', 'kalankoli', 'mevcutstok', 'currentstock', 'remaining', 'onhand', 'stock', 'stok', 'stokadedi', 'toplamadet', 'adedi', 'adet', 'miktar', 'quantity', 'qty', 'initialquantity'],
  cost: ['urunmaliyetikargoharic', 'urunmaliyet', 'birimmaliyetkargoharic', 'birimmaliyet', 'maliyet', 'alisfiyati', 'alisbirimfiyati', 'birimalisfiyati', 'unitcost', 'cost', 'costprice', 'purchaseprice'],
  price: ['satisfiyati', 'birimsatisfiyati', 'satistutariadeti', 'saleprice', 'sellingprice', 'unitprice', 'price'],
  brand: ['marka', 'brand'],
  sku: ['sku', 'ean', 'barkod', 'barcode', 'stokodu', 'stokcode', 'productcode']
} satisfies Record<string, string[]>;
type Fields = keyof typeof labels;
function findHeader(headings: string[]): Partial<Record<Fields, number>> {
  const result: Partial<Record<Fields, number>> = {};
  for (const field of Object.keys(labels) as Fields[]) {
    // Remaining stock is preferred to total received stock when both exist.
    const order = labels[field];
    for (const label of order) {
      const idx = headings.indexOf(label);
      if (idx >= 0) { result[field] = idx + 1; break; }
    }
  }
  return result;
}
export function productKey(p: Pick<NewProduct, 'name' | 'sku'>): string {
  return normalize(p.name);
}
export function matchesExisting(a: Pick<NewProduct, 'name' | 'sku'>, b: Pick<NewProduct, 'name' | 'sku'>): boolean {
  return productKey(a) === productKey(b) || (!!a.sku && !!b.sku && normalize(a.sku) === normalize(b.sku));
}
export async function parseProductWorkbook(file: File): Promise<ParsedExcel> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error(translate("Yalnızca .xlsx Excel dosyası seç."));
  if (file.size > 8 * 1024 * 1024) throw new Error(translate("Excel dosyası en fazla 8 MB olabilir."));
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const bytes = await file.arrayBuffer();
  await workbook.xlsx.load(bytes as Parameters<typeof workbook.xlsx.load>[0]);

  let chosen: { sheet: typeof workbook.worksheets[number]; header: Partial<Record<Fields, number>>; headerRow: number } | null = null;
  for (const sheet of workbook.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 35); r++) {
      const row = sheet.getRow(r);
      const headings = Array.from({length: Math.min(sheet.columnCount, 40)}, (_, i) => normalize(getText(row.getCell(i + 1))));
      const header = findHeader(headings);
      if (header.name && header.quantity && header.cost && header.price) {
        chosen = { sheet, header, headerRow: r }; break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) throw new Error(translate("Excel başlıkları tanınmadı. Ürün İsmi, Toplam/Kalan Adet, Birim Maliyet (€), Satış Fiyatı (€) sütunları olmalı."));

  const { sheet, header, headerRow } = chosen;
  const warnings: string[] = [];
  const products: ParsedProduct[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = getText(row.getCell(header.name!));
    if (!name) continue;
    if (/^(toplam|genel toplam|total|karton|grand total)(\s|$)/i.test(name)) continue;
    const qty = decimal(getText(row.getCell(header.quantity!)));
    const cost = decimal(getText(row.getCell(header.cost!)));
    const price = decimal(getText(row.getCell(header.price!)));
    const brand = header.brand ? getText(row.getCell(header.brand)) : '';
    const sku = header.sku ? getText(row.getCell(header.sku)) : '';
    if (!Number.isSafeInteger(qty) || qty < 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0) {
      warnings.push(`${r}. ${translate('satır:')} ${name} — ${translate('adet veya fiyat geçersiz; aktarılmayacak.')}`);
      continue;
    }
    const unitCostCents = Math.round(cost * 100);
    const salePriceCents = Math.round(price * 100);
    if (!Number.isSafeInteger(unitCostCents) || !Number.isSafeInteger(salePriceCents)) {
      warnings.push(`${r}. ${translate('satır:')} ${translate('tutar çok büyük; aktarılmayacak.')}`);
      continue;
    }
    const p: ParsedProduct = { name, brand, sku, initialQuantity: qty, unitCostCents, salePriceCents, sourceRow: r };
    if (products.some(existing => matchesExisting(existing, p))) {
      warnings.push(`${r}. ${translate('satır:')} ${name} — ${translate("aynı ürün Excel'de zaten var; atlandı.")}`); continue;
    }
    products.push(p);
  }
  if (!products.length) throw new Error(translate('Dosyada aktarılabilecek geçerli ürün satırı bulunamadı.'));
  if (products.length > 250) throw new Error(translate('Tek seferde en fazla 250 ürün aktarılabilir. Excel dosyasını böl.'));
  const quantityHeader = getText(sheet.getRow(headerRow).getCell(header.quantity!));
  return { fileName: file.name, sheetName: sheet.name, products, warnings,
    usedRemaining: normalize(quantityHeader).includes('kalan') || normalize(quantityHeader).includes('remaining') };
}
