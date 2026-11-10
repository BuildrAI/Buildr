import { LOCAL_PLATFORM_POLICY, validatePackageHandoff } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';

/** Only a byte-bound new-policy handoff may omit the opposite OS. Historical
 * handoffs keep their original requirements; no failure is converted to a pass. */
export function localPackageCoverage(handoff: any, shards: readonly any[], hosts: readonly any[]): any {
  validatePackageHandoff(handoff);
  const optional = handoff.platformPolicy === LOCAL_PLATFORM_POLICY;
  const optionalEvidenceIds = optional ? [`runtime-${handoff.remoteRunner}`, `host-minimum-${handoff.remoteRunner}`].sort() : [];
  const ids = new Set(optionalEvidenceIds);
  return {
    shards: shards.filter(shard => !ids.has(shard.id)),
    hostNodeTuples: hosts.filter(host => !ids.has(host.id)),
    ...(optional ? { platformVerification: {
      policy: LOCAL_PLATFORM_POLICY, requiredRunner: handoff.localRunner,
      optionalRunner: handoff.remoteRunner, optionalEvidenceIds,
      status: 'not-verified', reason: '对端系统为独立可选冒烟，不属于本候选的必需证明；未验证不表示通过。',
    } } : {}),
  };
}
