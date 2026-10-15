import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Select, Table } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { SqlEditor } from './SqlEditor';
import { DatabaseList } from './DatabaseList';
import { connectionEndpoint, newQuery, schemaFor, simulateResult, sqlUsesExplicitDatabase, type Connection, type QueryResult } from './models';
export type DataEntry = { key: number; connectionId: string; database: string; sql?: string; result?: QueryResult; expanded: boolean; error?: string };
type Props = { connections: Connection[]; entry: DataEntry; onStateChange(state: string): void; onVisibleDatabases(connectionId: string, databases: string[]): void };
export function DataPage({ connections, entry, onStateChange, onVisibleDatabases }: Props) {
  const [connectionId, setConnectionId] = useState(entry.connectionId), [database, setDatabase] = useState(entry.database);
  const [sql, setSql] = useState(entry.sql || ''), [expanded, setExpanded] = useState(entry.expanded), [result, setResult] = useState(entry.result), [error, setError] = useState(entry.error || ''), [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), syncingEntry = useRef(false), tableHost = useRef<HTMLDivElement>(null), [tableHeight, setTableHeight] = useState(300);
  const connection = connections.find(item => item.id === connectionId), modified = Boolean(result && result.sql !== sql), qualified = sqlUsesExplicitDatabase(sql);
  function stop() { if (timer.current) clearTimeout(timer.current); timer.current = null; setBusy(false); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { syncingEntry.current = true; stop(); setConnectionId(entry.connectionId); setDatabase(entry.database); if (entry.sql !== undefined) setSql(entry.sql); setExpanded(entry.expanded); setResult(entry.result); setError(entry.error || ''); }, [entry.key]);
  useEffect(() => {
    if (syncingEntry.current) { syncingEntry.current = false; return; }
    if (connection && result && (result.target.connectionId !== connection.id || result.target.endpoint !== connectionEndpoint(connection) || result.target.environment !== connection.environment || result.target.revision !== connection.revision || !connection.databases.includes(result.target.database))) { stop(); setResult(undefined); setError('连接配置已变化，原结果已清除；请核对语句后运行。'); }
  }, [entry.key, connection, result]);
  useEffect(() => {
    const host = tableHost.current; if (!host) return;
    const measure = () => setTableHeight(Math.max(100, host.clientHeight - 39)); measure();
    const observer = new ResizeObserver(measure); observer.observe(host); return () => observer.disconnect();
  }, [result?.id]);
  function changeConnection(id: string) { const selected = connections.find(item => item.id === id); if (!selected) return; stop(); setConnectionId(id); setDatabase(selected.defaultDatabase || ''); setResult(undefined); setError(''); }
  function changeDatabase(db: string) { if (!qualified) { stop(); setResult(undefined); } setDatabase(db); setError(''); }
  function run(offset?: number) {
    if (!connection || busy || !sql.trim()) return;
    if (!connection.username) { setError('请先在连接页填写用户。'); return; }
    const query = { ...newQuery('data-preview', connection, database), sql };
    let next: QueryResult;
    try { next = simulateResult(query, 'human', connection.username, offset); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '查询未完成。'); return; }
    setBusy(true); setError('');
    timer.current = setTimeout(() => { timer.current = null; setBusy(false); setResult(next); }, 800);
  }
  useEffect(() => { onStateChange(error ? error.includes('500') ? 'over-limit' : 'error' : !result ? 'manual' : !result.rows.length ? 'empty' : result.offset > 0 ? 'page2' : result.limit === 500 ? 'limit500' : ''); }, [error, result, onStateChange]);
  const canPage = Boolean(result?.stableOrder && !modified && !busy && (qualified || result.target.defaultDatabase === database));
  return <section className="data-page"><header className="data-target" data-prototype-position="data-target"><label>连接<Select aria-label="选择连接" value={connectionId} options={connections.map(item => ({ value: item.id, label: `${item.name} · ${item.environment}` }))} onChange={changeConnection} /></label><Button onClick={() => setExpanded(value => !value)}>{expanded ? '收起查询语句' : '查询语句'}</Button></header>
    {expanded && <section className="data-query-layout" data-prototype-position="data-sql">{connection && <DatabaseList key={connection.id} connection={connection} current={database} onCurrent={changeDatabase} onVisible={values => onVisibleDatabases(connection.id, values)} />}<div className="data-sql-section"><div className="data-sql-toolbar"><label>当前数据库<Select aria-label="当前数据库" value={database} onChange={changeDatabase} options={[{ value: '', label: '未选择' }, ...(connection?.databases || []).map(value => ({ value, label: value }))]} /></label><Button type="primary" icon={<PlayCircleOutlined />} loading={busy} disabled={busy || !sql.trim()} onClick={() => run()}>运行</Button>{busy && <Button onClick={() => { stop(); setError('本次查询已取消，原有结果保持不变。'); }}>取消</Button>}<span>只读 · 默认 100 · 最多 500</span></div><SqlEditor id="data-sql" value={sql} readOnly={busy} canRun={!busy && Boolean(sql.trim())} onChange={setSql} onRun={() => run()} /></div></section>}
    {error && <Alert className="data-error" type="warning" showIcon message={error} />}{modified && <p className="data-modified">语句已修改，运行后更新结果。</p>}
    <section className="data-result" data-prototype-position="data-result">{result ? <><div className="data-result-heading"><strong>{result.rows.length} 行</strong><span>{result.target.environment} · {result.target.endpoint} / {result.target.database}</span><time>{result.at}</time></div><div className="data-result-table" ref={tableHost}><Table size="small" rowKey={(_, index) => String(index)} columns={(Object.keys(result.rows[0] || {}).length ? Object.keys(result.rows[0]) : schemaFor(result.target.database).columns).map(column => ({ title: column, dataIndex: column, width: column === 'updated_at' ? 180 : 155, render: (value: unknown) => value === null ? <span className="connections-null">NULL</span> : String(value) }))} dataSource={result.rows} pagination={false} scroll={{ x: 790, y: tableHeight }} locale={{ emptyText: '没有匹配的数据' }} /></div><div className="data-result-footer" data-prototype-position="data-range"><span>{result.rows.length ? `${result.offset + 1}–${result.offset + result.rows.length} 行` : '0 行'} · 每页 {result.limit}</span><Button size="small" disabled={!canPage || result.offset === 0} onClick={() => run(Math.max(0, result.offset - result.limit))}>上一页</Button><Button size="small" disabled={!canPage || result.rows.length < result.limit} onClick={() => run(result.offset + result.limit)}>下一页</Button><small>{result.defaultApplied ? '未设 LIMIT，实际补充 100。' : ''}{result.rows.length === result.limit ? '已到本次限制，是否更多尚未查询。' : ''}{!result.stableOrder ? '继续分页需要明确的稳定排序。' : ''}</small></div><details className="data-executed-sql"><summary>查看实际执行语句</summary><p>执行时当前数据库：{result.target.defaultDatabase || '未选择'}；实际使用：{result.target.database}</p><pre>{result.actualSql}</pre></details></> : <div className="data-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="运行查询后查看数据" /></div>}</section>
  </section>;
}
