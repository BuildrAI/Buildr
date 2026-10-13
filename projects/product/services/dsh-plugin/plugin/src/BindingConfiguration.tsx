/** A narrow maintainer form rendered by the official Plugins row configuration seat. */
import { useEffect, useRef, useState } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { BindingMaintenanceView, BindingMaintenanceUpdate, MaintainerBinding } from './types.ts';
import styles from './styles.module.css';

export interface BindingConfigurationRemote {
  bindingView(): Promise<{ ok: boolean; value: BindingMaintenanceView }>;
  updateBinding(request: BindingMaintenanceUpdate): Promise<{ ok: boolean; value: BindingMaintenanceView }>;
}
export interface BindingConfigurationInjected { entryId: string; remote(): BindingConfigurationRemote | undefined }
type Props = PropsRuntime<'plugins.row.config'> & InjectFace<BindingConfigurationInjected> & PropsLocale<'buildr' | 'buildr-dev'>;
const empty = { nodeExecutable: '', cliEntry: '', nodeSha256: '', cliSha256: '' };
const REMOTE_TIMEOUT_MS = 10_000;
/** A lost namespace reply is uncertain; ending the wait must never resend its write. */
async function boundedRemote<T>(invoke: () => Promise<T> | undefined): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(invoke), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('binding-remote-timeout')), REMOTE_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

export function BindingConfiguration(props: Props) {
  const [view, setView] = useState<BindingMaintenanceView>();
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [backup, setBackup] = useState<MaintainerBinding | null | undefined>();
  const operation = useRef({ id: 0, busy: false, mounted: true });
  useEffect(() => {
    operation.current.mounted = true;
    return () => { operation.current.mounted = false; operation.current.id++; };
  }, []);
  const begin = () => {
    if (operation.current.busy || !operation.current.mounted) return undefined;
    operation.current.busy = true;
    const id = ++operation.current.id;
    setBusy(true); setMessage('');
    return id;
  };
  const current = (id: number) => operation.current.mounted && operation.current.id === id;
  const finish = (id: number) => { if (current(id)) { operation.current.busy = false; setBusy(false); } };
  const storageKey = 'buildr.maintainer-binding-backup.v1.' + props.entryId;
  const accept = (value: BindingMaintenanceView) => { setView(value); setDraft({ ...empty, ...value.binding }); };
  const remember = (value: BindingMaintenanceView) => {
    if (backup !== undefined) return;
    let original = value.binding;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) original = JSON.parse(saved).binding as MaintainerBinding | null;
      else sessionStorage.setItem(storageKey, JSON.stringify({ binding: original }));
    } catch { /* A live page still keeps its original value without browser storage. */ }
    setBackup(original);
  };
  const read = async () => {
    const id = begin(); if (id === undefined) return;
    try {
      const result = await boundedRemote(() => props.remote()?.bindingView());
      if (!current(id)) return;
      if (!result?.ok) throw new Error('binding-read-failed');
      remember(result.value); accept(result.value);
    } catch { if (current(id)) setMessage(props.t('bindingReadFailed')); }
    finally { finish(id); }
  };
  const write = async (value: MaintainerBinding | null, restoring = false) => {
    if (!view) return;
    const id = begin(); if (id === undefined) return;
    try {
      const result = await boundedRemote(() => props.remote()?.updateBinding({ binding: value, expectedRevision: view.revision }));
      if (!current(id)) return;
      if (!result?.ok) throw new Error('binding-save-unconfirmed');
      accept(result.value);
      if (restoring) { try { sessionStorage.removeItem(storageKey); } catch {} setBackup(undefined); }
      setMessage(props.t('bindingSaved'));
    } catch { if (current(id)) setMessage(props.t('bindingSaveUnconfirmed')); }
    finally { finish(id); }
  };
  if (props.view === 'summary') return <>{props.t('bindingSummary')}</>;
  const labels = { nodeExecutable: 'bindingNode', cliEntry: 'bindingCli', nodeSha256: 'bindingNodeDigest', cliSha256: 'bindingCliDigest' } as const;
  return <details className={styles.bindingConfiguration} onToggle={event => {
    if (event.currentTarget.open && !view && !busy) void read();
  }}>
    <summary>{props.t('bindingMaintainer')}</summary>
    <p>{props.t('bindingHint')}</p>
    {view && <form onSubmit={event => {
      event.preventDefault();
      const value: MaintainerBinding = { nodeExecutable: draft.nodeExecutable, cliEntry: draft.cliEntry,
        ...(draft.nodeSha256 ? { nodeSha256: draft.nodeSha256 } : {}), ...(draft.cliSha256 ? { cliSha256: draft.cliSha256 } : {}) };
      void write(value);
    }}>
      {Object.entries(labels).map(([key, label]) => <label key={key}>{props.t(label)}<input
        autoComplete="off" spellCheck={false} disabled={busy} value={draft[key as keyof typeof empty]}
        onChange={event => { const value = event.currentTarget.value; setDraft(current => ({ ...current, [key]: value })); }} /></label>)}
      <div className={styles.bindingActions}>
        <button type="submit" disabled={busy}>{props.t('bindingSave')}</button>
        <button type="button" disabled={busy || backup === undefined} onClick={() => { if (backup !== undefined) void write(backup, true); }}>{props.t('bindingRestore')}</button>
        <button type="button" disabled={busy} onClick={() => { void write(null); }}>{props.t('bindingAuto')}</button>
      </div>
    </form>}
    <button type="button" disabled={busy} onClick={() => { void read(); }}>{props.t('bindingRead')}</button>
    {message && <p role="status">{message}</p>}
  </details>;
}
