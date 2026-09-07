export function createBuiltinReceipts(deps: any): any  {
  const { atomicWriteJson, collectFiles, crypto, ensureDirectory, existsDirectory, existsFile, fs, isPlainObject, path, toPosixRelative } = deps;
  const schemaVersion = 'buildr.builtin-receipts/v1';
  const relativePath = '.buildr/builtin-receipts.json';
  const sha256 = (value: any) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

  function assetInventory(assetPath: any, kind: any): any  {
    if (kind === 'command') return [{ path: 'manifest-entry', integrity: sha256(JSON.stringify(assetPath)) }];
    if (kind === 'rule') {
      if (!existsFile(assetPath)) return null;
      if (fs.lstatSync(assetPath).isSymbolicLink()) throw new Error(`Builtin asset must not be a symlink: ${assetPath}`);
      return [{ path: path.basename(assetPath), integrity: sha256(fs.readFileSync(assetPath)) }];
    }
    if (!existsDirectory(assetPath)) return null;
    const inventory: any[] = [];
    for (const file of collectFiles(assetPath).sort()) {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Builtin asset must not contain symlinks: ${file}`);
      const relative = toPosixRelative(assetPath, file);
      if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Builtin asset path escapes its root: ${file}`);
      inventory.push({ path: relative, integrity: sha256(fs.readFileSync(file)) });
    }
    return inventory;
  }

  const inventoryIntegrity = (inventory: any) => inventory === null ? null : sha256(JSON.stringify(inventory));
  function snapshot(assetPath: any, kind: any): any  {
    const files = assetInventory(assetPath, kind);
    return files === null ? null : { files, integrity: inventoryIntegrity(files) };
  }
  const key = (type: any, id: any) => `${type}:${id}`;

  function read(targetRoot: any): any  {
    const receiptPath = path.join(targetRoot, relativePath);
    if (!existsFile(receiptPath)) return { schemaVersion, builtins: [] };
    let value;
    try { value = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (error: any) { throw new Error(`Invalid Builtin receipt JSON: ${error.message}`); }
    if (!isPlainObject(value) || value.schemaVersion !== schemaVersion || !Array.isArray(value.builtins)) throw new Error(`Invalid Builtin receipt schema: ${receiptPath}`);
    const seen: any = new Set();
    for (const item of value.builtins) {
      if (!isPlainObject(item) || !['rule', 'skill', 'command'].includes(item.type) || typeof item.id !== 'string' || typeof item.target !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(item.integrity || '') || !Array.isArray(item.files)) throw new Error(`Invalid Builtin receipt entry: ${JSON.stringify(item)}`);
      const itemKey = key(item.type, item.id);
      if (seen.has(itemKey)) throw new Error(`Duplicate Builtin receipt entry: ${itemKey}`);
      seen.add(itemKey);
      if (path.isAbsolute(item.target) || item.target.split('/').includes('..')) throw new Error(`Builtin receipt target escapes workspace: ${item.target}`);
      const paths: any = new Set();
      for (const file of item.files) {
        if (!isPlainObject(file) || typeof file.path !== 'string' || !file.path || path.isAbsolute(file.path) || file.path.split('/').includes('..') || !/^sha256-[a-f0-9]{64}$/.test(file.integrity || '') || paths.has(file.path)) throw new Error(`Invalid Builtin receipt inventory for ${itemKey}`);
        paths.add(file.path);
      }
      if (inventoryIntegrity(item.files) !== item.integrity) throw new Error(`Builtin receipt integrity mismatch: ${itemKey}`);
    }
    return value;
  }

  function write(targetRoot: any, receipts: any): any  {
    receipts.builtins.sort((left: any, right: any) => key(left.type, left.id).localeCompare(key(right.type, right.id)));
    ensureDirectory(path.dirname(path.join(targetRoot, relativePath)));
    atomicWriteJson(path.join(targetRoot, relativePath), receipts);
    return relativePath;
  }

  const fromSnapshot = (type: any, builtin: any, value: any) => ({ type, id: builtin.id, target: type === 'command' ? 'commands/manifest.yml' : builtin.target, integrity: value.integrity, files: value.files });

  function resolveState({ builtin, liveSnapshot, newSnapshot, oldReceipt, isRestore, required }: any): any  {
    if (liveSnapshot?.integrity === newSnapshot.integrity) return { status: 'installed', converge: false, adopt: true };
    if (isRestore || required) return { status: liveSnapshot ? 'modified' : 'missing', converge: true, adopt: true };
    if (oldReceipt && liveSnapshot?.integrity === oldReceipt.integrity) return { status: 'installed', converge: true, adopt: true };
    if (!oldReceipt && liveSnapshot && (builtin.legacyIntegrities || []).includes(liveSnapshot.integrity)) return { status: 'installed', converge: true, adopt: true, legacy: true };
    return { status: liveSnapshot ? 'modified' : 'missing', converge: false, adopt: false };
  }

  return { relativePath, key, snapshot, read, write, fromSnapshot, resolveState };
}
