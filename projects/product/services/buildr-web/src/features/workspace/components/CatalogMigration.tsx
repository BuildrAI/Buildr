import { useState } from 'react';
import { Alert, Button } from 'antd';
import { assetCatalogApi, type AssetCatalog } from '../api/asset-catalog-api';
export function CatalogMigration({ catalog, onSaved }: { catalog: AssetCatalog; onSaved: (data: AssetCatalog) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!catalog.migrationRequired) return null;
  return <Alert style={{ marginBottom: 20 }} type={error ? 'error' : 'info'} showIcon message="旧服务登记需要迁移" description={error || '迁移会将服务与代码库分别登记，保留现有标识和代码位置。迁移后可维护共享关系。'} action={<Button loading={busy} onClick={async () => { setBusy(true); try { onSaved(await assetCatalogApi.migrate(catalog.revision)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>迁移登记</Button>} />;
}
