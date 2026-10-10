/** Native sidebar action and additive source renderers share one generated Remote namespace. */
import type { Context } from '@deepseek-ai/cordis';
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-browser/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import remote from '../lib/typert.remote-client.js';
import type { ActivationStatus, OpenResult } from './types.ts';
import { createActivationMonitor, type ActivationView } from '../activation-client.ts';
import type {} from '@deepseek-ai/dsh-plugin-manager/types';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type { SourceRecordRequest, SourceRecordResult } from './source-types.ts';
import { createSourceReader } from './source-reader.ts';
import { SourceColumn, SourceObjects, SourceView, type SourceInjected } from './SourceViews.tsx';
import { createOpenAction, type Status } from './orchestration.ts';
import { en, zh, type BuildrKey } from './locales.ts';
import styles from './styles.module.css';

/**
 * Injected at build time. One package serves one Buildr installation, so the released and development
 * packages are the same code with different identity — never a runtime choice the user has to make.
 */
declare const __BUILDR_ENTRY_ID__: string;
declare const __BUILDR_TITLE_KEY__: 'title' | 'titleDev';
declare const __BUILDR_LOCALE__: 'buildr' | 'buildr-dev';
const ENTRY_ID = typeof __BUILDR_ENTRY_ID__ === 'string' ? __BUILDR_ENTRY_ID__ : 'buildr';
const TITLE_KEY: BuildrKey = typeof __BUILDR_TITLE_KEY__ === 'string' && __BUILDR_TITLE_KEY__ === 'titleDev' ? 'titleDev' : 'title';
/** Locale and Remote registrations are keys: each package must own its own or the later one is refused. */
const LOCALE = (typeof __BUILDR_LOCALE__ === 'string' && __BUILDR_LOCALE__ === 'buildr-dev' ? 'buildr-dev' : 'buildr') satisfies 'buildr' | 'buildr-dev';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { buildr: BuildrKey; 'buildr-dev': BuildrKey }
}
interface Injected {
  open(): void;
  desktop: boolean;
  recheck(): void;
  hooks: {
    status: ObservableSnapshot<Status>;
    mounted: Context['sidebarRight']['mounted'];
    compatible: ObservableSnapshot<boolean>;
    activation: ObservableSnapshot<ActivationView>;
  };
}
/**
 * The locale namespace is a build-time identity, so the component type must accept the union the
 * build can produce; the injected `LOCALE` is one member of it at runtime.
 */
type BuildrLocale = 'buildr' | 'buildr-dev';
type ActionProps = PropsRuntime<'sidebar.footer.action'> & InjectFace<Injected> & PropsLocale<BuildrLocale>;

function BuildrAction(props: ActionProps) {
  const status = props.useStatus(value => value);
  const mounted = props.useMounted(value => value);
  const panel = props.usePanelInfo(value => value.activePanelId);
  const reason = !props.desktop ? props.t('desktopOnly') : mounted === undefined || panel !== null ? props.t('noSession')
    : status.kind === 'idle' ? props.t('open') : props.t(status.kind);
  return <div className={styles.entry} data-buildr-entry={ENTRY_ID} data-wide={props.wide}>
    <Tooltip label={reason} delayMs={500} disabled={props.wide}>
    <button type="button" className={styles.action} aria-label={props.t('open')}
      aria-busy={status.kind === 'loading'} disabled={status.kind === 'loading'} onClick={props.open}>
      <svg aria-hidden="true" width={props.wide ? 16 : 18} height={props.wide ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 3h8a5 5 0 0 1 0 10H5m8 0a4 4 0 0 1 0 8H5V3m0 10h8" /></svg>
      {props.wide && <span>{status.kind === 'loading' ? props.t('loading') : props.t(TITLE_KEY)}</span>}
    </button>
    </Tooltip>
    {props.wide && status.kind !== 'idle' && status.kind !== 'loading' && <div role="status" className={styles.message}>{status.detail ?? reason}</div>}
  </div>;
}
type NoticeProps = PropsRuntime<'shell.overlay'> & InjectFace<Injected> & PropsLocale<BuildrLocale>;
function CompatibilityNotice(props: NoticeProps) {
  const compatible = props.useCompatible(value => value);
  const activation = props.useActivation(value => value);
  if (activation.kind === 'checking') return null;
  if (activation.kind !== 'active') return <div role="status" className={styles.notice} data-buildr-activation={ENTRY_ID}>
    <strong>{props.t(TITLE_KEY)}</strong>
    <p>{props.t(activation.kind === 'conflict' ? 'activationConflict' : 'activationUnavailable')}</p>
    {activation.ownerPackage !== undefined && <p><code>{activation.ownerPackage}</code></p>}
    <p className={styles.sourceMuted}>{props.t('activationScope')}</p>
    <button type="button" className={styles.sourceCheck} onClick={props.recheck}>{props.t('activationRecheck')}</button>
  </div>;
  return compatible ? null : <div role="alert" className={styles.notice}>{props.t('incompatible')}</div>;
}

// The mounted namespace becomes its own Cordis service key. A child injection can consume it
// after this plugin mounts it, without making the parent wait for a service it creates itself.
export const inject = ['slots', 'locale', 'sidebarRight', 'remote', 'layout'];

/** Register the independent sidebar action and additive source seats without replacing Trajectory. */
export async function apply(ctx: Context): Promise<void> {
  // This entry is an optional sidebar action. No failure inside it — mount, locale, store or slot
  // registration — may take down the shell boot, so the whole activation is contained and the reason
  // is reported instead of thrown.
  try {
    // A sidebar action has no business failing the whole shell boot. If the Remote namespace cannot be
    // mounted, its diagnostic remains reachable while business contributions wait for qualification.
    // The transport reason stays in the console for whoever can act on it.
    let unmount: (() => Promise<void>) | undefined;
    let mountFailure: unknown;
    try {
      unmount = await ctx.remote.$mount(remote);
    } catch (error) {
      mountFailure = error;
      console.error('[buildr] mounting the Remote namespace failed', error);
    }
    if (unmount !== undefined) ctx.effect(() => unmount as () => Promise<void>);
    ctx.effect(() => ctx.locale.register(LOCALE, { zh, en }));
    const status = createSnapshotStore<Status>({ kind: 'idle' });
    const compatible = createSnapshotStore(false);
    const activation = createSnapshotStore<ActivationView>({ kind: mountFailure === undefined ? 'checking' : 'unavailable' });
    const missingRemote = setTimeout(() => {
      if (activation.getSnapshot().kind === 'checking') activation.set({ kind: 'unavailable' });
    }, 5_000);
    ctx.effect(() => () => { clearTimeout(missingRemote); });
    const carrier = (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; browser?: object } }).dshDesktop;
    const desktop = carrier?.protocolVersion === 1 && carrier.browser !== undefined;
    let remoteNamespace: {
      activation(): Promise<{ ok: boolean; value: ActivationStatus }>;
      open(): Promise<{ ok: boolean; value: OpenResult }>;
      sourceRecord(input: SourceRecordRequest): Promise<{ ok: boolean; value: SourceRecordResult }>;
    } | undefined;
    let recheck = (): void => {};
    const injected = (): Injected => ({ open: () => {}, recheck: () => recheck(), desktop,
      hooks: { status, compatible, activation, mounted: ctx.sidebarRight.mounted } });
    // Diagnostics belong to this entry even while its business contributions are inactive.
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: ENTRY_ID + '-compatibility', locale: LOCALE, inject: injected }, CompatibilityNotice));
    const registerFeatures = async (ctx: Context): Promise<void> => {
      // The footer action seat is a flex row owned by the sidebar, and a seat cannot express layout.
      // This rule only affects a container that actually holds one of our entries, so it cannot touch a
      // sidebar that has none, and it never references the sidebar's hashed class names.
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.buildr = 'footer-layout';
        // Verified live structure, outermost first: the seat's flex-row container holds a slot chunk
        // (`display: contents`) that holds one entry div per package. Only those two layers are styled,
        // so nothing above them and no other plugin's entry is affected.
        style.textContent = [
          '[data-buildr-entry]{width:100%;}',
          // The seat's flex-row container is located structurally, not by the sidebar's hashed class.
          '@supports selector(:has(*)){',
          'div:has(> [data-slot] > [data-buildr-entry]){flex-direction:column;align-items:stretch;}',
          '[data-slot]:has(> [data-buildr-entry]){width:100%;}',
          '}',
        ].join('');
        document.head.appendChild(style);
        return () => { style.remove(); };
      });
      const action = createOpenAction(ctx.sidebarRight, async () => {
        if (mountFailure !== undefined || remoteNamespace === undefined) {
          return { ready: false, code: 'remote-unmounted', message: ctx.locale.bind(LOCALE)('failed') };
        }
        try {
          const result = await remoteNamespace.open();
          return result.ok ? result.value : { ready: false, code: 'remote-failed', message: ctx.locale.bind(LOCALE)('failed') };
        } catch (error) {
          // The mount above already gates registration, so this only fires on an unexpected transport
          // failure. Keep the transport detail in the console and show the user a retryable message.
          console.error('[buildr] opening through the Remote namespace failed', error);
          return { ready: false, code: 'remote-rejected', message: ctx.locale.bind(LOCALE)('failed') };
        }
      }, desktop, value => status.set(value), ctx.layout.panelInfo, ENTRY_ID as 'buildr' | 'buildr-dev');
      ctx.effect(() => () => action.dispose());
      const injected = (): Injected => ({ open: () => { void action.click(); }, recheck: () => recheck(), desktop,
        hooks: { status, compatible, activation, mounted: ctx.sidebarRight.mounted } });
      ctx.slots.inject('sidebar.footer.action', function* () {
        yield ctx.slots.register({ name: 'sidebar.footer.action', id: ENTRY_ID, locale: LOCALE, inject: injected }, BuildrAction);
        compatible.set(true);
        yield () => { compatible.set(false); };
      });
      const sources = new Map<SessionId, SourceInjected>();
      const sourceInjected = (sessionId: SessionId): SourceInjected => {
        const existing = sources.get(sessionId);
        if (existing !== undefined) return existing;
        const reader = createSourceReader(async record => {
          if (mountFailure !== undefined || remoteNamespace === undefined) return { ready: false, code: 'source-remote-unmounted', message: '' };
          // The Host reads its own events; client source metadata is never an authority supplied by this request.
          const address = { recordId: record.recordId, kind: record.kind, transient: record.transient,
            eventRefs: record.eventRefs.map(ref => ({ ...ref })),
            ...(record.callId === undefined ? {} : { callId: record.callId }),
            ...(record.parentCallId === undefined ? {} : { parentCallId: record.parentCallId }),
            ...(record.rootCallId === undefined ? {} : { rootCallId: record.rootCallId }) };
          const result = await remoteNamespace.sourceRecord({ sessionId, mode: 'content', record: address });
          return result.ok ? result.value : { ready: false, code: 'source-remote-failed', message: '' };
        });
        const value: SourceInjected = {
          ensureSource: record => { void reader.ensure(record); },
          refreshSource: record => { void reader.refresh(record); },
          ensureSourceWindow: records => { reader.ensureWindow(records); },
          releaseSourceWindow: () => { reader.releaseWindow(); },
          hooks: { source: reader },
        };
        sources.set(sessionId, value);
        return value;
      };
      ctx.effect(() => () => { for (const value of sources.values()) value.hooks.source.dispose(); sources.clear(); });
      ctx.slots.inject('conversation.trajectory.column', () => ctx.slots.register({
        name: 'conversation.trajectory.column', id: ENTRY_ID + '-source', order: 20, label: () => ctx.locale.bind(LOCALE)('sourceTitle'), locale: LOCALE, inject: sourceInjected,
      }, SourceColumn));
      ctx.slots.inject('conversation.trajectory.inspector.objects', () => ctx.slots.register({
        name: 'conversation.trajectory.inspector.objects', id: ENTRY_ID + '-objects', order: 20, locale: LOCALE, inject: sourceInjected,
      }, SourceObjects));
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view', id: ENTRY_ID, order: 20, label: () => ctx.locale.bind(LOCALE)(LOCALE === 'buildr-dev' ? 'sourceViewDev' : 'sourceView'), locale: LOCALE, inject: sourceInjected,
      }, SourceView));
    };
    const remoteKey = LOCALE === 'buildr-dev' ? 'remote.buildr-dev' : 'remote.buildr';
    ctx.inject([remoteKey], async scope => {
      const namespace = scope.get(remoteKey) as NonNullable<typeof remoteNamespace>;
      remoteNamespace = namespace;
      const monitor = createActivationMonitor({
        read: async () => {
          const response = await namespace.activation();
          if (!response.ok) throw new Error('activation-remote-failed');
          return response.value;
        },
        mount: async () => {
          let mounted = false;
          const fiber = scope.plugin({ name: ENTRY_ID + '-features', apply: async child => { await registerFeatures(child); mounted = true; } });
          await fiber;
          if (!mounted) { void fiber.dispose(); throw new Error('activation-features-failed'); }
          return () => fiber.dispose();
        },
        publish: value => activation.set(value),
      });
      recheck = () => { void monitor.refresh(); };
      scope.effect(() => scope.remote.$on('plugin-manager/changed', () => { void monitor.refresh(); }));
      scope.effect(() => async () => {
        await monitor.dispose();
        if (remoteNamespace === namespace) { remoteNamespace = undefined; recheck = () => {}; }
      });
      await monitor.refresh();
    });

  } catch (error) {
    console.error('[buildr] activating the sidebar entry failed', error);
  }
}
