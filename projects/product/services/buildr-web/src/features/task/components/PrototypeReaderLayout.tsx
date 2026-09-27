import type { ReactNode } from 'react';
import { Button } from 'antd';
import { prototypeSourceLabel, type PrototypeEntry } from './prototype-content';
import './prototype-reader.css';

type Props = { entries: PrototypeEntry[]; selectedKey?: string; multipleFiles?: boolean; onSelect(key: string): void; children: ReactNode };

/** Shared navigation for the task's standalone reader and offline previews. */
export function PrototypeReaderLayout({ entries, selectedKey, multipleFiles = false, onSelect, children }: Props) {
  return <main className="prototype-standalone"><nav aria-label="原型页面列表"><h1>界面原型</h1>{entries.map(entry => <Button key={entry.key} type={entry.key === selectedKey ? 'primary' : 'text'} onClick={() => onSelect(entry.key)}>{entry.scene.title}{multipleFiles && <small>{prototypeSourceLabel(entry.file)}</small>}</Button>)}</nav>{children}</main>;
}
