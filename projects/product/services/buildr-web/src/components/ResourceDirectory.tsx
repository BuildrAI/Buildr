import { useState, type ReactNode, type HTMLAttributes } from 'react';
import { useResourcePreview } from '../app/resource-preview';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Input, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';

type Props<T extends object> = {
  title: string; description: string; noun: string; data: T[]; loading?: boolean; error?: string;
  rowKey: (item: T) => string; name: (item: T) => string; summary: (item: T) => string;
  href: (item: T) => string; onOpen: (item: T) => void; onEdit: (item: T) => void;
  onRefresh?: () => void; refreshing?: boolean;
  columns?: ColumnsType<T>; actions?: ReactNode; notice?: ReactNode; filters?: ReactNode;
  searchText?: (item: T) => string; query?: string; onQueryChange?: (query: string) => void;
  searchId?: string; tableId?: string; bodyId?: string; countId?: string; listId?: string;
  editDisabled?: boolean; total?: number; rowAttributes?: (item: T) => HTMLAttributes<HTMLTableRowElement>;
};

/** Resource directories share one visual and interaction contract; callers supply business fields. */
export function ResourceDirectory<T extends object>(props: Props<T>) {
  const previews = useResourcePreview(), location = useLocation();
  const [localQuery, setLocalQuery] = useState('');
  const query = props.query ?? localQuery;
  const setQuery = props.onQueryChange ?? setLocalQuery;
  const rows = props.data.filter(item => (props.searchText?.(item) ?? `${props.name(item)} ${props.summary(item)}`).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const columns: ColumnsType<T> = [
    { title: `${props.noun} / 说明`, key: 'name', width: 320, render: (_, item) => <div className="resource-name"><Link to={props.href(item)}>{props.name(item)}</Link><span>{props.summary(item) || '尚未填写说明'}</span></div> },
    ...(props.columns ?? []),
    { title: '操作', key: 'actions', width: 88, fixed: 'right', align: 'right', render: (_, item) => <Button type="link" disabled={props.editDisabled} onClick={event => { event.stopPropagation(); props.onEdit(item); }}>编辑</Button> },
  ];
  return <section className="resource-directory">
    <header className="resource-directory-head"><div><p className="resource-eyebrow">工作空间</p><h1>{props.title}</h1><p>{props.description}</p></div><div className="resource-directory-actions">{props.onRefresh && <Button icon={<ReloadOutlined />} aria-label={`刷新${props.noun}`} title={`刷新${props.noun}`} loading={props.refreshing ?? props.loading} onClick={props.onRefresh} />}{props.actions}</div></header>
    {props.notice}
    <div className="resource-directory-tools"><Input id={props.searchId} aria-label={`搜索${props.noun}`} placeholder={`搜索${props.noun}名称、标识或说明`} prefix={<SearchOutlined />} allowClear value={query} onChange={event => setQuery(event.target.value)} /><div className="resource-directory-filters">{props.filters}</div><span className="resource-directory-count" id={props.countId}>{props.loading ? '正在读取' : `${rows.length}${query || props.total !== undefined && props.total !== rows.length ? ` / ${props.total ?? props.data.length}` : ''} 个${props.noun}`}</span></div>
    {props.error ? <Alert showIcon type="error" message={props.error} /> : <div className="resource-directory-table" id={props.listId}><div id={props.tableId}>
      <Table<T> rowKey={props.rowKey} columns={columns} dataSource={rows} loading={props.loading} pagination={false} tableLayout="fixed" scroll={{ x: 408 + (props.columns ?? []).reduce((width, column) => width + (typeof column.width === 'number' ? column.width : 160), 0) }}
        locale={{ emptyText: props.loading ? <span className="resource-empty-copy">正在读取…</span> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? '没有匹配的结果' : `还没有${props.noun}`} >{query && <Button onClick={() => setQuery('')}>清除搜索</Button>}</Empty> }}
        components={props.bodyId ? { body: { wrapper: (attributes: HTMLAttributes<HTMLTableSectionElement>) => <tbody id={props.bodyId} {...attributes} /> } } : undefined}
        onRow={item => ({ ...props.rowAttributes?.(item), onClick: event => { if (!(event.target as HTMLElement).closest('a,button,input,select')) { if (!previews?.open(location.pathname, props.href(item))) props.onOpen(item); } }, className: 'resource-directory-row' })} />
    </div></div>}
  </section>;
}
