import fs from 'node:fs';
import path from 'node:path';

export type ProjectTestingSource = { type?: string; root?: string; path: string };
export type ProjectTestingService = { code: string; source: ProjectTestingSource };
export type ProjectVerificationLocation = {
  testing: string;
  kind: 'project' | 'service';
  service?: string;
  root: string | null;
  cwd: string | null;
  status: 'ready' | 'unavailable';
  diagnostics: string[];
};

type LocationContext = {
  workspaceRoot: string;
  projectRoot: string;
  services: ProjectTestingService[];
  resolveSourceRoot(root: string, source: ProjectTestingSource): string;
};

function existingDirectory(candidate: string, label: string) {
  try {
    if (!fs.statSync(candidate).isDirectory()) throw new Error('not a directory');
    fs.accessSync(candidate, fs.constants.R_OK | fs.constants.X_OK);
    return fs.realpathSync(candidate);
  } catch (error) {
    throw new Error(`${label} 不可用：${candidate} (${error instanceof Error ? error.message : String(error)})。`);
  }
}

/** 只观察结构已验证地图的本机目录，不执行命令、展开通配符或改变声明。 */
export function resolveProjectVerificationLocations(testing: any[], context: LocationContext): ProjectVerificationLocation[] {
  const services = new Map(context.services.map((service) => [service.code, service]));
  return testing.map((item): ProjectVerificationLocation => {
    const location = item.location ?? { kind: 'project' };
    const observed: ProjectVerificationLocation = {
      testing: item.id, kind: location.kind,
      ...(location.kind === 'service' ? { service: location.service } : {}),
      root: null, cwd: null, status: 'ready', diagnostics: [],
    };
    try {
      let candidate = context.projectRoot;
      if (location.kind === 'service') {
        const service = services.get(location.service);
        if (!service?.source) throw new Error(`服务 ${location.service} 的当前来源不可用。`);
        candidate = context.resolveSourceRoot(context.workspaceRoot, service.source);
      }
      const root = existingDirectory(candidate, '测试路径根');
      observed.root = root;
      if (item.full.kind === 'command') {
        const cwd = existingDirectory(path.resolve(root, item.full.cwd), '命令工作目录');
        const relative = path.relative(root, cwd);
        if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error(`命令工作目录越出测试路径根：${item.full.cwd}。`);
        observed.cwd = cwd;
      }
    } catch (error) {
      observed.status = 'unavailable';
      observed.diagnostics.push(error instanceof Error ? error.message : String(error));
    }
    return observed;
  });
}
