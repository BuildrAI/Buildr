/** Native sidebar action and explicit generated Remote namespace mount. */
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
import type { OpenResult } from './types.ts';
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
  hooks: {
    status: ObservableSnapshot<Status>;
    mounted: Context['sidebarRight']['mounted'];
    compatible: ObservableSnapshot<boolean>;
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
  return compatible ? null : <div role="alert" className={styles.notice}>{props.t('incompatible')}</div>;
}

// The mounted namespace becomes its own Cordis service key, and a service property may only be
// read when this plugin declares it in `inject`; without `remote.buildr` every read is refused.
export const inject = ['slots', 'locale', 'sidebarRight', 'remote', 'layout'];
/** Register only the supported independent action; never route a main panel. */
export async function apply(ctx: Context): Promise<void> {
  // This entry is an optional sidebar action. No failure inside it — mount, locale, store or slot
  // registration — may take down the shell boot, so the whole activation is contained and the reason
  // is reported instead of thrown.
  try {
    // A sidebar action has no business failing the whole shell boot. If the Remote namespace cannot be
    // mounted, the entry still registers and explains itself on click, and the reason stays in the
    // console for whoever can act on it.
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
    const status = createSnapshotStore<Status>({ kind: 'idle' });
    const compatible = createSnapshotStore(false);
    const carrier = (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; browser?: object } }).dshDesktop;
    const desktop = carrier?.protocolVersion === 1 && carrier.browser !== undefined;
    /** The mounted namespace is installed by this plugin's own $mount, so it cannot also be a hard
     * injection: declaring the namespace in `inject` would make activation wait for a service that
     * only activation itself creates. Read the installed service after the mount instead. */
    const remoteNamespace = (context: Context): { open(): Promise<{ ok: boolean; value: OpenResult }> } => {
      const namespace = context.get('remote.buildr') as { open?: unknown } | undefined;
      if (namespace === undefined || typeof namespace.open !== 'function') throw new Error('remote namespace buildr is not mounted');
      return namespace as { open(): Promise<{ ok: boolean; value: OpenResult }> };
    };
    const action = createOpenAction(ctx.sidebarRight, async () => {
      if (mountFailure !== undefined) {
        return { ready: false, code: 'remote-unmounted', message: ctx.locale.bind(LOCALE)('failed') };
      }
      try {
        const result = await remoteNamespace(ctx).open();
        return result.ok ? result.value : { ready: false, code: 'remote-failed', message: ctx.locale.bind(LOCALE)('failed') };
      } catch (error) {
        // The mount above already gates registration, so this only fires on an unexpected transport
        // failure. Keep the transport detail in the console and show the user a retryable message.
        console.error('[buildr] opening through the Remote namespace failed', error);
        return { ready: false, code: 'remote-rejected', message: ctx.locale.bind(LOCALE)('failed') };
      }
    }, desktop, value => status.set(value), ctx.layout.panelInfo);
    ctx.effect(() => () => action.dispose());
    const injected = (): Injected => ({ open: () => { void action.click(); }, desktop,
      hooks: { status, compatible, mounted: ctx.sidebarRight.mounted } });
    ctx.slots.inject('sidebar.footer.action', function* () {
      yield ctx.slots.register({ name: 'sidebar.footer.action', id: ENTRY_ID, locale: LOCALE, inject: injected }, BuildrAction);
      compatible.set(true);
      yield () => { compatible.set(false); };
    });
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'buildr-compatibility', locale: LOCALE, inject: injected }, CompatibilityNotice));
  } catch (error) {
    console.error('[buildr] activating the sidebar entry failed', error);
  }
}
