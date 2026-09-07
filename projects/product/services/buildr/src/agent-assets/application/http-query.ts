export function registerAgentAssetsHttpQuery(runtime: any): any  {
  function listAgentAssets(targetRoot: any): any  {
    const rules = runtime.readRulesManifestForWrite(targetRoot);
    const skills = runtime.readSkillsManifestForWrite(targetRoot);
    const commands = runtime.readCommandsManifestForWrite(targetRoot);
    const packageManifest = runtime.readPackageManifest();
    const components = runtime.packageComponentsStatus(targetRoot, packageManifest);
    const builtins = runtime.syncPackageBuiltins(targetRoot, { checkOnly: true });
    return {
      schemaVersion: 'buildr.agent-assets-inventory/v1',
      rules: rules.rules || [],
      skills: Array.isArray(skills) ? skills : skills.skills || [],
      commands: commands.commands || [],
      components: components.components || [],
      builtins: builtins.findings || [],
      runtimeProjection: {
        supportedAgents: runtime.SUPPORTED_AGENT_IDS,
        adapters: runtime.runtimeDiscoveryPayload(),
      },
    };
  }

  Object.assign(runtime, { listAgentAssets });
  return runtime;
}
