import { createContext } from 'react';

const catalog: Record<string, string[]> = {
  saas_freshx: ['p_product', 'p_product_category', 'pigs_purchase_plan', 'pigs_purchase_plan_detail', 'purchase_plan', 'purchase_plan_detail', 'business_subject', 'adjustment_order', 'adjustment_order_detail'],
  saasx: ['sys_user', 'sys_social_details', 'bid', 'tender', 'sys_log', 'contract_account', 'intention_collection', 'merchant_onboarding_application', 'sys_dept', 'sys_dept_relation'],
  trading_business: ['sales_order', 'sales_order_detail', 'customer', 'customer_address', 'settlement'],
};
export class PrototypeSession {
  readonly scene: string;
  private failed = false;
  constructor(scene = '') { this.scene = scene; }
  scope() {}
  dispose() {}
  async tables(database: string, signal?: AbortSignal) {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, this.scene === 'loading' ? 1800 : 160);
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (this.scene === 'error' && !this.failed) { this.failed = true; throw Error('演示：读取表列表失败，请重试。'); }
    return (this.scene === 'empty' ? [] : catalog[database] ?? []).map(name => ({ name, type: 'BASE TABLE' }));
  }
}
export const ShortcutContext = createContext<PrototypeSession | null>(null);
export function initialSql(scene: string): string {
  if (scene === 'implicit-shortcut') return initialSql('complex').replace('\n\nSELECT 3;', '\n\nsel\n\nSELECT 3;');
  if (scene === 'implicit') return "SELECT ';' AS text;\n\nSELECT id, name\nFROM `saasx`.`sys_user`\nSELECT *\nFROM `p_product_category`\n\nSELECT 3;";
  if (scene === 'complex') return 'SELECT 0\n\nWITH RECURSIVE a(n) AS (\n  SELECT 1\n  UNION ALL\n  SELECT n + 1 FROM a WHERE n < 3\n), b AS (SELECT n FROM a)\nSELECT n FROM b\nUNION SELECT 9\n\nSELECT 3;';
  if (scene === 'ambiguous') return 'SELECT * FROM\nSELECT 2';
  return scene === 'blank' ? '' : scene === '' ? 'sel' : scene === 'semicolon' ? "SELECT ';' AS text;\n\nSELECT id, name\nFROM `saasx`.`sys_user`;\nSELECT *\nFROM `p_product_category`;\n\nSELECT 3;" : scene === 'statement' ? "SELECT ';' AS text;\n\nSELECT id, name\nFROM `saasx`.`sys_user`;\n\nSELECT 3;" : scene === 'cross' ? 'SELECT *\nFROM `saasx`.;' : 'SELECT *\nFROM ;';
}
export function initialCursor(value: string) {
  if (value.includes('\nsel\n')) return value.indexOf('\nsel\n') + 4;
  if (value.includes('WITH RECURSIVE')) return value.indexOf('SELECT n FROM b') + 7;
  if (value.includes('`p_product_category`')) return value.indexOf('`p_product_category`') + '`p_product_category`'.length + (value.includes('`p_product_category`;') ? 1 : 0);
  return value.includes('SELECT id') ? value.indexOf('SELECT id') : value.includes(';') ? value.indexOf(';') : value.length;
}
