import { Button, Dropdown, Input } from 'antd';
import { DownOutlined, SearchOutlined } from '@ant-design/icons';
import './scoped-search.css';

/** Presents an input and a scope picker; the caller alone decides when to query. */
export function ScopedSearch<T extends string>({ label, placeholder, query, onQueryChange, scopeLabel, scope, options, onScopeChange, iconOnly = false }: {
  label: string; placeholder: string; query: string; onQueryChange(value: string): void;
  scopeLabel: string; scope: T; options: {value: T; label: string}[]; onScopeChange(value: T): void; iconOnly?: boolean;
}) {
  const current = options.find(option => option.value === scope)?.label;
  return <Input className="scoped-search" aria-label={label} placeholder={placeholder} allowClear prefix={<SearchOutlined />} value={query}
    onChange={event => onQueryChange(event.target.value)}
    suffix={<span className={'scoped-search-picker' + (iconOnly ? ' is-icon-only' : '')} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <Dropdown trigger={['click']} placement="bottomRight" menu={{
        items: options.map(option => ({ key: `scope:${option.value}`, label: option.label })),
        selectable: true, selectedKeys: [`scope:${scope}`],
        onClick: ({ key }) => {
          const option = options.find(item => `scope:${item.value}` === key);
          if (option && option.value !== scope) onScopeChange(option.value);
        },
      }}>
        <Button type="text" size="small" aria-haspopup="menu" aria-label={current ? `${scopeLabel}：${current}` : scopeLabel}>
          {!iconOnly && <span className="scoped-search-label">{current}</span>}<DownOutlined aria-hidden="true" />
        </Button>
      </Dropdown>
    </span>} />;
}
