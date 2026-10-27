export interface AgentAssetsQueryDependencies {
  readSkillsManifestForWrite: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['readSkillsManifestForWrite'];
  readCommandsManifestForWrite: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['readCommandsManifestForWrite'];
  readPackageManifest: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['readPackageManifest'];
  packageComponentsStatus: ReturnType<typeof import('./components.ts').registerDomainsComponents>['packageComponentsStatus'];
  syncPackageBuiltins: ReturnType<typeof import('./package-maintenance.ts').registerApplicationPackageMaintenance>['syncPackageBuiltins'];
  SUPPORTED_AGENT_IDS: readonly string[];
  runtimeDiscoveryPayload: typeof import('../infrastructure/runtime/adapter-contract.ts').runtimeDiscoveryPayload;
}

export function registerAgentAssetsHttpQuery(dependencies: AgentAssetsQueryDependencies) {
  function listAgentAssets(targetRoot: any): any  {
    const skills: any = dependencies.readSkillsManifestForWrite(targetRoot);
    const commands = dependencies.readCommandsManifestForWrite(targetRoot);
    const packageManifest = dependencies.readPackageManifest();
    const components = dependencies.packageComponentsStatus(targetRoot, packageManifest);
    const builtins = dependencies.syncPackageBuiltins(targetRoot, { checkOnly: true });
    return {
      schemaVersion: 'buildr.agent-assets-inventory/v1',
      skills: Array.isArray(skills) ? skills : skills.skills || [],
      commands: commands.commands || [],
      components: components.components || [],
      builtins: builtins.findings || [],
      runtimeProjection: {
        supportedAgents: dependencies.SUPPORTED_AGENT_IDS,
        adapters: dependencies.runtimeDiscoveryPayload(),
      },
    };
  }

  return Object.freeze({
    listAgentAssets,
  });
}
