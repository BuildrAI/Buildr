import { useState } from 'react';
import { Button, Empty, Input, Tag } from 'antd';
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import type { CatalogEntry } from '../connection-skill-types';
import { bindingFor, bindingKey, connectionSystems } from '../connection-skill-form';

type Props = { entries: CatalogEntry[]; disabled: boolean; onSelect(entry: CatalogEntry): void };

export function ConnectionSystemPicker({ entries, disabled, onSelect }: Props) {
  const [query, setQuery] = useState(''), [selectedSystem, setSelectedSystem] = useState('');
  const systems = connectionSystems(entries), current = systems.find(system => system.key === selectedSystem);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = systems.filter(system => `${system.categoryLabel} ${system.name} ${system.entries.map(entry => entry.definition.description).join(' ')}`.toLocaleLowerCase().includes(needle));
  const categories = [...new Set(filtered.map(system => system.category))];
  if (current) return <div className="buildr-connection-system-picker" id="connection-system-methods">
    <Button type="text" icon={<ArrowLeftOutlined />} disabled={disabled} onClick={() => setSelectedSystem('')}>返回选择连接</Button>
    <div><h3>{current.name} · 选择接入方式</h3><p className="buildr-connection-skill-muted">此系统有多种接入方式，请明确选择本次使用的一种。</p></div>
    {current.entries.map(entry => <button type="button" className="buildr-connection-system-card" key={bindingKey(bindingFor(entry))} disabled={disabled} onClick={() => onSelect(entry)}>
      <strong>{entry.definition.presentation?.methodLabel || entry.definition.name}</strong><span>{entry.definition.description}</span><small>{entry.skill.sourceIdentity}</small>
    </button>)}
  </div>;
  return <div className="buildr-connection-system-picker" id="connection-system-picker">
    <p className="buildr-connection-skill-muted">选择要连接的系统，再填写地址和账号。</p>
    <Input id="connection-system-search" allowClear prefix={<SearchOutlined />} placeholder="搜索连接系统" value={query} onChange={event => setQuery(event.target.value)} />
    {categories.map(category => <section key={category} className="buildr-connection-system-category"><h3>{filtered.find(system => system.category === category)?.categoryLabel}</h3><div className="buildr-connection-system-grid">
      {filtered.filter(system => system.category === category).map(system => <button type="button" id={`connection-system-${encodeURIComponent(system.key)}`} data-connection-system={system.key} className="buildr-connection-system-card" key={system.key} disabled={disabled} onClick={() => system.entries.length === 1 ? onSelect(system.entries[0]) : setSelectedSystem(system.key)}>
        <strong>{system.name}</strong><span>{system.entries.length === 1 ? system.entries[0].definition.description : `${system.entries.length} 种接入方式`}</span>{system.entries.length > 1 && <Tag>{system.entries.length} 种方式</Tag>}
      </button>)}
    </div></section>)}
    {!filtered.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的已启用连接" />}
  </div>;
}
