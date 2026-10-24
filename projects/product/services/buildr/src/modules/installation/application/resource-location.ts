import fs from 'node:fs';
import { describePackageResources, inspectSharedResources, sharedResourcesRoot } from '../../../infrastructure/product-resources/shared-resources.ts';
import { openDirectory } from '../../../infrastructure/filesystem/open-directory.ts';

export function createResourceLocation({ open = openDirectory, productRoot }: { open?: typeof openDirectory; productRoot?: () => string } = {}) {
  function resourceLocation() {
    const set = describePackageResources(productRoot?.());
    const directory = sharedResourcesRoot();
    let available = false, issue: string | null = null;
    try { inspectSharedResources(set.id); available = true; }
    catch { issue = fs.existsSync(directory) ? '当前版本的共享资源需要修复，可通过更新或工作空间准备恢复。' : '当前版本的共享资源尚未准备；添加工作空间或更新时会自动准备。'; }
    return { version: set.version, resourceSet: set.id, path: directory, available, issue };
  }
  return {
    resourceLocation,
    async openResourceLocation(input: { resourceSet: string }) {
      const current = resourceLocation();
      if (input.resourceSet !== current.resourceSet) throw Object.assign(new Error('当前版本已变化，请重新读取安装信息。'), { status: 409, code: 'resource_location_changed' });
      if (!current.available) throw Object.assign(new Error(current.issue!), { status: 409, code: 'resource_location_unavailable' });
      return open(current.path);
    },
  };
}
