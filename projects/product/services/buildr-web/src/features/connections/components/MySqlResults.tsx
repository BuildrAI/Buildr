import { useEffect, useState } from 'react';
import { App, Button, Empty, Table } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { copyText } from '../../../lib/copyText';
import type { MySqlQueryResult } from '../connection-types';
import { resultCell } from '../connection-form';

export type DisplayResult = MySqlQueryResult & { label: string; editorSql: string };
type Cell = { name: string; value: unknown };

export function MySqlResults({ result }: { result: DisplayResult | null }) {
  const [cell, setCell] = useState<Cell | null>(null);
  const { message } = App.useApp();
  useEffect(() => { setCell(null); }, [result]);
  async function copy() {
    if (!cell) return;
    if (await copyText(resultCell(cell.value))) message.success('已复制完整值。');
    else message.error('复制失败，可选择正文手动复制。');
  }
  return <section className="buildr-mysql-result" aria-label="查询结果">{result ? <>
    <header><strong id="mysql-query-row-count">{result.rowCount} 行</strong><span>{result.label}</span><span>{result.elapsedMs} ms</span>{result.limitReached && <span>已到本次 {result.rowLimit} 行限制，可调整条件或 OFFSET 继续查询。</span>}</header>
    <Table<unknown[]> id="mysql-query-results" size="small" rowKey={(_, index) => String(index)} tableLayout="fixed" columns={result.columns.map((column, index) => ({ title: column.name, key: String(index), dataIndex: index, width: 180, render: (value: unknown) => <button type="button" className={`buildr-mysql-cell${value === null ? ' buildr-mysql-null' : ''}`} aria-label={`查看完整值：${column.name}${value === null ? '（空值）' : ''}`} onClick={() => setCell({ name: column.name, value })}>{resultCell(value)}</button> }))} dataSource={result.rows} pagination={false} scroll={{ x: Math.max(650, result.columns.length * 180), y: 340 }} locale={{ emptyText: '没有匹配的数据' }} />
    <details><summary>实际执行语句</summary><p>执行时当前数据库：{result.database || '未选择'}</p><pre>{result.executedSql}</pre></details>
  </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="运行查询后查看数据" />}
  <DrawerShell open={Boolean(cell)} title="字段完整值" sub={cell ? `${cell.name}${cell.value === null ? ' · 空值（NULL）' : typeof cell.value === 'string' ? ' · 文本' : ''}` : ''} onClose={() => setCell(null)} closeAriaLabel="关闭字段完整值" rootClassName="buildr-mysql-cell-drawer" extra={<Button id="copy-mysql-cell" icon={<CopyOutlined />} onClick={() => void copy()}>复制完整值</Button>}><pre id="mysql-cell-full-value" className="buildr-mysql-full-value" aria-label="字段完整值">{cell ? resultCell(cell.value) : ''}</pre></DrawerShell>
  </section>;
}
