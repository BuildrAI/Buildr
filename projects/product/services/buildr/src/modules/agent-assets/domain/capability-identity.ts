export function capabilityKey(capability: unknown, version: unknown): string {
  return `${capability}@${version}`;
}

const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;

export function validateCapabilityIdentity(capability: unknown, version: unknown, label: string): void {
  if (typeof capability !== 'string' || !CAPABILITY_ID.test(capability)) {
    throw new Error(`${label}.capability must be a lowercase namespaced id`);
  }
  if (!Number.isInteger(version) || Number(version) <= 0) {
    throw new Error(`${label}.version must be a positive integer`);
  }
}
