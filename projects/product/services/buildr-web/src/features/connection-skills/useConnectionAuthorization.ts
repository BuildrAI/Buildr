import { useEffect, useRef, useState } from 'react';
import type { ConnectionSkillsClient } from './api/connection-skills-api';
import type { CatalogEntry, ConnectionInstance } from './connection-skill-types';
import { createDraftRequestScope, draftObservations } from './connection-skill-form';

type Props = {
  entry?: CatalogEntry; instance?: ConnectionInstance; client: ConnectionSkillsClient; active: boolean; dirty: boolean;
  expected: { teamRevision: string; definitionRevision: string; localRevision: string };
  saveShell(): Promise<ConnectionInstance | undefined>; onAuthorized(instance: ConnectionInstance): void;
  onError(cause: unknown): void; onNotice(message: string): void;
};

export function useConnectionAuthorization({ entry, instance, client, active, dirty, expected, saveShell, onAuthorized, onError, onNotice }: Props) {
  const [authorizing, setAuthorizing] = useState(false), requests = useRef(createDraftRequestScope()).current;
  const mounted = useRef(true), pending = useRef(false);
  const latest = useRef({ active }); latest.current = { active };
  function cancel(silent = true) {
    requests.invalidate();
    const wasPending = pending.current; pending.current = false;
    if (mounted.current) { setAuthorizing(false); if (wasPending && !silent) onNotice('本次授权已取消。可重新读取当前账号状态后继续。'); }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requests.invalidate(); pending.current = false; }; }, [requests]);
  useEffect(() => () => cancel(), [client, entry?.revision, entry?.enabled, entry?.available]);
  useEffect(() => { if (!active) cancel(); }, [active]);
  async function authorize() {
    if (!active || pending.current || !entry?.definition.authentication.authorization) return;
    if (instance && dirty) { onNotice('连接配置有未保存修改，请先保存配置，再授权。'); return; }
    const request = requests.begin(); pending.current = true; setAuthorizing(true); onNotice('');
    let shellSaved = false;
    const current = () => mounted.current && latest.current.active && request.isCurrent();
    try {
      const selected = instance || await saveShell();
      if (!current() || !selected) return;
      shellSaved = !instance;
      const response = await client.authorizePersonal(selected.id, { expected: instance ? expected : draftObservations(selected).personal }, request.signal);
      if (!current()) return;
      if (response.status !== 'success' || response.instance.id !== selected.id) throw new Error('授权结果与当前连接不符，请重新读取后核对。');
      onAuthorized(response.instance); onNotice(['本机个人账号已授权；可继续读取并保存使用范围。', ...(response.warnings || [])].join(' '));
    } catch (cause) {
      if (!current()) return;
      onError(cause);
      if ((cause as { code?: string }).code === 'connection_skill_authorization_persistence_unconfirmed') onNotice('新账号的保存结果尚待核验，请重新读取当前状态，暂不重复授权。');
      else if (shellSaved) onNotice('连接配置已保存；本次授权未完成，可保留连接后重试。');
    } finally { if (current()) { pending.current = false; setAuthorizing(false); } }
  }
  return { authorizing, authorize, cancel };
}
