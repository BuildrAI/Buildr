/** A cooperative business lease in Cordis' current service isolation domain. */
import type { Context } from '@deepseek-ai/cordis';
import type { ActivationStatus } from './src/types.ts';

const KEY = 'buildrPluginOwner';
interface Owner { protocolVersion: 1; packageName: string; token: symbol }
type ActivationContext = Pick<Context, 'get' | 'provide' | 'effect'>;

/** No package installation or other plugin's lifetime is changed by this lease. */
export function createActivation(ctx: ActivationContext, packageName: string) {
  const owner: Owner = { protocolVersion: 1, packageName, token: Symbol(packageName) };
  let disposed = false;
  ctx.effect(() => () => { disposed = true; });
  return {
    status(): ActivationStatus {
      if (disposed) return { active: false, packageName, code: 'disposed', message: '此 Buildr 插件已停用。' };
      // Pending providers already reserve their name. A strict read would miss a sibling that
      // is still activating, although provide() would correctly refuse the second registration.
      let current = ctx.get(KEY, false) as Owner | undefined;
      if (current === undefined) {
        try { ctx.provide(KEY, owner); current = owner; }
        catch { current = ctx.get(KEY, false) as Owner | undefined; }
      }
      if (current?.protocolVersion === 1 && current.token === owner.token) return { active: true, packageName };
      const ownerPackage = typeof current?.packageName === 'string' ? current.packageName : undefined;
      return { active: false, packageName, code: 'plugin-conflict',
        message: '另一个 Buildr 插件正在使用此运行域。请在插件管理页停用不需要的版本，再重新检查。',
        ...(ownerPackage === undefined ? {} : { ownerPackage }) };
    },
  };
}
