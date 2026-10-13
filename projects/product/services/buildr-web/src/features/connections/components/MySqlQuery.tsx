import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Select, Table } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { RefreshButton } from '../../../components/RefreshButton';
import type { ConnectionClient } from '../api/connection-api';
import type { MySqlConnection, MySqlQueryResult } from '../connection-types';
import { resultCell } from '../connection-form';
import { DatabaseResources } from './DatabaseResources';
import { SqlQueryEditor } from './SqlQueryEditor';

type Props = { connections: MySqlConnection[]; client: ConnectionClient; entry: { id: string; nonce: number } | null; active: boolean };
type DisplayResult = MySqlQueryResult & { label: string };

export function MySqlQuery({ connections, client, entry, active }: Props) {
  const [connectionId, setConnectionId] = useState(''), [database, setDatabase] = useState(''), [sql, setSql] = useState('');
  const [databases, setDatabases] = useState<string[]>([]), [loadingDatabases, setLoadingDatabases] = useState(false), [databaseError, setDatabaseError] = useState(''), [refresh, setRefresh] = useState(0);
  const [visibleByConnection, setVisibleByConnection] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<DisplayResult | null>(null);
  const request = useRef<{ serial: number; controller?: AbortController }>({ serial: 0 });
  const observedTarget = useRef('');
  const connection = connections.find(item => item.id === connectionId);
  const visible = (visibleByConnection[connectionId] || databases).filter(value => databases.includes(value));
  function clearResult() { request.current.controller?.abort(); request.current.serial++; setBusy(false); setResult(null); setError(''); }
  function selectConnection(id: string) { clearResult(); setConnectionId(id); setDatabase(connections.find(item => item.id === id)?.config.defaultDatabase || ''); }
  function selectDatabase(value: string) { if (value === database) return; clearResult(); setDatabase(value); }
  useEffect(() => {
    if (!entry) return;
    const selected = connections.find(item => item.id === entry.id);
    if (selected) { selectConnection(selected.id); setSql(''); }
  }, [entry?.nonce]);
  useEffect(() => {
    if (!connectionId && connections[0]) selectConnection(connections[0].id);
    if (connectionId && !connection) { clearResult(); setConnectionId(''); setDatabase(''); }
  }, [connections, connectionId]);
  useEffect(() => {
    if (!active) return;
    const target = connection ? `${connection.id}:${connection.revision}` : '';
    if (observedTarget.current !== target) { observedTarget.current = target; clearResult(); setDatabases([]); }
    setDatabaseError('');
    if (!connection) { setLoadingDatabases(false); return; }
    const controller = new AbortController(); setLoadingDatabases(true);
    void client.databases(connection.id, controller.signal).then(response => { if (!controller.signal.aborted) setDatabases(response.databases); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setDatabaseError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDatabases(false); });
    return () => controller.abort();
  }, [client, connectionId, connection?.revision, refresh, active]);
  useEffect(() => () => { request.current.controller?.abort(); request.current.serial++; }, []);
  async function run() {
    if (!connection || !sql.trim() || busy) return;
    request.current.controller?.abort();
    const serial = ++request.current.serial, controller = new AbortController(); request.current.controller = controller;
    setBusy(true); setError('');
    try {
      const response = await client.query(connection.id, { sql, database: database || null }, controller.signal);
      if (serial === request.current.serial && !controller.signal.aborted) setResult({ ...response, label: `${connection.name} · ${connection.environment}` });
    } catch (cause) { if (serial === request.current.serial && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : '查询失败。'); }
    finally { if (serial === request.current.serial) setBusy(false); }
  }
  const databaseOptions = [...new Set([...databases, ...(database ? [database] : [])])];
  return <section className="buildr-mysql-query" aria-label="MySQL 查询">
    <header className="buildr-mysql-target"><label>连接<Select aria-label="选择连接" value={connectionId || undefined} placeholder="选择 MySQL 连接" options={connections.map(item => ({ value: item.id, label: `${item.name} · ${item.environment}` }))} onChange={selectConnection} /></label><span>只读查询 · 默认 100 行 · 最多 500 行</span></header>
    {!connections.length ? <Empty description="请先添加 MySQL 连接" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : <>
      <div className="buildr-mysql-query-layout"><DatabaseResources key={connectionId} databases={databases} visible={visible} current={database} loading={loadingDatabases} active={active} onCurrent={selectDatabase} onVisible={values => setVisibleByConnection(previous => ({ ...previous, [connectionId]: values }))} />
        <section className="buildr-mysql-query-input"><div className="buildr-mysql-toolbar"><label>当前数据库<Select aria-label="当前数据库" showSearch value={database} options={[{ value: '', label: '未选择' }, ...databaseOptions.map(value => ({ value, label: value }))]} onChange={selectDatabase} /></label><RefreshButton label="刷新数据库列表" loading={loadingDatabases} disabled={!connection} onClick={() => setRefresh(value => value + 1)} /><Button id="run-mysql-query" type="primary" icon={<PlayCircleOutlined />} loading={busy} disabled={!connection || !sql.trim()} onClick={() => void run()}>运行</Button><small>⌘ / Ctrl + Enter</small></div><SqlQueryEditor value={sql} busy={busy} onChange={setSql} onRun={() => void run()} /></section>
      </div>
      {databaseError && <Alert type="warning" showIcon message={`数据库列表读取失败：${databaseError}`} />}
      {error && <Alert id="mysql-query-error" type="error" showIcon message={error} />}
      {result && result.submittedSql !== sql && <p className="buildr-connections-muted">语句已修改，运行后更新结果。</p>}
      <section className="buildr-mysql-result" aria-label="查询结果">{result ? <><header><strong id="mysql-query-row-count">{result.rowCount} 行</strong><span>{result.label}</span><span>{result.elapsedMs} ms</span>{result.limitReached && <span>已到本次 {result.rowLimit} 行限制，可调整条件或 OFFSET 继续查询。</span>}</header><Table<unknown[]> id="mysql-query-results" size="small" rowKey={(_, index) => String(index)} columns={result.columns.map((column, index) => ({ title: column.name, key: String(index), dataIndex: index, width: 180, render: (value: unknown) => <span className={value === null ? 'buildr-mysql-null' : undefined}>{resultCell(value)}</span> }))} dataSource={result.rows} pagination={false} scroll={{ x: Math.max(650, result.columns.length * 180), y: 340 }} locale={{ emptyText: '没有匹配的数据' }} /><details><summary>实际执行语句</summary><p>执行时当前数据库：{result.database || '未选择'}</p><pre>{result.executedSql}</pre></details></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="运行查询后查看数据" />}</section>
    </>}
  </section>;
}
