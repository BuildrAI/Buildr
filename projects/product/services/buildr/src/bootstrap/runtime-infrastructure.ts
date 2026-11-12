import * as platform from '../infrastructure/platform.ts';
import { registerInfrastructure } from '../infrastructure/index.ts';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.ts';

export function createRuntimeInfrastructure(): any {
  const runtime = { ...platform };
  registerInfrastructure(runtime);
  registerProductInvocation(runtime);
  return runtime;
}
