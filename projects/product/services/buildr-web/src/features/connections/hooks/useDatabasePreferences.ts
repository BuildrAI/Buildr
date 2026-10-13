import { useEffect, useRef, useState } from 'react';
import type { ApiError } from '../../../api/client';
import type { ConnectionClient } from '../api/connection-api';
import type { MySqlConnection, QueryPreferences } from '../connection-types';
import { databasePreferenceView } from '../database-preferences';

type Snapshot = { client: ConnectionClient; target: string; databases: string[]; preferences: QueryPreferences | null; databaseError: string; preferenceError: string; loading: boolean };

export function useDatabasePreferences(client: ConnectionClient, connection: MySqlConnection | undefined, active: boolean) {
  const target = connection ? `${connection.id}:${connection.revision}` : '';
  const [refresh, setRefresh] = useState(0), [snapshot, setSnapshot] = useState<Snapshot | null>(null), [saving, setSaving] = useState(false);
  const requests = useRef<{ serial: number; mutation?: AbortController }>({ serial: 0 });
  const current = snapshot?.client === client && snapshot.target === target ? snapshot : null;
  const preferences = current?.preferences ?? null;
  const databases = current?.databases ?? [];
  const view = databasePreferenceView(preferences, databases);
  const loading = Boolean(connection) && (!current || current.loading);
  const writable = Boolean(active && current && !current.loading && current.preferences && !current.databaseError && !saving);

  useEffect(() => {
    if (!active) return;
    const serial = ++requests.current.serial, controller = new AbortController();
    requests.current.mutation?.abort(); setSaving(false);
    // A refresh can disable editing without temporarily changing the confirmed query target.
    const observed = snapshot?.client === client && snapshot.target === target ? snapshot : null;
    setSnapshot(observed ? { ...observed, loading: Boolean(connection) } : { client, target, databases: [], preferences: null, databaseError: '', preferenceError: '', loading: Boolean(connection) });
    if (connection) void (async () => {
      const [databaseResult, preferenceResult] = await Promise.allSettled([client.databases(connection.id, controller.signal), client.queryPreferences(connection.id, controller.signal)]);
      if (controller.signal.aborted || serial !== requests.current.serial) return;
      const next: Snapshot = {
        client, target, loading: false,
        databases: databaseResult.status === 'fulfilled' ? databaseResult.value.databases : observed?.databases ?? [],
        preferences: preferenceResult.status === 'fulfilled' ? preferenceResult.value : observed?.preferences ?? null,
        databaseError: databaseResult.status === 'rejected' ? (databaseResult.reason as Error).message : '',
        preferenceError: preferenceResult.status === 'rejected' ? (preferenceResult.reason as Error).message : '',
      };
      setSnapshot(next);
      // A confirmed disappearance clears the saved current database. Discovery failure is not disappearance.
      if (!next.databaseError && preferenceResult.status === 'fulfilled' && next.preferences?.currentDatabase && !databasePreferenceView(next.preferences, next.databases).currentDatabase) {
        await save(next, next.preferences.enabledDatabases, null, serial);
      }
    })();
    return () => { controller.abort(); requests.current.mutation?.abort(); requests.current.serial++; };
  }, [client, target, active, refresh]);

  async function save(observed: Snapshot, enabledDatabases: string[], currentDatabase: string | null, serial: number) {
    if (!connection || !observed.preferences || requests.current.mutation && !requests.current.mutation.signal.aborted) return;
    const controller = new AbortController(); requests.current.mutation = controller; setSaving(true);
    const valid = () => !controller.signal.aborted && serial === requests.current.serial;
    try {
      const next = await client.saveQueryPreferences(connection.id, { enabledDatabases, currentDatabase, expectedRevision: observed.preferences.revision }, controller.signal);
      if (valid()) setSnapshot(previous => previous?.client === observed.client && previous.target === observed.target ? { ...previous, preferences: next, preferenceError: '' } : previous);
    } catch (cause) {
      if (!valid()) return;
      let error = cause instanceof Error ? cause.message : '数据库选择保存失败。';
      if ((cause as ApiError).code === 'connection_query_preferences_revision_conflict') {
        try {
          const latest = await client.queryPreferences(connection.id, controller.signal);
          if (!valid()) return;
          setSnapshot(previous => previous?.client === observed.client && previous.target === observed.target ? { ...previous, preferences: latest } : previous);
          error = '数据库选择已被其他操作修改，已重新读取，请重新选择。';
        } catch (readCause) { error = `数据库选择存在冲突，重新读取失败：${readCause instanceof Error ? readCause.message : '请刷新重试。'}`; }
      }
      if (valid()) setSnapshot(previous => previous?.client === observed.client && previous.target === observed.target ? { ...previous, preferenceError: error } : previous);
    } finally {
      if (valid()) setSaving(false);
      if (requests.current.mutation === controller) requests.current.mutation = undefined;
    }
  }
  function apply(enabledDatabases: string[], currentDatabase: string | null) {
    if (!writable || !current) return;
    void save(current, enabledDatabases, currentDatabase, requests.current.serial);
  }
  return {
    databases, enabledDatabases: view.enabledDatabases, currentDatabase: view.currentDatabase || '', loading, saving, writable,
    databaseError: current?.databaseError || '', preferenceError: current?.preferenceError || '',
    refresh: () => setRefresh(value => value + 1),
    enable: (values: string[]) => apply(values, view.currentDatabase && values.includes(view.currentDatabase) ? view.currentDatabase : null),
    select: (value: string) => apply(preferences?.enabledDatabases ?? [], value || null),
  };
}
