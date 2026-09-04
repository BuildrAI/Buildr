export type SourceCreationPolicyRuntime = {
  inspectAttachedGitRoot(rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string): {
    rootPath: string;
    url: string;
    integrationBranch: string;
  };
};

export type AttachedSource = {
  rootPath: string;
  source: { type: 'git'; root: 'attached'; path: string; git: { url: string; remote: string; integrationBranch: string } };
};

export function isGitUrl(value: string) {
  return /^(https?:\/\/|ssh:\/\/|git@)/.test(value) || /\.git$/.test(value);
}

export function isProjectGitUrl(value: string) {
  return /^(https?:\/\/|ssh:\/\/|git@|file:\/\/)/.test(value);
}

export function defaultAssetDescription(kind: 'Project' | 'Service', id: string) {
  return `TODO: 补充 ${kind} ${id} 的用途说明。`;
}

export function attachedGitSource(
  runtime: SourceCreationPolicyRuntime,
  rawPath: string,
  targetRoot: string,
  remote: string,
  integrationBranch: string | null,
  label: string,
): AttachedSource {
  const attached = runtime.inspectAttachedGitRoot(rawPath, targetRoot, remote, integrationBranch, label);
  return {
    rootPath: attached.rootPath,
    source: {
      type: 'git',
      root: 'attached',
      path: attached.rootPath,
      git: { url: attached.url, remote, integrationBranch: attached.integrationBranch },
    },
  };
}

export function registerSourceCreationPolicy(runtime: SourceCreationPolicyRuntime) {
  return Object.assign(runtime, {
    isGitUrl,
    isProjectGitUrl,
    defaultAssetDescription,
    attachedGitSource: (rawPath: string, targetRoot: string, remote: string, integrationBranch: string | null, label: string) => attachedGitSource(runtime, rawPath, targetRoot, remote, integrationBranch, label),
  });
}
