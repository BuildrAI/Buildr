import '../mysql-query.css';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Select } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { RefreshButton } from '../../../components/RefreshButton';
import { ResizablePanels } from '../../../components/ResizablePanels';
import type { MySqlQueryClient, MySqlQueryTarget } from '../query-types';
import { useDatabasePreferences } from '../hooks/useDatabasePreferences';
import { sqlExecutionTarget, type SqlSelection } from '../sql-execution-target';
import { MySqlResults, type DisplayResult } from './MySqlResults';
import { DatabaseResources } from './DatabaseResources';
import { DatabaseCatalog } from '../editor/database-catalog';
import type { SqlRunningTarget } from '../editor/sql-statement-highlight';
import { SqlQueryEditor } from './SqlQueryEditor';

type Props = { connections: MySqlQueryTarget[]; client: MySqlQueryClient; entry: { id: string; nonce: number } | null; active: boolean; layoutKey: string };

export function MySqlQuery({ connections, client, entry, active: requestedActive, layoutKey }: Props) {
  const viewActive = useContext(WorkspaceViewActiveContext), active = requestedActive && viewActive;
  const [connectionId, setConnectionId] = useState(''), [sql, setSql] = useState('');
  const [selection, setSelection] = useState<SqlSelection>({ from: 0, to: 0 });
  const [runningTarget, setRunningTarget] = useState<SqlRunningTarget | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<DisplayResult | null>(null);
  const request = useRef<{ serial: number; controller?: AbortController }>({ serial: 0 });
  const connection = connections.find(item => item.id === connectionId);
  const preferences = useDatabasePreferences(client, connection, active);
  const database = preferences.currentDatabase;
  const catalog = useMemo(() => connection ? new DatabaseCatalog(client, connection.id) : null, [client, connection?.id, connection?.revision]);
  const enabledKey = JSON.stringify(preferences.enabledDatabases);
  const completion = useMemo(() => ({ catalog, database, databases: preferences.enabledDatabases, enabled: active && !busy && !preferences.loading && !preferences.saving }), [catalog, database, enabledKey, active, busy, preferences.loading, preferences.saving]);
  useEffect(() => () => catalog?.dispose(), [catalog]);
  useEffect(() => { catalog?.invalidate(); }, [catalog, active, database, enabledKey]);
  function refreshDatabases() { catalog?.invalidate(); preferences.refresh(); }
  function clearResult() { request.current.controller?.abort(); request.current.serial++; setBusy(false); setRunningTarget(null); setResult(null); setError(''); }
  function selectConnection(id: string) { if (id === connectionId) return; clearResult(); setConnectionId(id); }
  function selectDatabase(value: string) { if (value === database) return; clearResult(); preferences.select(value); }
  useEffect(() => {
    if (!entry) return;
    const selected = connections.find(item => item.id === entry.id);
    if (selected && selected.id !== connectionId) { selectConnection(selected.id); setSql(''); }
  }, [entry?.nonce]);
  useEffect(() => {
    if (!connectionId && connections[0]) selectConnection(connections[0].id);
    if (connectionId && !connection) { clearResult(); setConnectionId(''); }
  }, [connections, connectionId]);
  useEffect(() => { clearResult(); }, [client, connectionId, connection?.revision, database]);
  useEffect(() => {
    if (active) return;
    request.current.controller?.abort(); request.current.serial++; setBusy(false); setRunningTarget(null);
  }, [active]);
  useEffect(() => () => { request.current.controller?.abort(); request.current.serial++; }, []);
  async function run(selected = selection) {
    if (!active || !connection || !sql.trim() || busy || preferences.loading || preferences.saving) return;
    let target;
    try { target = sqlExecutionTarget(sql, selected); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '请选择一条查询语句。'); return; }
    request.current.controller?.abort();
    const serial = ++request.current.serial, controller = new AbortController(); request.current.controller = controller;
    setBusy(true); setRunningTarget({ document: sql, target }); setError('');
    try {
      const response = await client.query(connection.id, { sql: target.sql, database: database || null }, controller.signal);
      if (serial === request.current.serial && !controller.signal.aborted) setResult({ ...response, label: `${connection.name} · ${connection.environment}`, editorSql: sql });
    } catch (cause) { if (serial === request.current.serial && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : '查询失败。'); }
    finally { if (serial === request.current.serial) { setBusy(false); setRunningTarget(null); } }
  }
  const databaseOptions = preferences.enabledDatabases;
  const notices = <>
    {preferences.databaseError && <Alert type="warning" showIcon message={`数据库列表读取失败：${preferences.databaseError}`} />}
    {preferences.preferenceError && <Alert id="mysql-query-preferences-error" type="warning" showIcon message={`数据库选择：${preferences.preferenceError}`} />}
    {error && <Alert id="mysql-query-error" type="error" showIcon message={error} />}
    {result && result.editorSql !== sql && <p className="buildr-mysql-stale">语句已修改，运行后更新结果。</p>}
  </>;
  return <section className="buildr-mysql-query" aria-label="MySQL 查询">
    <header className="buildr-mysql-target"><label>连接<Select aria-label="选择连接" value={connectionId || undefined} placeholder="选择 MySQL 连接" options={connections.map(item => ({ value: item.id, label: `${item.name} · ${item.environment}` }))} onChange={selectConnection} /></label><span>只读查询 · 默认 100 行 · 最多 500 行</span></header>
    {!connections.length ? <div className="buildr-mysql-query-empty"><Empty description="请先添加 MySQL 连接" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div> :
      <ResizablePanels className="buildr-mysql-query-layout" direction="vertical" initialRatio={0.4} minFirst={160} minSecond={160} separatorLabel="调整上方查询与下方结果区域大小" storageKey={`buildr-mysql-editor-height:${layoutKey}`}
        first={<ResizablePanels className="buildr-mysql-query-top" initialSize={200} minFirst={130} minSecond={260} separatorLabel="调整数据库与编写查询区域大小" storageKey={`buildr-mysql-database-width:${layoutKey}`}
          first={<DatabaseResources key={`${layoutKey}:${connectionId}:${connection?.revision}`} databases={preferences.databases} visible={preferences.enabledDatabases} catalog={catalog} loading={preferences.loading} saving={preferences.saving} writable={preferences.writable} active={active} onVisible={preferences.enable} />}
          second={<section className="buildr-mysql-query-input" aria-label="编写查询"><div className="buildr-mysql-toolbar"><label>当前数据库<Select aria-label="当前数据库" showSearch disabled={!preferences.writable} loading={preferences.saving} value={database} options={[{ value: '', label: '未选择' }, ...databaseOptions.map(value => ({ value, label: value }))]} onChange={selectDatabase} /></label><RefreshButton label="刷新数据库列表" loading={preferences.loading} disabled={!active || !connection || preferences.saving} onClick={refreshDatabases} /><Button id="run-mysql-query" type="primary" icon={<PlayCircleOutlined />} loading={busy} disabled={!active || !connection || !sql.trim() || preferences.loading || preferences.saving} onClick={() => void run()}>{selection.from !== selection.to ? '运行选中' : '运行当前语句'}</Button><small>⌘ / Ctrl + Enter</small></div><SqlQueryEditor completion={completion} runningTarget={runningTarget} value={sql} busy={busy} onChange={setSql} onSelectionChange={setSelection} onRun={selected => void run(selected)} /></section>} />}
        second={<MySqlResults key={`${connectionId}:${database}`} result={result} notices={notices} active={active} />}
      />}
  </section>;
}
