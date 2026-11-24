import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const host = pathToFileURL(path.resolve(import.meta.dirname, '../../package.json')).href;
// Cross-product source imports are composed against the host's single dependency instance,
// just as in the production Vite build; standalone Harness tests keep their own modules.
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/buildr-harness-web/src/') && /^(?:react(?:-dom)?(?:\/|$)|antd(?:\/|$)|@ant-design\/icons(?:\/|$)|@codemirror\/|@lezer\/|codemirror$)/u.test(specifier)) {
    return next(specifier, { ...context, parentURL: host });
  }
  return next(specifier, context);
}});
