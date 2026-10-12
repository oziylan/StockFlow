import { useMemo, useState, type ChangeEvent } from 'react';
import { CheckCircle2, FileSpreadsheet, Info, LoaderCircle, UploadCloud } from 'lucide-react';
import { eur, num } from '../lib/calc';
import { matchesExisting, parseProductWorkbook, type ParsedExcel } from '../lib/importExcel';
import type { AppData, StockRepository } from '../lib/types';
import './ExcelImport.css';

export default function ExcelImport({ data, repo, notify }: {
  data: AppData;
  repo: StockRepository;
  notify: (message: string, error?: boolean) => void;
}) {
  const [parsed, setParsed] = useState<ParsedExcel | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const newProducts = useMemo(() => parsed?.products.filter(p => !data.products.some(old => matchesExisting(old, p))) ?? [], [parsed, data.products]);
  const duplicateCount = parsed ? parsed.products.length - newProducts.length : 0;
  const stockCount = newProducts.reduce((n, p) => n + p.initialQuantity, 0);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setParsed(null); setError(''); setReading(true);
    try { setParsed(await parseProductWorkbook(file)); }
    catch(e) { setError(e instanceof Error ? e.message : 'Excel okunamadı.'); }
    finally { setReading(false); }
  }
  async function upload() {
    if (!newProducts.length || saving) return;
    if (!window.confirm(`${newProducts.length} yeni ürün (${num(stockCount)} adet stok) Firestore'a eklensin mi? Mevcut ürünler ve siparişler değişmeyecek.`)) return;
    setSaving(true);
    try {
      const result = await repo.importProducts(newProducts);
      notify(`${result.added} yeni ürün aktarıldı.${result.skipped ? ` ${result.skipped} mevcut ürün atlandı.` : ''}`);
      setParsed(null);
    } catch(e) { setError(e instanceof Error ? e.message : 'Aktarım başarısız oldu.'); }
    finally { setSaving(false); }
  }
  return <section className="surface excel-import-card">
    <div className="settings-head">
      <div className="settings-icon mint"><FileSpreadsheet size={22}/></div>
      <div><h2>Excel'den ürün aktar</h2><p>.xlsx dosyasındaki ürünleri, maliyetleri ve mevcut stokları tek seferde yükle.</p></div>
    </div>
    <label className="excel-file-picker">
      <UploadCloud size={20}/>
      <span>{reading ? 'Excel okunuyor...' : 'Excel dosyası seç (.xlsx)'}</span>
      <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readFile} disabled={reading || saving} />
    </label>
    <p className="excel-import-help"><Info size={15}/> Önizleme ve onay olmadan hiçbir ürün kaydedilmez. Var olan ürünler tekrar eklenmez, stokları değiştirilmez.</p>
    {error && <p role="alert" className="excel-import-error">{error}</p>}
    {parsed && <div className="excel-import-preview">
      <div className="excel-import-meta"><strong>{parsed.fileName}</strong><small>Sayfa: {parsed.sheetName}</small></div>
      <div className="excel-import-stats">
        <span><strong>{newProducts.length}</strong> yeni ürün</span>
        <span><strong>{num(stockCount)}</strong> adet stok</span>
        <span><strong>{duplicateCount}</strong> mevcut ürün atlanacak</span>
      </div>
      {parsed.usedRemaining && <p className="excel-import-help">Excel'deki <strong>"Kalan Adet"</strong> sütunu esas alınır. Eski satış geçmişi içe aktarılmaz.</p>}
      <div className="excel-import-table-scroll"><table><thead><tr><th>Ürün</th><th>Stok</th><th>Maliyet</th><th>Satış</th></tr></thead>
        <tbody>{newProducts.map(p => <tr key={p.sourceRow}><td>{p.name}</td><td>{num(p.initialQuantity)}</td><td>{eur(p.unitCostCents)}</td><td>{eur(p.salePriceCents)}</td></tr>)}</tbody></table></div>
      {parsed.warnings.length > 0 && <details className="excel-import-warnings"><summary>{parsed.warnings.length} satırla ilgili uyarı</summary>{parsed.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
      <div className="excel-import-actions"><button className="btn btn-secondary" type="button" onClick={() => {setParsed(null);setError('');}} disabled={saving}>İptal</button>
        <button className="btn btn-primary" type="button" onClick={upload} disabled={!newProducts.length || saving}>
          {saving ? <LoaderCircle size={17} className="spin"/> : <CheckCircle2 size={17}/>} {newProducts.length} ürünü içe aktar
        </button></div>
    </div>}
  </section>;
}
