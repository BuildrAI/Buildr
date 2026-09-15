function doctorValue(value: any) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function printInstallationChannel(item: any, label: any = item?.channel || 'unknown') {
  const identity = item?.identity;
  console.log(`  ${label}: channel=${doctorValue(item?.channel)} status=${doctorValue(item?.status)} location=${doctorValue(item?.location)}`);
  console.log(`    identity: Buildr=${doctorValue(identity?.version)} protocol=${doctorValue(identity?.protocolIdentity)} payload=${doctorValue(identity?.applicationPayloadDigest)} ownership=${doctorValue(identity?.ownershipIdentity)}`);
  const runtime = item?.runtime;
  console.log(`    runtime: role=${doctorValue(runtime?.role)} Node=${doctorValue(runtime?.version)} executable=${doctorValue(runtime?.executable)} identity=${doctorValue(runtime?.identity)}`);
}

function printRuntimeIdentity(label: any, runtime: any, status: any = null) {
  const identity = typeof runtime?.identity === 'string' ? runtime.identity : runtime?.identity?.digest;
  const version = runtime?.version || runtime?.actualVersion || runtime?.identity?.version;
  console.log(`  ${label}: status=${doctorValue(status)} role=${doctorValue(runtime?.role)} version=${doctorValue(version)} identity=${doctorValue(identity)} executable=${doctorValue(runtime?.executable)}`);
}

export function printProductInstallationReport(result: any) {
  const inventory = result.productInstallation;
  if (!inventory) return;
  console.log('');
  console.log('Product installations:');
  for (const channel of ['npm', 'development']) printInstallationChannel(inventory.channels?.[channel]);
  console.log(`  npm launcher: status=${doctorValue(inventory.launcher?.status)} target=${doctorValue(inventory.launcher?.target)} binding=${doctorValue(inventory.launcher?.binding?.bindingIdentity)} ownership=${doctorValue(inventory.launcher?.binding?.launcherOwnershipIdentity)}`);
  printInstallationChannel(inventory.currentInstallation, 'current installation');
  for (const profile of ['released', 'development']) {
    const profiled = inventory.instances?.[profile];
    console.log(`  ${profile} Web Data Root: ${doctorValue(profiled?.dataRoot)}`);
    console.log(`    instance: status=${doctorValue(profiled?.status)} pid=${doctorValue(profiled?.identity?.pid)} url=${doctorValue(profiled?.identity?.url)} channel=${doctorValue(profiled?.identity?.channel)} health=${doctorValue(profiled?.observation?.health)}`);
  }
  const management = inventory.workspaceManagement;
  if (management) {
    console.log('  Workspace management:');
    for (const profile of ['released', 'development']) {
      const registry = management.registries?.[profile];
      console.log(`    ${profile}: status=${doctorValue(registry?.status)} Data Root=${doctorValue(registry?.dataRoot)} registry=${doctorValue(registry?.file)} entries=${registry?.entries?.length ?? 0}`);
    }
    for (const conflict of management.conflicts || []) console.log(`    conflict: type=${doctorValue(conflict.type)} workspace=${doctorValue(conflict.workspaceId)} released=${doctorValue(conflict.releasedRoot)} development=${doctorValue(conflict.developmentRoot)} reason=${doctorValue(conflict.reason)}`);
  }
  const instance = inventory.currentInstance;
  console.log(`  current instance: status=${doctorValue(instance?.status)} pid=${doctorValue(instance?.identity?.pid)} url=${doctorValue(instance?.identity?.url)} channel=${doctorValue(instance?.identity?.channel)} PID=${instance?.observation?.pidAlive === true ? 'alive' : instance?.observation?.pidAlive === false ? 'not-alive' : '-'} endpoint=${doctorValue(instance?.observation?.endpoint)} health=${doctorValue(instance?.observation?.health)}`);
  console.log(`    identity: Buildr=${doctorValue(instance?.identity?.version)} protocol=${doctorValue(instance?.identity?.protocolIdentity)} payload=${doctorValue(instance?.identity?.applicationPayloadDigest)} ownership=${doctorValue(instance?.identity?.ownershipIdentity)}`);
  console.log(`    runtime: role=${doctorValue(instance?.identity?.runtimeRole || instance?.identity?.runtime?.role)} Node=${doctorValue(instance?.identity?.runtime?.version)} executable=${doctorValue(instance?.identity?.runtime?.executable)} identity=${doctorValue(instance?.identity?.runtime?.identity)}`);

  console.log('Runtime identities:');
  printRuntimeIdentity('Host Node', inventory.channels?.npm?.runtime, inventory.channels?.npm?.status);
  printRuntimeIdentity('Development Node', inventory.channels?.development?.runtime, inventory.channels?.development?.status);
  printRuntimeIdentity('Current main process', inventory.currentInstallation?.runtime, inventory.currentInstallation?.status);
}
