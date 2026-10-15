/** Source-only pointer selection; the existing open bridge never consumes this override. */
import { BuildrBridgeError } from './bridge.ts';
import { discoverBinding, validateBinding } from './process.ts';
import type { Binding, BuildrChannel } from './process.ts';
import type { Config } from './src/types.ts';

/** Select one explicitly authorized development source reader, or preserve normal discovery. */
export async function resolveSourceBinding(
  config: Config, channel: BuildrChannel,
  discover: () => Promise<Readonly<Binding> | null> = discoverBinding,
): Promise<Readonly<Binding> | null> {
  // Schemastery represents an omitted optional object as {}; it is not an explicit pointer.
  const sourceBinding = config.sourceBinding;
  if (sourceBinding !== undefined && Object.keys(sourceBinding).length !== 0) {
    if (channel !== 'development') {
      throw new BuildrBridgeError('source-binding-unsupported', 'npm 安装用途入口不支持开发来源绑定；未读取其他安装。');
    }
    return validateBinding(sourceBinding);
  }
  const binding = config.binding;
  return binding?.nodeExecutable !== undefined || binding?.cliEntry !== undefined
    ? validateBinding(binding)
    : discover();
}

/**
 * Resolve candidate-reader and normal command pointers independently; status proves their channel later.
 * @param config - existing normal pointer and optional development metadata reader.
 * @param channel - the channel owned by this plugin package.
 * @param discover - normal installation discovery, unaffected by the source override.
 * @returns distinct valid pointers; a failed optional pointer never substitutes for the other.
 */
export async function resolveCommandIdentityBindings(
  config: Config, channel: BuildrChannel,
  discover: () => Promise<Readonly<Binding> | null> = discoverBinding,
): Promise<readonly Readonly<Binding>[]> {
  const candidate = config.sourceBinding;
  const sources: Promise<Readonly<Binding> | null>[] = [];
  if (channel === 'development' && candidate !== undefined && Object.keys(candidate).length !== 0) {
    sources.push(Promise.resolve().then(() => validateBinding(candidate)));
  }
  sources.push(Promise.resolve().then(() => {
    const normal = config.binding;
    return normal?.nodeExecutable !== undefined || normal?.cliEntry !== undefined ? validateBinding(normal) : discover();
  }));
  const values = await Promise.allSettled(sources), distinct = new Map<string, Readonly<Binding>>();
  for (const value of values) if (value.status === 'fulfilled' && value.value !== null) {
    const binding = value.value;
    const key = [binding.nodeExecutable, binding.cliEntry, binding.nodeSha256 ?? '', binding.cliSha256 ?? ''].join('\0');
    distinct.set(key, binding);
  }
  return [...distinct.values()];
}
