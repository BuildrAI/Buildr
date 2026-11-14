import { ProgrammaticPushback } from './programmatic-pushback.ts';
import { conversationRuns, unfinishedRun } from '../domain/agent-state.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { ProgramUpgrades } from './program-upgrades.ts';
import { ProgramUpdates } from './program-updates.ts';
import { presentConnection } from './connection-presentation.ts';
import { createDefaultModelProviders } from '../model-access/providers/index.ts';
import { createModelAccess } from '../model-access/application.ts';
import { executionLog } from '../storage/execution-log.ts';
import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import type { AgentServiceOptions, ConnectionAccountImpact, ConnectionView, ExecutorModelSourceObservation, PreparationInput, ProgramUpgradeInput, RunView, SendDraft } from '../contracts.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { NativeContentResolver } from './native-content-resolver.ts';
import { ConnectionApplication } from '../application/connection-application.ts';
import { ConversationApplication } from '../application/conversation-application.ts';
import { ConversationEvents } from '../application/conversation-events.ts';
import { executorEnvironment } from '../application/executor-environment.ts';
import { createNativeExecutors, nativeContentSpec, readNativeTool } from '../executors/index.ts';
import { NativeProgramManager } from '../executors/program-manager.ts';
import { PreparationApplication } from '../application/preparation-application.ts';
import { HostContext } from '../application/host-context.ts';

const TEST_STALLED_THRESHOLD_ENV = 'BUILDR_AGENT_PUSHBACK_TEST_STALLED_THRESHOLD_MS';
const TEST_CHECK_INTERVAL_ENV = 'BUILDR_AGENT_PUSHBACK_TEST_CHECK_INTERVAL_MS';
const TEST_STALLED_MIN_MS = 1_000, TEST_STALLED_MAX_MS = 24 * 60 * 60 * 1000;
const TEST_CHECK_MIN_MS = 250, TEST_CHECK_MAX_MS = 60_000;

function boundedTestMilliseconds(name: string, raw: string | undefined, minimum: number, maximum: number): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) { console.warn(`[agent_pushback_test_timing_ignored] ${name} 必须是整数毫秒。`); return undefined; }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    console.warn(`[agent_pushback_test_timing_ignored] ${name} 必须在 ${minimum}..${maximum} 毫秒之间。`);
    return undefined;
  }
  return value;
}

/** Test-only idle-timing knobs; absent or invalid values keep the product defaults. */
export function readTestPushbackTiming(environment: Record<string, string | undefined>) {
  return {
    stalledThresholdMs: boundedTestMilliseconds(TEST_STALLED_THRESHOLD_ENV, environment[TEST_STALLED_THRESHOLD_ENV], TEST_STALLED_MIN_MS, TEST_STALLED_MAX_MS),
    checkIntervalMs: boundedTestMilliseconds(TEST_CHECK_INTERVAL_ENV, environment[TEST_CHECK_INTERVAL_ENV], TEST_CHECK_MIN_MS, TEST_CHECK_MAX_MS),
  };
}

/** Core composition. Process integrations enter through connectAgentProcess. */
export function createAgentService(options: AgentServiceOptions) {
  const generation = randomUUID();
  const root = path.join(options.dataRoot, 'agent-service');
  const executorList = options.executors ?? createNativeExecutors();
  const resolver=new NativeContentResolver(root,id=>repository.readConversation(id),executorList);
  const repository:ConversationRepository = new ConversationRepository(root,(record,entry)=>resolver.tool(record,entry),reference=>readNativeTool(root,reference,executorList),provider=>nativeContentSpec(provider,executorList));
  repository.startReadModels();
  let pushbackRunLiveness: ((workspaceId: string, conversationId: string) => { runs: RunView[] } | undefined) | undefined;
  const envTiming = readTestPushbackTiming(process.env);
  const stalledThresholdMs = options.testPushbackStalledThresholdMs ?? envTiming.stalledThresholdMs;
  const checkIntervalMs = options.testPushbackCheckIntervalMs ?? envTiming.checkIntervalMs;
  const pushback = new ProgrammaticPushback({
    root: path.join(root, 'programmatic-pushback'),
    ...(options.pushbackTransport ? { transport: options.pushbackTransport } : {}),
    ...(options.pushbackNow ? { now: options.pushbackNow } : {}),
    ...(stalledThresholdMs === undefined ? {} : { stalledThresholdMs }),
    ...(checkIntervalMs === undefined ? {} : { checkIntervalMs }),
    readRunLiveness: (workspaceId, conversationId) => pushbackRunLiveness?.(workspaceId, conversationId),
  });
  const events = new ConversationEvents(generation, pushback);
  const now = () => (options.now?.() ?? new Date()).toISOString();
  let linkedChanged: ((connection:ConnectionView)=>void)|undefined;
  let presentConnectionView: ((view: ConnectionView) => ConnectionView) | undefined;
  const connectionAccountObservers = new Map<string, string>();
  const nativeAccountConfigRoots = Object.fromEntries(
    executorList.flatMap(executor => {
      const native = executor.descriptor.modelPolicy?.native;
      return native?.accountConfigScope === 'model-account' && native.defaultSourceAccountId
        ? [[executor.descriptor.id, path.join(root, 'model-access', 'accounts', native.defaultSourceAccountId)]]
        : [];
    }),
  );
  const connections = new ConnectionApplication({ repository, root, executors: executorList, environment: executorEnvironment(options.environment ?? process.env), nativeAccountConfigRoots, present: view => presentConnectionView?.(view) ?? view, generation, now, hasObservedAccount: id => connectionAccountObservers.has(id), observeAccount: (id: string) => { const accountId = connectionAccountObservers.get(id); return accountId ? observeConnectionViaModelAccount(id, accountId) : undefined; }, changed: (connection: ConnectionView) => {events.publish({ type: 'connection', revision: connection.revision, payload: { connection } });linkedChanged?.(connection);} });
  const programManager = options.programManager ?? new NativeProgramManager(root, executorEnvironment(options.environment ?? process.env));
  const programUpdates = new ProgramUpdates(() => connections.list(), programManager, now, options.programRelease);
  const preparations = new PreparationApplication(connections, programManager, generation, now);
  const providerList = options.modelProviders ?? createDefaultModelProviders({ root, connections, programManager, readAccountIdentity: accountId => models.accounts.read(accountId).identity, now });
  const noBackgroundRefreshProviders = new Set<string>();
  const registeredProviderIds = new Set(providerList.map(provider => provider.id));
  for (const provider of providerList) {
    if (provider.connectionId && provider.observesConnection) connectionAccountObservers.set(provider.connectionId, provider.id);
    if (provider.backgroundRefresh === false) noBackgroundRefreshProviders.add(provider.id);
  }
  const autoInspectProviders = new Set(providerList.filter(provider => provider.autoInspect).map(provider => provider.id));
  const models = createModelAccess({
    root: path.join(root, 'model-access'),
    executors: () => connections.descriptors(),
    diagnostics: executionLog(root, generation),
    providers: providerList,
    environment: executorEnvironment(options.environment ?? process.env),
    changed: account => {
      const affected = new Set<string>();
      if (account.connectionId && connectionAccountObservers.get(account.connectionId) === account.id) {
        affected.add(account.connectionId);
      }
      for (const executor of executorList) {
        if (executor.descriptor.modelPolicy?.native?.defaultSourceAccountId === account.id) {
          affected.add(executor.descriptor.id);
        }
      }
      for (const connectionId of affected) {
        try {
          const view = connections.get(connectionId);
          events.publish({ type: 'connection', revision: view.revision, payload: { connection: view } });
        } catch {
          // Connection may not be registered in isolated custom-provider tests.
        }
      }
    },
  });
  presentConnectionView = view => {
    const accountId = view.modelPolicy?.native?.defaultSourceAccountId;
    if (!accountId) return view;
    let account: ReturnType<typeof models.accounts.snapshot> | undefined;
    try { account = models.accounts.snapshot(accountId); }
    catch { account = undefined; }
    return presentConnection(view, account, registeredProviderIds.has(accountId));
  };
  let closed = false;
  let discovery:Promise<void>|undefined, discoveryDiagnostic:string|undefined;
  let discoveryTimer:ReturnType<typeof setInterval>|undefined;
  let discoverySkippedCold = false;
  const checkModelAccount = async (id: string, input?: {expectedRevision?: string}) => {
    try { return await models.accounts.check(id, input); }
    finally { await connections.releaseAccountProbes(); }
  };
  const observeConnectionViaModelAccount = async (connectionId: string, accountId: string): Promise<Pick<ConnectionView, 'status' | 'models' | 'diagnostic' | 'account'>> => {
    await models.ensureLinked();
    const account = await checkModelAccount(accountId);
    const label = connections.descriptor(connectionId)?.label ?? connectionId;
    return {
      status: account.status,
      diagnostic: account.diagnostic,
      account: {label: account.accountLabel, loginMethod: `${label} 账号`},
      models: account.status === 'ready' ? account.models.map((model, index) => ({
        id: model.id, label: model.label, isDefault: index === 0, reasoningEfforts: model.reasoningEfforts,
        defaultReasoningEffort: model.defaultReasoningEffort, contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens, images: model.images, tools: model.tools,
      })) : [],
    };
  };
  const discover=(warmOnly = false):Promise<void>=>{
    if(closed)return Promise.resolve();
    if (discovery) return warmOnly ? discovery : discovery.then(() => discoverySkippedCold ? discover() : undefined);
    discoverySkippedCold = false;
    discovery=(async()=>{
      try {
        await models.ensureLinked();
        if(closed)return;
        const accounts = models.accounts.list().accounts.filter(account =>
          account.enabled && (account.connectionId || autoInspectProviders.has(account.provider) || ['ready', 'failed'].includes(account.status)) &&
          !account.loginAttempt?.state?.match(/^(initializing|waiting-browser|checking)$/));
        const selected = accounts.filter(account => {
          if (!warmOnly) return true;
          if (noBackgroundRefreshProviders.has(account.provider)) return false;
          return !account.connectionId || connectionAccountObservers.has(account.connectionId) || connections.hasAccountRuntime(account.connectionId);
        });
        discoverySkippedCold = selected.length !== accounts.length;
        const results = await Promise.allSettled(selected.map(account => models.accounts.check(account.id)));
        discoveryDiagnostic=results.some(result=>result.status==='rejected'||!!result.value.diagnostic)?'部分供应商核对失败，已保留已有模型列表。':undefined;
      } catch(error) {
        discoveryDiagnostic='供应商核对未完成，已保留已有模型列表。';
        throw error;
      } finally { await connections.releaseAccountProbes(); }
    })().finally(()=>{discovery=undefined;});
    return discovery;
  };
  const refreshInBackground=()=>{void discover(true).catch(()=>{});};
  const startRefreshing=()=>{
    if(closed||discoveryTimer)return;
    void discover(true).catch(()=>{});
    discoveryTimer=setInterval(refreshInBackground,60_000);discoveryTimer.unref();
  };
  linkedChanged=connection=>{
    // Only connection-owned accounts follow program login/disconnect.
    const account = models.accounts.list().accounts.find(account => account.id === 'native-' + connection.id);
    if (account?.connectionId !== connection.id) return;
    const directObserved = connectionAccountObservers.has(connection.id);
    const loginInProgress = ['initializing', 'waiting-browser'].includes(connection.loginAttempt?.state ?? '');
    if (!connection.enabled || loginInProgress || (!directObserved && ['not-authenticated', 'expired'].includes(connection.status))) models.invalidate('native-'+connection.id,{abortActive:false});
    // Login completion must not wait for an unrelated source's discovery.
    if (discoveryTimer && connection.enabled && !directObserved && connection.status === 'ready' &&
        !connection.loginAttempt?.state.match(/^(initializing|waiting-browser|checking)$/))void checkModelAccount('native-'+connection.id).catch(()=>{});
  };
  const cachedCatalog=()=>{
    const result=models.catalog.list();
    const accounts=models.accounts.list().accounts;
    const hasSnapshot=accounts.some(account=>account.observedAt||account.models.length);
    const failed=accounts.some(account=>{
      if(!account.enabled||account.loginAttempt?.state.match(/^(initializing|waiting-browser|checking)$/))return false;
      const connection=account.connectionId&&connections.descriptor(account.connectionId)?connections.get(account.connectionId):undefined;
      if(connection&&(!connection.enabled||connection.loginAttempt?.state.match(/^(initializing|waiting-browser|checking)$/)))return false;
      return account.status==='failed'||account.status==='expired'||account.status==='not-authenticated'&&!!account.observedAt;
    });
    const diagnostic=discoveryDiagnostic||(failed?'部分供应商核对失败或登录已失效，请在智能体与模型中查看。':undefined);
    return {...result,hasSnapshot,...(diagnostic?{diagnostic}:{})};
  };
  const conversations = new ConversationApplication({ backendChange:options.backendChange, conversationControl:options.conversationControl, controlSupersededRun:options.controlSupersededRun, repository, connections, modelAccess: {...models, accounts: {...models.accounts, check: checkModelAccount}}, events, root, generation, now, host: new HostContext(options), get autoContinueInterrupted() { return options.autoContinueInterrupted; }, generationAlive: options.generationAlive, generationReleased:options.generationReleased, ...(options.titleTimeoutMs === undefined ? {} : { titleTimeoutMs: options.titleTimeoutMs }) });
  pushbackRunLiveness = (workspaceId, conversationId) => conversations.readRunLiveness(workspaceId, conversationId);
  const upgrades = new ProgramUpgrades({root,connections,programs:programManager,checks:programUpdates,release:id=>conversations.releaseForProgramUpgrade(id),now});
  const withUpgrades=(snapshot:ReturnType<typeof programUpdates.list>)=>({programs:snapshot.programs.map(program=>({...program,upgrade:(()=>{const job=upgrades.read(program.connectionId);return job&&(job.executable===program.executable||job.installedExecutable===program.executable)?job:undefined;})()}))});
  return {
    generation,
    pushback: {
      read: (credentialId: string) => pushback.read(credentialId),
      save: (credentialId: string, input: import('../contracts.ts').PushbackSettingsInput) => pushback.save(credentialId, input),
      reveal: (credentialId: string, input: {expectedRevision:string}) => pushback.reveal(credentialId, input),
      test: (credentialId: string, input: {expectedRevision:string}) => pushback.test(credentialId, input),
      markTakeover: (workspaceId: string, conversationId: string, credentialId: string) => pushback.markTakeover(workspaceId, conversationId, credentialId),
      setCredentialAccess: (credentialId: string, access: import('../contracts.ts').PushbackCredentialAccess) => pushback.setCredentialAccess(credentialId, access),
      recordStop: (workspaceId: string, conversationId: string, runId: string, credentialId: string) => pushback.recordStop(workspaceId, conversationId, runId, credentialId),
      listEvents: (credentialId: string, workspaceId: string, input: {after?:string;limit?:number}) => pushback.listEvents(credentialId, workspaceId, input),
      migrateGlobal: (credentialId: string, input: {url:string;secret:string}) => pushback.migrateGlobal(credentialId, input),
    },
    canMaintainStorage() {
      return !discovery && !conversations.activity().some(reason => reason.kind !== 'source-resource') &&
        !preparations.activity().length && !models.activity().length && !upgrades.activity().length;
    },
    activity() {
      const reasons = [...conversations.activity(), ...preparations.activity(), ...connections.activity(), ...models.activity(), ...upgrades.activity()];
      if(discovery)reasons.push({kind:'model-discovery',count:1});
      try {
        const pending = repository.listPendingStates(true).filter(record => !options.generationAlive || conversationRuns(record.view).some(run=>run.generation===generation&&unfinishedRun(run)));
        const held=pending.filter(record=>conversationRuns(record.view).some(run=>run.generation===generation&&!run.resourcesReleased&&unfinishedRun(run))&&conversations.retainsConversationSource(record.view.workspaceId,record.view.id));
        if(held.length)reasons.push({kind:'unfinished-execution',count:held.length});
      } catch { reasons.push({kind:'storage-unconfirmed',count:1}); }
      return {busy:reasons.length>0,reasons};
    },
    async freezeMetadata() {
      clearInterval(discoveryTimer); discoveryTimer = undefined;
      await discovery?.catch(() => {});
      if ([...upgrades.activity(), ...preparations.activity(), ...connections.activity(), ...models.activity().filter(reason => reason.kind !== 'model-request')].length) {
        startRefreshing();
        const { AgentServiceError } = await import('../domain/agent-state.ts');
        throw new AgentServiceError('agent_process_busy', '仍有账号、准备或配置写入操作，尚未交接维护权。', 409);
      }
      connections.freezeMetadata(); models.freezeMetadata();
    },
    resumeMetadata() { connections.freezeMetadata(false); models.freezeMetadata(false); startRefreshing(); },
    conversationBusy: (scope: string, id: string) => conversations.busy(scope, id),
    reconcilePersisted: (scope:string,id:string,control?:{expectedRevision:string;runId:string;participantId:string;generation:string}) => conversations.reconcilePersisted(scope,id,control),
    allowsReleasedContinuation: (scope: string, id: string, input: SendDraft) => conversations.allowsReleasedContinuation(scope, id, input),
    conversationInputBusy: (scope: string, id: string) => conversations.inputBusy(scope, id),
    retainsConversationSource: (scope:string,id:string) => conversations.retainsConversationSource(scope,id),
    releaseIdleSources: (owner?:{workspaceId:string;id:string}) => conversations.releaseIdleSources(owner),
    releaseRetiredWork: () => conversations.releaseRetiredWork(),
    observeForRelease: (scope:string,id:string,runId:string,generation:string) => conversations.observeForRelease(scope,id,runId,generation),
    verifyNext: (scope: string, id: string) => conversations.verifyNext(scope, id),
    validatePending: (scope: string, id: string, input: SendDraft) => conversations.validatePending(scope, id, input),
    checkWaitingHandoff: (scope:string,id:string,requestId:string) => conversations.checkWaitingHandoff(scope,id,requestId),
    preserveWaitingQuestions: (scope:string,id:string,requestId:string) => conversations.preserveWaitingQuestions(scope,id,requestId),
    dispatchWaitingHandoff: (scope:string,id:string,requestId:string) => conversations.dispatchWaitingHandoff(scope,id,requestId),
    revokeModel: (id: string) => models.invalidate(id),
    models: { startRefreshing, generate: models.generate, accounts: {...models.accounts,check:checkModelAccount,list:async(input:{refresh?:boolean;includeDisabled?:boolean}={})=>{if(input.refresh===true)await discover();return models.accounts.list(input);}}, catalog: {list:async(input:{refresh?:boolean}={})=>{if(input.refresh===true)await discover();return cachedCatalog();}} },
    connections: {
      list: () => ({ connections: connections.list() }),
      programUpdates: () => withUpgrades(programUpdates.list()),
      checkProgramUpdates: async (input: { connectionId?: string } = {}) => withUpgrades(await programUpdates.check(input)),
      upgradeProgram: (id: string, input: ProgramUpgradeInput) => upgrades.begin(id,input),
      read: (id: string) => connections.get(id),
      prepare: (id: string, input: PreparationInput) => preparations.begin(id, input),
      preparation: (id: string, attemptId: string) => preparations.read(id, attemptId),
      currentPreparation: (id: string) => ({ attempt: preparations.current(id) }),
      cancelPreparation: (id: string, attemptId: string) => preparations.cancel(id, attemptId),
      connect: (id: string, input: { expectedRevision: string; executable?: string }) => {
        if (!options.executors && !connections.get(id).executable && (!input.executable || !programManager.isManaged?.(id,input.executable))) throw new AgentServiceError('agent_program_preparation_required','请先准备 Buildr 独立程序，不使用桌面应用内程序。',409);
        return connections.connect(id,input);
      },
      check: (id: string, input: { expectedRevision?: string } = {}) => connections.check(id, input.expectedRevision),
      login: (id: string, input: { expectedRevision: string }) => connections.beginLogin(id, input.expectedRevision),
      loginAttempt: (id: string, attemptId: string) => connections.loginAttempt(id, attemptId),
      cancelLogin: (id: string, attemptId: string, input: { expectedRevision: string }) => connections.cancelLogin(id, attemptId, input.expectedRevision),
      accountImpact: async (id: string): Promise<ConnectionAccountImpact> => {
        const view = connections.get(id);
        const defaultAccountId = connections.descriptor(id)?.modelPolicy?.native?.defaultSourceAccountId;
        const references = defaultAccountId
          ? conversations.modelAccountReferences([defaultAccountId])[defaultAccountId] ?? 0
          : 0;
        const activeConversations = conversations.activeConversationsForConnection(id).map(item => ({
          conversationId: item.conversationId,
          workspaceId: item.workspaceId,
          title: item.title,
          runId: item.runId,
          status: item.status,
        }));
        return {
          connectionId: view.id,
          hostKeyringAuth: Boolean(view.hostKeyringAuth),
          activeConversations,
          references,
        };
      },
      logout: async (id: string, input: { expectedRevision: string; switchAccount?: boolean }): Promise<ConnectionView> => {
        const current = connections.get(id);
        if (current.revision !== input.expectedRevision) {
          throw new AgentServiceError('agent_revision_conflict', '接入配置已变化，请重新检查。', 409);
        }
        if (!current.executable) {
          throw new AgentServiceError('agent_program_preparation_required', '请先准备此智能体程序。', 409);
        }
        const descriptor = connections.descriptor(id);
        const defaultAccountId = descriptor?.modelPolicy?.native?.defaultSourceAccountId;
        if (defaultAccountId) await models.ensureLinked();
        const previousAccount = defaultAccountId ? models.accounts.snapshot(defaultAccountId) : undefined;

        connections.setSendGate(
          id,
          {
            state: 'paused',
            reason: 'account-change',
            diagnostic: input.switchAccount
              ? '正在停止运行中的对话并切换账号，新发送已暂停；草稿已保留。'
              : '正在停止运行中的对话并退出账号，新发送已暂停；草稿已保留。',
          },
          true,
        );

        const stopped = await conversations.stopActiveForAccountChange(id);
        if (!stopped.stoppedAll) {
          connections.setSendGate(id, { state: 'open' }, false);
          const titles = stopped.unstopped.map(item => item.title || item.conversationId).join('、');
          throw new AgentServiceError(
            'agent_account_change_stop_unconfirmed',
            `以下对话未能确认已停止，已中止账号${input.switchAccount ? '切换' : '退出'}并恢复发送：${titles}`,
            409,
          );
        }

        await conversations.releaseConnectionSources(id);
        await connections.releaseConversationRuntimes(id);

        if (!connections.get(id).enabled) {
          await connections.connect(id, { expectedRevision: connections.get(id).revision, programOnly: true });
        }

        const completeLogoutTransition = async (): Promise<ConnectionView> => {
          if (defaultAccountId) await models.clearAuthentication(defaultAccountId);
          if (input.switchAccount) {
            return connections.prepareSwitchLogin(id);
          }
          return await connections.disconnect(id, connections.get(id).revision);
        };

        try {
          await connections.useProgram(id, async () => {
            const runtime = await connections.runtime(id, undefined, true);
            if (!runtime.logoutAccount) {
              throw new AgentServiceError('agent_logout_unsupported', `${current.label} 当前不支持受控账号退出。`, 409);
            }
            await runtime.logoutAccount();
          });
          await connections.releaseAccountProbes();
          return await completeLogoutTransition();
        } catch (error) {
          if (error instanceof AgentServiceError && error.code === 'agent_logout_unsupported') {
            connections.setSendGate(id, { state: 'open' }, false);
            throw error;
          }

          let reobserved: ExecutorModelSourceObservation | undefined;
          try {
            reobserved = await connections.useProgram(id, async () => {
              const runtime = await connections.runtime(id, undefined, true);
              return await runtime.inspectModelSource?.({ forceFresh: true });
            });
          } catch {
            reobserved = undefined;
          } finally {
            await connections.releaseAccountProbes();
          }

          if (reobserved?.status === 'not-authenticated') {
            return await completeLogoutTransition();
          }

          const previousIdentity = previousAccount?.identity;
          const reobservedDigest = reobserved?.accountIdentity
            ? createHash('sha256').update(reobserved.accountIdentity).digest('hex')
            : undefined;
          if (
            reobserved?.status === 'ready'
            && reobserved.explicitAccountIdentity === true
            && !reobserved.identityUnconfirmed
            && previousAccount?.status === 'ready'
            && previousIdentity
            && reobservedDigest === previousIdentity
          ) {
            connections.setSendGate(id, { state: 'open' }, false);
            throw new AgentServiceError(
              'agent_account_logout_failed',
              '官方退出未完成，已核实当前仍为原登录账号并恢复发送；如需退出或切换账号请重试。',
              502,
            );
          }

          connections.setSendGate(
            id,
            {
              state: 'paused',
              reason: 'account-unconfirmed',
              diagnostic: '官方退出结果未知且当前账号身份无法确认，已保持暂停发送；请重试退出或切换账号。',
            },
            false,
          );
          throw new AgentServiceError(
            'agent_account_logout_unconfirmed',
            '官方退出结果未知且当前账号身份无法确认，已保持暂停发送；请重试退出或切换账号。',
            502,
          );
        }
      },
      disconnect: async (id: string, input: { expectedRevision: string }) => {
        // First validate the observed connection revision, before stopping any work.
        const current = connections.get(id);
        if (current.revision !== input.expectedRevision) {
          const { AgentServiceError } = await import('../domain/agent-state.ts');
          throw new AgentServiceError('agent_revision_conflict', '接入配置已变化，请重新检查。', 409);
        }
        connections.disable(id, input.expectedRevision);
        await conversations.closeConnection(id);
        return connections.disconnect(id, connections.get(id).revision);
      },
    },
    conversations: {
      readDraft: (scope: string, id: string) => conversations.drafts.list(scope, id),
      addDraftImage: (scope: string, id: string, input: Parameters<typeof conversations.drafts.add>[2]) => conversations.drafts.add(scope, id, input),
      removeDraftImage: (scope: string, id: string, input: Parameters<typeof conversations.drafts.remove>[2]) => conversations.drafts.remove(scope, id, input),
      readDraftImage: (scope: string, id: string, imageId: string) => conversations.drafts.image(scope, id, imageId),
      startDraft: (scope: string, id: string, input: Parameters<typeof conversations.drafts.start>[2]) => conversations.drafts.start(scope, id, input),
      lookupDraft: (scope: string, id: string, requestId: string) => conversations.drafts.lookup(scope, id, requestId),
      lookupRequest: (workspaceId:string,id:string,clientRequestId:string) => conversations.lookupRequest(workspaceId,id,clientRequestId),
      recoverInterrupted: () => conversations.recoverInterrupted(),
      listAll: (workspaceIds: string[], input: Parameters<ConversationApplication['listAll']>[1] = {}) => conversations.listAll(workspaceIds, input),
      activityEpoch: (workspaceIds: string[]) => conversations.activityEpoch(workspaceIds),
      modelAccountReferences: (accountIds: string[]) => conversations.modelAccountReferences(accountIds),
      markSeen: (workspaceId: string, id: string, input: Parameters<ConversationApplication['markSeen']>[2]) => conversations.markSeen(workspaceId, id, input),
      list: ((workspaceId: string, input?: Parameters<ConversationApplication['list']>[1]) => conversations.list(workspaceId, input)) as ConversationApplication['list'],
      fork: (workspaceId: string, id: string, input: Parameters<ConversationApplication['fork']>[2]) => conversations.fork(workspaceId, id, input),
      createChild: (workspaceId:string,id:string,input:Parameters<ConversationApplication['createChild']>[2]) => conversations.createChild(workspaceId,id,input),
      listChildren: (workspaceId:string,id:string,input:Parameters<ConversationApplication['listChildren']>[2]={}) => conversations.listChildren(workspaceId,id,input),
      create: (workspaceId: string, input: Parameters<ConversationApplication['create']>[1]) => conversations.create(workspaceId, input),
      read: (workspaceId: string, id: string, input: Parameters<ConversationApplication['read']>[2] = {}) => conversations.read(workspaceId, id, input),
      readRunFinalReply: (workspaceId: string, id: string, runId: string) => conversations.readRunFinalReply(workspaceId, id, runId),
      participation: (workspaceId:string,id:string,input:{runId:string}) => conversations.participation(workspaceId,id,input),
      participationSummary: (workspaceId:string,input:import('../participation-contracts.ts').ParticipationSummaryInput={}) => conversations.participationSummary(workspaceId,input),
      readHistory: (workspaceId:string,id:string,input:Parameters<ConversationApplication['readHistory']>[2]) => conversations.readHistory(workspaceId,id,input),
      readEntry: (workspaceId:string,id:string,entryId:string,revision:string,sourceId?:string) => conversations.readEntry(workspaceId,id,entryId,revision,sourceId),
      observationVersion: (workspaceId:string,id:string) => conversations.observationVersion(workspaceId,id),
      update: (workspaceId: string, id: string, input: Parameters<ConversationApplication['update']>[2]) => conversations.update(workspaceId, id, input),
      generateTitle: (workspaceId: string, id: string, input: Parameters<ConversationApplication['generateTitle']>[2]) => conversations.generateTitle(workspaceId, id, input),
      prepareHandoff: (workspaceId:string,id:string,input:SendDraft) => conversations.prepareHandoff(workspaceId,id,input),
      prepareSend: (workspaceId: string, id: string, input: SendDraft) => conversations.prepareSend(workspaceId, id, input),
      send: (workspaceId: string, id: string, input: Parameters<ConversationApplication['send']>[2]) => conversations.send(workspaceId, id, input),
      queueSend: (workspaceId: string, id: string, input: Parameters<ConversationApplication['queueSend']>[2]) => conversations.queueSend(workspaceId, id, input),
      cancelPendingSend: (workspaceId: string, id: string, input: Parameters<ConversationApplication['cancelPendingSend']>[2]) => conversations.cancelPendingSend(workspaceId, id, input),
      supplement: (workspaceId: string, id: string, input: Parameters<ConversationApplication['supplement']>[2]) => conversations.supplement(workspaceId, id, input),
      reconcileSupplementReceipts: (workspaceId:string,id:string) => conversations.reconcileSupplementReceipts(workspaceId,id),
      releaseQuestionWait: (workspaceId:string,id:string,input:Parameters<ConversationApplication['releaseQuestionWait']>[2]) => conversations.releaseQuestionWait(workspaceId,id,input),
      settleRetainedRun: (workspaceId:string,id:string,input:Parameters<ConversationApplication['settleRetainedRun']>[2]) => conversations.settleRetainedRun(workspaceId,id,input),
      observeRun: (workspaceId:string,id:string,input:Parameters<ConversationApplication['observeRun']>[2]) => conversations.observeRun(workspaceId,id,input),
      observe: (workspaceId: string, id: string) => conversations.observe(workspaceId, id),
      stopAll: (workspaceId:string,id:string,input:Parameters<ConversationApplication['stopAll']>[2]) => conversations.stopAll(workspaceId,id,input),
      stop: (workspaceId: string, id: string, input: Parameters<ConversationApplication['stop']>[2]) => conversations.stop(workspaceId, id, input),
      reply: (workspaceId: string, id: string, requestId: string, input: Parameters<ConversationApplication['reply']>[3]) => conversations.reply(workspaceId, id, requestId, input),
      addAttachment: (workspaceId: string, id: string, input: Parameters<ConversationApplication['addAttachment']>[2]) => conversations.addAttachment(workspaceId, id, input),
      readAttachment: (workspaceId: string, id: string, attachmentId: string) => conversations.readAttachment(workspaceId, id, attachmentId),
      subscribe: (workspaceId: string, id: string, options:{compactTools?:boolean}={}) => conversations.subscribe(workspaceId, id,options),
      pending: () => conversations.pending(),
      pendingSummary: () => conversations.pendingSummary(),
    },
    async close() {
      if (closed) return; closed = true; repository.stopReadModels(); programUpdates.close(); upgrades.beginClosing();
      clearInterval(discoveryTimer);discoveryTimer=undefined;
      const budget = Math.max(50, Math.min(options.shutdownTimeoutMs ?? 10_000, 10_000));
      const deadline = Date.now() + budget;
      const within = async (work: Promise<unknown>, milliseconds: number) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([work.catch(() => {}), new Promise<void>(resolve => { timer = setTimeout(resolve, milliseconds); })]); }
        finally { if (timer) clearTimeout(timer); }
      };
      connections.beginClosing();
      preparations.beginClosing();
      try { await within(conversations.close(), Math.max(1, Math.floor(budget * 0.7))); }
      finally {
        // Always start actual resource release, even if a vendor's stop never responds.
        await within(Promise.allSettled([discovery, preparations.close(), upgrades.close().finally(() => connections.close()), models.close()]), Math.max(1, deadline - Date.now()));
        await within(conversations.releaseIdleSources(), Math.max(1, deadline - Date.now()));
        events.close();
      }
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
