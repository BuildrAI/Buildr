import { useEffect, useRef, useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/** Keep the IME's in-progress text local; navigation only receives committed text. */
export function KnowledgeSearch({ value, label, onChange }: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  const published = useRef(value);
  useEffect(() => {
    if (composing.current) return;
    setDraft(value);
    published.current = value;
  }, [value]);
  const publish = (next: string) => {
    if (published.current === next) return;
    published.current = next;
    onChange(next);
  };
  return <Input prefix={<SearchOutlined />} value={draft} allowClear aria-label={label} placeholder="搜索标题或说明"
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={event => {
      composing.current = false;
      const next = event.currentTarget.value;
      setDraft(next);
      publish(next);
    }}
    onChange={event => {
      const next = event.target.value;
      setDraft(next);
      if (!composing.current && !(event.nativeEvent as InputEvent).isComposing) publish(next);
    }} />;
}
