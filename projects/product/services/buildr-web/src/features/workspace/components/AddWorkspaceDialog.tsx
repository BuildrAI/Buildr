import { useEffect, useRef, useState } from 'react';
import { workspacePreparationApi, type WorkspacePreparation } from '../api/workspace-preparation-api';
import { AddWorkspaceDialogView } from './AddWorkspaceDialogView';

const storageKey = 'buildr.workspace-preparation';
type Props = {
  open: boolean;
  onClose(): void;
  onSettled(value: WorkspacePreparation): void;
  onProgress(value: WorkspacePreparation | null): void;
  incoming?: WorkspacePreparation | null;
};

export function AddWorkspaceDialog({ open, onClose, onSettled, onProgress, incoming }: Props) {
  const [value, setValue] = useState<WorkspacePreparation | null>(null);
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true), latest = useRef<WorkspacePreparation | null>(null), choosing = useRef(false);
  const generation = useRef(0), starting = useRef(false);
  const callbacks = useRef({ onClose, onSettled, onProgress, incoming });
  callbacks.current = { onClose, onSettled, onProgress, incoming };
  const settled = useRef('');
  const accept = (next: WorkspacePreparation) => {
    if (!mounted.current || latest.current?.id === next.id && latest.current.revision >= next.revision) return;
    latest.current = next;
    setValue(next); setName(next.name); setError('');
    callbacks.current.onProgress(next);
    try {
      if (next.status === 'preparing') localStorage.setItem(storageKey, next.id);
      else if (localStorage.getItem(storageKey) === next.id) localStorage.removeItem(storageKey);
    } catch { /* Browser storage is only a hint for unfinished work. */ }
    if (next.status !== 'ready' && next.status !== 'failed') return;
    const identity = `${next.id}:${next.revision}`;
    if (settled.current === identity) return;
    settled.current = identity;
    callbacks.current.onSettled(next);
    if (next.status === 'ready') callbacks.current.onClose();
  };

  useEffect(() => {
    mounted.current = true;
    try {
      const id = localStorage.getItem(storageKey);
      if (id) void workspacePreparationApi.inspect(id).then(next => {
        if (!mounted.current || callbacks.current.incoming || latest.current || choosing.current) return;
        if (next.status === 'preparing') accept(next);
        else localStorage.removeItem(storageKey);
      }).catch(() => {});
    } catch { /* A missing hint does not prevent adding a directory. */ }
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (incoming) accept(incoming);
  }, [incoming]);

  useEffect(() => {
    if (!open || incoming) return;
    if (latest.current?.status === 'preparing' || starting.current) return;
    generation.current++;
    latest.current = null;
    setValue(null); setName(''); setError('');
    callbacks.current.onProgress(null);
  }, [open, incoming]);

  useEffect(() => {
    if (value?.status !== 'preparing') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await workspacePreparationApi.inspect(value.id);
        if (active) accept(next);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : '暂时无法读取准备状态。'); }
      if (active && latest.current?.status === 'preparing') timer = setTimeout(() => void poll(), 1000);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [value?.id, value?.status]);

  const choose = async () => {
    if (choosing.current || busy) return;
    const observedGeneration = generation.current;
    choosing.current = true; setBusy(true); setError('');
    try { const next = await workspacePreparationApi.choose(); if (generation.current === observedGeneration && !('canceled' in next)) accept(next); }
    catch (reason) { if (mounted.current && generation.current === observedGeneration) setError(reason instanceof Error ? reason.message : '目录选择失败。'); }
    finally { choosing.current = false; if (mounted.current) setBusy(false); }
  };
  const prepare = async () => {
    if (!value || busy || !name.trim() || value.status === 'preparing') return;
    starting.current = true; setBusy(true); setError('');
    try { localStorage.setItem(storageKey, value.id); } catch { /* Resume is verified against the server, never this hint alone. */ }
    try { accept(await workspacePreparationApi.prepare(value, name.trim(), Boolean(value.customizations?.length))); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '准备尚未开始，请重试。'); }
    finally { starting.current = false; if (mounted.current) setBusy(false); }
  };
  return <AddWorkspaceDialogView open={open} value={value} name={name} busy={busy} error={error} mode={incoming ? 'prepare' : 'add'}
    onName={setName} onChoose={() => void choose()} onConfirm={() => void prepare()} onClose={onClose} />;
}
