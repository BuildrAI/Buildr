import fs from 'node:fs';
import path from 'node:path';

import {
  readApplicationPayloadManifest,
  resolveApplicationPayloadRoot,
  resolveProductRoot,
} from '../../../infrastructure/product-resources/index.ts';
import { readCurrentInstallationOrigin, runtimeIdentityForOrigin } from './installation-origin.ts';

/** Compare source origins, never launcher build IDs or the querying process's Node runtime. */
export function developmentInstanceMatchesInstallation(expected: any, running: any): boolean | null {
  const expectedOwnership = expected?.installationIdentity ?? expected?.ownershipIdentity;
  const runningOwnership = running?.installationIdentity;
  const validOwnership = (value: any) => typeof value === 'string' && /^sha256-[a-f0-9]{64}$/.test(value);
  const validCommit = (value: any) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (expected?.channel !== 'development' || running?.channel !== 'development'
      || !validOwnership(expectedOwnership) || !validOwnership(runningOwnership)
      || !validCommit(expected.sourceCommit) || !validCommit(running.sourceCommit)
      || !expected.version || !running.version || !expected.protocolIdentity || !running.protocolIdentity) return null;
  // The origin ownership digest already binds the canonical source root, commit, version and
  // protocol. Older products with that digest still prove their root without a separate field.
  return expectedOwnership === runningOwnership
    && expected.sourceCommit === running.sourceCommit
    && expected.version === running.version
    && expected.protocolIdentity === running.protocolIdentity;
}

export function readCurrentProductIdentity() {
  const productRoot = resolveProductRoot();
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  if (!metadata.name || !metadata.version) throw new Error('Buildr package identity is incomplete.');
  const payloadRoot = resolveApplicationPayloadRoot();
  const payload = payloadRoot ? readApplicationPayloadManifest(payloadRoot) : null;
  const origin = readCurrentInstallationOrigin(productRoot, { payloadRoot, payloadManifest: payload });
  const runtime = runtimeIdentityForOrigin(origin);
  const formal = origin.channel === 'npm';
  return Object.freeze({
    package: metadata.name,
    version: metadata.version,
    protocolIdentity: formal ? origin.protocolIdentity : payload?.protocolIdentity || origin.protocolIdentity,
    applicationPayloadDigest: formal ? origin.applicationPayloadDigest : payload?.applicationPayloadDigest || origin.applicationPayloadDigest,
    channel: origin.channel,
    runtime,
    installationIdentity: origin.ownershipIdentity,
    sourceCommit: origin.channel === 'development' || formal ? origin.sourceCommit : payload?.sourceCommit || origin.sourceCommit,
    ...(origin.channel === 'development' ? { sourceRoot: origin.sourceRoot || origin.installUnit } : {}),
  });
}
