import fs from 'node:fs';
import path from 'node:path';

import {
  readApplicationPayloadManifest,
  resolveApplicationPayloadRoot,
  resolveProductRoot,
} from '../../../infrastructure/product-resources/index.mjs';
import { readCurrentInstallationOrigin, runtimeIdentityForOrigin } from './installation-origin.ts';

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
    sourceCommit: formal ? origin.sourceCommit : payload?.sourceCommit || origin.sourceCommit,
  });
}
