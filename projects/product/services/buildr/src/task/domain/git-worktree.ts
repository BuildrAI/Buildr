export type GitWorktreeCleanupDeliveryInput = {
  expectedSources?: Record<string, string>;
  deliveredRefs?: Record<string, string>;
};

export type GitWorktreeReviewedDelivery = {
  sourceHead: string;
  targetHead: string;
};

export type GitWorktreeReviewedDeliveries = Record<string, GitWorktreeReviewedDelivery>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringRecord(value: unknown, message: string): Record<string, string> {
  if (!isObject(value)) throw new Error(message);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw new Error(message);
    result[key] = entry;
  }
  return result;
}

export function normalizeGitWorktreeCleanupDelivery(
  input: unknown = {},
  selectors: readonly string[] = [],
): GitWorktreeReviewedDeliveries {
  const invalid = (message: string): never => {
    const error = new Error(message);
    Object.assign(error, { code: 'git_worktree_cleanup_delivery_invalid', status: 400 });
    throw error;
  };
  if (!isObject(input) || Object.keys(input).some((key) => !['expectedSources', 'deliveredRefs'].includes(key))) {
    return invalid('清理只接受 expectedSources 与 deliveredRefs。');
  }
  let sources: Record<string, string>;
  let targets: Record<string, string>;
  try {
    sources = stringRecord(input.expectedSources ?? {}, '源提交与交付提交必须按仓库提供。');
    targets = stringRecord(input.deliveredRefs ?? {}, '源提交与交付提交必须按仓库提供。');
  } catch (error) {
    return invalid(error instanceof Error ? error.message : '源提交与交付提交必须按仓库提供。');
  }
  const keys = Object.keys(sources).sort();
  const targetKeys = Object.keys(targets).sort();
  if (!keys.length && !targetKeys.length) return {};
  const expectedKeys = [...new Set(selectors)].sort();
  if (JSON.stringify(keys) !== JSON.stringify(targetKeys) || JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    return invalid('源提交与交付提交必须成对覆盖本任务全部受管Git仓库，不接受缺失或未知仓库。');
  }
  const commit = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  const result: GitWorktreeReviewedDeliveries = {};
  for (const selector of keys) {
    const sourceHead = sources[selector];
    const targetHead = targets[selector];
    if (!commit.test(sourceHead) || !commit.test(targetHead)) {
      return invalid('必须传入已核对的完整提交编号，不接受分支名或缩写。');
    }
    result[selector] = { sourceHead, targetHead };
  }
  return result;
}
