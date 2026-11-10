import fs from 'node:fs';
import path from 'node:path';
import { selectHostToolCaches, prepareHostToolDirectory } from './toolchain-locations.ts';
import { ensureStorageDirectory } from './files.ts';

/** One local tool environment for every executor. Account configuration and
 * native HOME/session files are deliberately absent from this declaration. */
export function sharedToolchainEnvironment(root: string, input: Readonly<Record<string, string>>): { cacheRoot: string; environment: Record<string, string> } {
  const tools = path.join(root, 'toolchains'), cacheRoot = path.join(tools, 'cache');
  for (const relative of ['toolchains', 'toolchains/cache', ...['npm', 'yarn', 'node-compile', 'pip', 'uv', 'python', 'maven', 'node-gyp', 'corepack'].map(name => 'toolchains/cache/' + name), 'toolchains/runtimes']) ensureStorageDirectory(root, path.join(root, relative));
  const environment: Record<string, string> = { ...input, BUILDR_TOOLCHAIN_ROOT: tools, COREPACK_HOME: path.join(cacheRoot,'corepack'), npm_config_devdir: path.join(cacheRoot,'node-gyp'), npm_package_config_node_gyp_devdir: path.join(cacheRoot,'node-gyp'), npm_config_cache: path.join(cacheRoot, 'npm'), NPM_CONFIG_CACHE: path.join(cacheRoot, 'npm'), NODE_COMPILE_CACHE: path.join(cacheRoot, 'node-compile'), YARN_CACHE_FOLDER: path.join(cacheRoot, 'yarn'), PIP_CACHE_DIR: path.join(cacheRoot, 'pip'), UV_CACHE_DIR: path.join(cacheRoot, 'uv'), PYTHONPYCACHEPREFIX: path.join(cacheRoot, 'python') };
  const selected=selectHostToolCaches(root,input);
  for(const [name,keys]of [['npm',['npm_config_cache','NPM_CONFIG_CACHE']],['yarn',['YARN_CACHE_FOLDER']],['corepack',['COREPACK_HOME']],['node-gyp',['npm_config_devdir','npm_package_config_node_gyp_devdir']],['pip',['PIP_CACHE_DIR']],['uv',['UV_CACHE_DIR']],['python',['PYTHONPYCACHEPREFIX']],['node-compile',['NODE_COMPILE_CACHE']]] as const){for(const key of keys)if(selected[name])environment[key]=selected[name]!;}
  const hostHome = input.BUILDR_TOOLCHAIN_HOST_HOME || input.BUILDR_HOST_HOME || input.HOME || input.USERPROFILE;
  const existing = (value: string | undefined): string | undefined => {
    try { return value && path.isAbsolute(value) && fs.statSync(value).isDirectory() ? fs.realpathSync(value) : undefined; } catch { return; }
  };
  // A local launcher's literal installation assignments are public paths, not
  // shell code: never source it, expand variables, or inherit credential flags.
  let java = existing(input.JAVA_HOME), maven = existing(input.MAVEN_HOME || input.M2_HOME);
  for (const directory of (input.PATH ?? '').split(path.delimiter)) {
    if (java && maven) break;
    if (!path.isAbsolute(directory)) continue;
    try {
      const file = path.join(directory, process.platform === 'win32' ? 'mvn.cmd' : 'mvn'), stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 64 * 1024) continue;
      const text = fs.readFileSync(file, 'utf8');
      java ??= existing(text.match(/^JAVA_HOME=(?:"([^"$`\n]+)"|'([^'$`\n]+)'|([^\s"'$`]+))\s*$/m)?.slice(1).find(Boolean));
      const executable = text.match(/^exec (?:"([^"$`\n]+)"|'([^'$`\n]+)'|([^\s"'$`]+)) "\$@"\s*$/m)?.slice(1).find(Boolean);
      if (executable && path.isAbsolute(executable) && path.basename(executable) === 'mvn') maven ??= existing(path.dirname(path.dirname(executable)));
    } catch { /* A different launcher is not a reason to install a second tool. */ }
  }
  if (java) environment.JAVA_HOME = java;
  if (maven) environment.MAVEN_HOME = maven;
  const bin = [java && path.join(java, 'bin'), maven && path.join(maven, 'bin')].filter((value): value is string => !!value);
  environment.PATH = [...bin, input.PATH ?? ''].join(path.delimiter);
  // Reuse the host repository; never copy ~/.m2/settings.xml into a private HOME.
  const repository = prepareHostToolDirectory(hostHome,'.m2/repository',root) ?? path.join(cacheRoot, 'maven');
  environment.BUILDR_MAVEN_REPOSITORY = repository;
  // The JVM parses quoted JAVA_TOOL_OPTIONS itself, including paths with spaces.
  environment.JAVA_TOOL_OPTIONS = '-Dmaven.repo.local="' + repository.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  for (const [key, relative] of [['NVM_DIR', '.nvm'], ['VOLTA_HOME', '.volta'], ['ASDF_DATA_DIR', '.asdf'], ['MISE_DATA_DIR', '.local/share/mise'], ['SDKMAN_DIR', '.sdkman']] as const) {
    const configured=existing(input[key]);
    environment[key] = configured&&!configured.startsWith(root+path.sep)?configured:hostHome&&path.isAbsolute(hostHome)?path.join(hostHome,relative):path.join(tools,'runtimes',key.toLowerCase());
  }
  return { cacheRoot, environment };
}
