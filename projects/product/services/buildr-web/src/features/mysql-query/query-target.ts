import type { MySqlQueryTarget } from './query-types';

/** The builtin query tool consumes this exact source; category alone never selects credentials. */
export function mysqlQueryTarget(instance: {
  id: string; name: string; environment: string; revision: string; enabled: boolean;
  binding?: { skillAssetIdentity: string; definitionId: string; sourceIdentity: string; configVersion: number };
}): MySqlQueryTarget | null {
  const binding = instance.binding;
  if (!binding || !instance.enabled || !/^opaque-[a-f0-9]{64}$/.test(instance.revision)
    || binding.skillAssetIdentity !== 'buildr:skill:mysql-connection' || binding.definitionId !== 'mysql'
    || binding.sourceIdentity !== 'package:skills/connections/mysql-connection' || binding.configVersion !== 1) return null;
  return { id: instance.id, name: instance.name, environment: instance.environment, revision: instance.revision };
}
