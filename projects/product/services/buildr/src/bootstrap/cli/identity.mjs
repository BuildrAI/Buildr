import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';
import { readCurrentProductIdentity } from '../../infrastructure/product-identity/current-product-identity.mjs';

export function readCliIdentity() {
  return readCurrentProductIdentity();
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
