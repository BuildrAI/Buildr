import { useState } from 'react';
import { Button, Input, Select } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
type Props = { disabled?: boolean; loading?: boolean; label: string; options: { value: string; label: string }[]; value?: string | string[] | null; multiple?: boolean; placeholder?: string; onChange: (value: string | string[]) => void; onCreate?: () => void; onOpen?: () => void };
/** A shared option picker: filter, create action, existing resources. */
export function CreatableResourceSelect({ disabled, loading, label, options, value, multiple, placeholder, onChange, onCreate, onOpen }: Props) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  return <Select disabled={disabled} loading={loading} showSearch={false} aria-label={label === '服务' ? '关联服务' : label} style={{ width: '100%' }} mode={multiple ? 'multiple' : undefined} value={value} placeholder={placeholder || `选择${label}`} onChange={next => { onChange(next); if (!multiple) { setQuery(''); setOpen(false); } }} open={open} onDropdownVisibleChange={next => { setOpen(next); if (next) onOpen?.(); }}
    options={options.filter(item => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))}
    dropdownRender={menu => <div className="resource-select-popup"><Input aria-label={`过滤${label}`} placeholder={`过滤${label}`} prefix={<SearchOutlined />} allowClear value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setOpen(false); }} />
      {onCreate && <Button className="resource-select-create" aria-label={`新增${label}`} type="text" block icon={<PlusOutlined />} onMouseDown={event => event.preventDefault()} onClick={() => { setOpen(false); setQuery(''); onCreate(); }}>新增{label}</Button>}{menu}</div>} />;
}
