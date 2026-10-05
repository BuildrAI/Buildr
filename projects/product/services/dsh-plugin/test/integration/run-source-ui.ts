/** Execute only native source UI assembly using explicit prepared SDK/consumer inputs. */
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createSdkRequire} from '../../tools/sdk-require.ts';
const sdk=process.env.BUILDR_DSH_SOURCE_UI_SDK_ROOT;
if(sdk===undefined)throw Error('BUILDR_DSH_SOURCE_UI_SDK_ROOT is required');
const require=createSdkRequire(sdk),cli=path.join(path.dirname(require.resolve('vitest/package.json')),'vitest.mjs');
const result=spawnSync(process.execPath,[cli,'run','--config',path.join(import.meta.dirname,'source-ui.vitest.config.ts'),'--reporter','verbose'],{stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);
