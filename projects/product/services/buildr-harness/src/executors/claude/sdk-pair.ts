import { readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Resolve the companion Claude Agent SDK installed alongside a managed CLI. */
export async function claudeSdkPair(executable: string): Promise<string | undefined> {
  const file = await realpath(executable);
  let directory = path.dirname(file);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.basename(directory) === 'node_modules'
      ? path.join(directory, '@anthropic-ai', 'claude-agent-sdk')
      : path.join(directory, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
    const metadataPath = path.join(candidate, 'package.json');
    try {
      const metadataStat = await stat(metadataPath);
      if (metadataStat.isFile()) {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        if (metadata?.name === '@anthropic-ai/claude-agent-sdk') {
          const sdkRoot = await realpath(candidate);
          const entry = await realpath(createRequire(metadataPath).resolve('@anthropic-ai/claude-agent-sdk'));
          const relative = path.relative(sdkRoot, entry);
          if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            throw new Error('agent_claude_sdk_missing');
          }
          return pathToFileURL(entry).href;
        }
      }
    } catch (error: unknown) {
      if ((error as Error)?.message === 'agent_claude_sdk_missing') throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}
