import { useMemo, useState, type ChangeEvent } from 'react';
import { CheckCircle2, FileSpreadsheet, Info, LoaderCircle, UploadCloud } from 'lucide-react';
import { eur, num } from '../lib/calc';
import { matchesExisting, parseProductWorkbook, type ParsedExcel } from '../lib/importExcel';
import type { AppData, StockRepository } from '../lib/types';
import './ExcelImport.css';
import { useI18n } from '../i18n';

export default function ExcelImport({ data, repo, notify }: {
  data: AppData;
  repo: StockRepository;
  notify: (message: string, error?: boolean) => void;
}) {
  const { t } = useI18n();
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
    catch(e) { setError(e instanceof Error ? e.message : t("Excel okunamadı.")); }
    finally { setReading(false); }
  }
  async function upload() {
    if (!newProducts.length || saving) return;
    if (!window.confirm(`${newProducts.length} ${t('yeni ürün')} (${num(stockCount)} ${t('adet stok')}) — ${t('ürünü içe aktar')}?`)) return;
    setSaving(true);
    try {
      const result = await repo.importProducts(newProducts);
      notify(`${result.added} ${t('Yeni ürün aktarıldı.')}${result.skipped ? ` ${result.skipped} ${t('Mevcut ürün atlandı.')}` : ''}`);
      setParsed(null);
    } catch(e) { setError(e instanceof Error ? e.message : t("Aktarım başarısız oldu.")); }
    finally { setSaving(false); }
  }
  return <section className="surface excel-import-card">
    <div className="settings-head">
      <div className="settings-icon mint"><FileSpreadsheet size={22}/></div>
      <div><h2>{t("Excel'den ürün aktar")}</h2><p>{t(".xlsx dosyasındaki ürünleri, maliyetleri ve mevcut stokları tek seferde yükle.")}</p></div>
    </div>
    <label className="excel-file-picker">
      <UploadCloud size={20}/>
      <span>{reading ? t("Excel okunuyor...") : t("Excel dosyası seç (.xlsx)")}</span>
      <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readFile} disabled={reading || saving} />
    </label>
    <p className="excel-import-help"><Info size={15}/> {t("Önizleme ve onay olmadan hiçbir ürün kaydedilmez. Var olan ürünler tekrar eklenmez, stokları değiştirilmez.")}</p>
    {error && <p role="alert" className="excel-import-error">{error}</p>}
    {parsed && <div className="excel-import-preview">
      <div className="excel-import-meta"><strong>{parsed.fileName}</strong><small>{t("Sayfa:")} {parsed.sheetName}</small></div>
      <div className="excel-import-stats">
        <span><strong>{newProducts.length}</strong> {t("yeni ürün")}</span>
        <span><strong>{num(stockCount)}</strong> {t("adet stok")}</span>
        <span><strong>{duplicateCount}</strong> {t("mevcut ürün atlanacak")}</span>
      </div>
      {parsed.usedRemaining && <p className="excel-import-help">{t("Excel'deki")} <strong>{t("\"Kalan Adet\"")}</strong> {t("sütunu esas alınır. Eski satış geçmişi içe aktarılmaz.")}</p>}
      <div className="excel-import-table-scroll"><table><thead><tr><th>{t("Ürün")}</th><th>{t("Stok")}</th><th>{t("Maliyet")}</th><th>{t("Satış")}</th></tr></thead>
        <tbody>{newProducts.map(p => <tr key={p.sourceRow}><td>{p.name}</td><td>{num(p.initialQuantity)}</td><td>{eur(p.unitCostCents)}</td><td>{eur(p.salePriceCents)}</td></tr>)}</tbody></table></div>
      {parsed.warnings.length > 0 && <details className="excel-import-warnings"><summary>{parsed.warnings.length} {t("satırla ilgili uyarı")}</summary>{parsed.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
      <div className="excel-import-actions"><button className="btn btn-secondary" type="button" onClick={() => {setParsed(null);setError('');}} disabled={saving}>{t("Vazgeç")}</button>
        <button className="btn btn-primary" type="button" onClick={upload} disabled={!newProducts.length || saving}>
          {saving ? <LoaderCircle size={17} className="spin"/> : <CheckCircle2 size={17}/>} {newProducts.length} {t("ürünü içe aktar")}
        </button></div>
    </div>}
  </section>;
}
