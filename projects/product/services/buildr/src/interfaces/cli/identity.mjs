import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';
import { readApplicationPayloadManifest, resolveApplicationPayloadRoot, resolveProductRoot } from '../../infrastructure/product-resources/index.mjs';
import { readCurrentInstallationOrigin, runtimeIdentityForOrigin } from '../../infrastructure/product-identity/installation-origin.mjs';

export function readCliIdentity() {
  const productRoot = resolveProductRoot();
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  if (!metadata.name || !metadata.version) throw new Error('Buildr package identity is incomplete.');
  const payloadRoot = resolveApplicationPayloadRoot();
  const payload = payloadRoot ? readApplicationPayloadManifest(payloadRoot) : null;
  const origin = readCurrentInstallationOrigin(productRoot, { payloadRoot, payloadManifest: payload });
  const runtime = runtimeIdentityForOrigin(origin);
  const formal = origin.channel === 'npm';
  return {
    package: metadata.name,
    version: metadata.version,
    protocolIdentity: formal ? origin.protocolIdentity : payload?.protocolIdentity || origin.protocolIdentity,
    applicationPayloadDigest: formal ? origin.applicationPayloadDigest : payload?.applicationPayloadDigest || origin.applicationPayloadDigest,
    channel: origin.channel,
    runtime,
    installationIdentity: origin.ownershipIdentity,
    sourceCommit: formal ? origin.sourceCommit : payload?.sourceCommit || origin.sourceCommit,
  };
}

export function isVersionRequest(rawArgs) {
  return rawArgs.length === 1 && ['--version', '-V', 'version'].includes(rawArgs[0])
    || rawArgs.length === 2 && rawArgs[0] === 'version' && rawArgs[1] === '--json';
}

export function printVersion(rawArgs) {
  const identity = readCliIdentity();
  if (rawArgs.includes('--json')) {
    console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.version, identity), null, 2));
    return;
  }
  console.log(identity.version);
}
