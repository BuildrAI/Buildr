import { resolveNativeContentSpec, type ExecutorNativeContentSpec, type NativeToolContent } from '../native-content-contracts.ts';
import type { AgentExecutor, ConversationEntry } from '../contracts.ts';
import { createCodexExecutor } from './codex/index.ts';
import { createDshExecutor } from './dsh/index.ts';
import { createQoderExecutor } from './qoder/index.ts';
import { createQoderCnExecutor } from './qoder-cn/index.ts';
import { createClaudeExecutor } from './claude/index.ts';
import { createAntigravityExecutor } from './antigravity/index.ts';

export {
  createCodexExecutor,
  createDshExecutor,
  createQoderExecutor,
  createQoderCnExecutor,
  createClaudeExecutor,
  createAntigravityExecutor,
};

/** Only real, explicitly supported providers are installed. */
export function createNativeExecutors(): AgentExecutor[] {
  return [
    createCodexExecutor(),
    createDshExecutor(),
    createQoderExecutor(),
    createQoderCnExecutor(),
    createClaudeExecutor(),
    createAntigravityExecutor(),
  ];
}

let cachedDefaultExecutors: readonly AgentExecutor[] | undefined;
let cachedSharedHomeProviders: ReadonlySet<string> | undefined;
let cachedNativeSpecs: ReadonlyMap<string, ExecutorNativeContentSpec> | undefined;

export function defaultNativeExecutors(): readonly AgentExecutor[] {
  return (cachedDefaultExecutors ??= createNativeExecutors());
}

function defaultNativeSpecs(): ReadonlyMap<string, ExecutorNativeContentSpec> {
  if (!cachedNativeSpecs) {
    const entries: Array<[string, ExecutorNativeContentSpec]> = [];
    for (const executor of defaultNativeExecutors()) {
      const spec = resolveNativeContentSpec(executor.nativeContent);
      if (spec) entries.push([executor.descriptor.id, spec]);
    }
    cachedNativeSpecs = new Map(entries);
  }
  return cachedNativeSpecs;
}

export function sharedNativeHomeProviders(): ReadonlySet<string> {
  if (!cachedSharedHomeProviders) {
    cachedSharedHomeProviders = new Set(
      defaultNativeExecutors()
        .filter(executor => executor.descriptor.runtimeTraits?.sharedNativeHome)
        .map(executor => executor.descriptor.id),
    );
  }
  return cachedSharedHomeProviders;
}

export function nativeContentSpec(provider: string, executors?: readonly AgentExecutor[]): ExecutorNativeContentSpec | undefined {
  if (!executors) return defaultNativeSpecs().get(provider);
  const matched = executors.find(executor => executor.descriptor.id === provider);
  return resolveNativeContentSpec(matched?.nativeContent);
}

export function hasNativeToolContent(provider: string, executors?: readonly AgentExecutor[]): boolean {
  return Boolean(nativeContentSpec(provider, executors));
}

/** Each provider owns its native record format and detail projection via its registered nativeContent spec. */
export function readNativeTool(root: string, reference: NativeToolContent, executors?: readonly AgentExecutor[]): ConversationEntry | undefined {
  return nativeContentSpec(reference.provider, executors)?.readTool(root, reference);
}
