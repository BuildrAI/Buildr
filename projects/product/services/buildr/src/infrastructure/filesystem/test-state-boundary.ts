import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function boundaryError(reason: string) {
  return Object.assign(new Error(`测试状态写入越界或隔离环境不可用：${reason}。请使用隔离测试入口，不得回退用户数据目录。`), {
    code: 'buildr_test_state_boundary', status: 409,
  });
}

/** Resolve missing leaves through their nearest existing ancestor, including links. */
function realDestination(value: string): string {
  let ancestor = path.resolve(value);
  const suffix: string[] = [];
  while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw boundaryError('目标路径无法解析');
    suffix.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...suffix);
}

/**
 * Test state is a lifecycle boundary, not a workspace-name heuristic.
 * Capture the constructing scope as well as checking the current one so a
 * cached repository cannot acquire user-state write access after env changes.
 * Ordinary user/preview processes have neither test signal and remain unchanged.
 */
export function createTestStateWriteBoundary(env: NodeJS.ProcessEnv = process.env) {
  const declaredRoot = env.BUILDR_TEST_LOCAL_STATE_ROOT;
  // Bind the observed filesystem object rather than a mutable symlink spelling.
  let boundRoot = declaredRoot;
  try { if (declaredRoot && path.isAbsolute(declaredRoot)) boundRoot = fs.realpathSync(declaredRoot); }
  catch { /* Invalid/missing lifecycle state is rejected before writes, not reads. */ }
  const boundRequired = Boolean(boundRoot || env.BUILDR_TEST_STATE_REQUIRED === '1');
  return (...destinations: string[]) => {
    const currentRoot = env.BUILDR_TEST_LOCAL_STATE_ROOT;
    if (boundRoot && !currentRoot) throw boundaryError('测试状态根已从环境中移除');
    const required = boundRequired || currentRoot || env.BUILDR_TEST_STATE_REQUIRED === '1';
    if (!required) return;
    if (!currentRoot) throw boundaryError('缺少测试状态根');
    for (const candidate of new Set([boundRoot, currentRoot].filter((root): root is string => Boolean(root)))) {
      try {
        if (!path.isAbsolute(candidate)) throw boundaryError('测试状态根不是绝对路径');
        const root = fs.realpathSync(candidate);
        const markerPath = path.join(root, '.buildr-test-state.json');
        const markerStat = fs.lstatSync(markerPath);
        if (!markerStat.isFile() || markerStat.isSymbolicLink()) throw boundaryError('测试身份不是普通文件');
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (marker.schemaVersion !== 1 || marker.root !== root || marker.completed !== false
          || !Number.isSafeInteger(marker.producerPid) || marker.producerPid <= 0) throw boundaryError('测试身份失效');
        for (const destination of destinations) {
          if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw boundaryError('写入目标缺少绝对路径');
          const relative = path.relative(root, realDestination(destination));
          if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw boundaryError('写入目标不属于当前测试状态根');
          }
        }
      } catch (error: any) {
        if (error.code === 'buildr_test_state_boundary') throw error;
        throw boundaryError('无法核验测试状态身份或目标路径');
      }
    }
  };
}
