import { useState } from 'react';
import { Button, Input, Select } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
type Props = { label: string; options: { value: string; label: string }[]; value?: string | string[]; multiple?: boolean; placeholder?: string; onChange: (value: string | string[]) => void; onCreate?: () => void };
/** A shared option picker: filter, create action, existing resources. */
export function CreatableResourceSelect({ label, options, value, multiple, placeholder, onChange, onCreate }: Props) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  return <Select showSearch={false} aria-label={label === '服务' ? '关联服务' : label} style={{ width: '100%' }} mode={multiple ? 'multiple' : undefined} value={value} placeholder={placeholder || `选择${label}`} onChange={onChange} open={open} onDropdownVisibleChange={setOpen}
    options={options.filter(item => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))}
    dropdownRender={menu => <div className="resource-select-popup"><Input aria-label={`过滤${label}`} placeholder={`过滤${label}`} prefix={<SearchOutlined />} allowClear value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setOpen(false); }} />
      {onCreate && <Button className="resource-select-create" aria-label={`新增${label}`} type="text" block icon={<PlusOutlined />} onMouseDown={event => event.preventDefault()} onClick={() => { setOpen(false); setQuery(''); onCreate(); }}>新增{label}</Button>}{menu}</div>} />;
}
