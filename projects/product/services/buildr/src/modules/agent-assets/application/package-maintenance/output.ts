export function createPackageOutput(deps: any): any  {
  const {
    assertSafeAssetTarget,
    atomicWriteJson,
    collectFiles,
    crypto,
    ensureDirectory,
    existsDirectory,
    existsFile,
    fs,
    optionValue,
    resourcesRoot,
    parseManifestFileEntry,
    path,
    productRoot,
    readPackageManifest,
    toPosixRelative,
  } = deps;

  const PACKAGE_OUTPUT_RECEIPT = '.buildr-package-output.json';
  const PACKAGE_OUTPUT_RECEIPT_SCHEMA = 'buildr.package-output/v1';

  function packageOutputInventory(outputRoot: any): any  {
    if (!existsDirectory(outputRoot)) return [];
    return collectFiles(outputRoot)
      .filter((file: any) => path.basename(file) !== PACKAGE_OUTPUT_RECEIPT)
      .map((file: any) => ({
        path: toPosixRelative(outputRoot, file),
        integrity: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`,
      }))
      .sort((left: any, right: any) => left.path.localeCompare(right.path));
  }

  function packageOutputIntegrity(inventory: any): any  {
    return `sha256-${crypto.createHash('sha256').update(JSON.stringify(inventory)).digest('hex')}`;
  }

  function readPackageOutputReceipt(outDir: any): any  {
    const file = path.join(outDir, PACKAGE_OUTPUT_RECEIPT);
    if (!existsFile(file)) return null;
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) { throw new Error(`Package output receipt is invalid JSON: ${error.message}`); }
    if (receipt?.schemaVersion !== PACKAGE_OUTPUT_RECEIPT_SCHEMA || !Array.isArray(receipt.files) || typeof receipt.integrity !== 'string') {
      throw new Error('Package output receipt has an unsupported schema.');
    }
    return receipt;
  }

  function assertSafePackageOutput(outDir: any): any  {
    const root = productRoot();
    const candidate = path.resolve(outDir);
    assertSafeAssetTarget(root, candidate, path.dirname(candidate), 'Package output');
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error(`Package output is a symbolic link: ${candidate}`);
    for (const collection of ['bin', 'src', 'test', 'scripts', 'package', 'openspec', 'docs', 'agents', 'skills', 'capabilities', 'services']) {
      if (candidate === path.join(root, collection)) throw new Error(`Package output is a protected Product collection root: ${candidate}`);
    }
    return candidate;
  }

  function validateReplaceablePackageOutput(outDir: any): any  {
    if (!fs.existsSync(outDir)) return;
    if (!existsDirectory(outDir)) throw new Error(`Package output target is not a directory: ${outDir}`);
    if (fs.readdirSync(outDir).length === 0) return;
    const receipt = readPackageOutputReceipt(outDir);
    if (!receipt) throw new Error(`Refusing to replace non-empty package output without ${PACKAGE_OUTPUT_RECEIPT}: ${outDir}`);
    const liveFiles = packageOutputInventory(outDir);
    const liveIntegrity = packageOutputIntegrity(liveFiles);
    if (liveIntegrity !== receipt.integrity || JSON.stringify(liveFiles) !== JSON.stringify(receipt.files)) {
      throw new Error(`Refusing to replace modified package output: ${outDir}`);
    }
  }

  function buildPackageOutput(outDir: any, root: any, manifest: any): any  {
    ensureDirectory(outDir);

    const manifestSource = path.join(resourcesRoot(), 'manifest.yml');
    const manifestTarget = path.join(outDir, 'resources/manifest.yml');
    ensureDirectory(path.dirname(manifestTarget));
    fs.copyFileSync(manifestSource, manifestTarget);

    for (const includePath of manifest.include) {
      const source = path.resolve(root, includePath);
      if (!fs.existsSync(source)) {
        throw new Error(`Manifest include does not exist: ${includePath}`);
      }
      const target = path.join(outDir, includePath);
      ensureDirectory(path.dirname(target));
      fs.cpSync(source, target, { recursive: true });
    }

    for (const section of ['workspaceFiles', 'projectFiles']) {
      for (const rawEntry of manifest[section]) {
        const entry = parseManifestFileEntry(rawEntry, section);
        const source = path.resolve(root, entry.source);
        if (!fs.existsSync(source)) {
          throw new Error(`Manifest source does not exist: ${entry.source}`);
        }
        const target = path.join(outDir, entry.source);
        ensureDirectory(path.dirname(target));
        fs.copyFileSync(source, target);
      }
    }

    const files = packageOutputInventory(outDir);
    atomicWriteJson(path.join(outDir, PACKAGE_OUTPUT_RECEIPT), {
      schemaVersion: PACKAGE_OUTPUT_RECEIPT_SCHEMA,
      generatedAt: new Date().toISOString(),
      productVersion: (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch { return null; } })(),
      files,
      integrity: packageOutputIntegrity(files),
    });
  }

  function packageBuild(args: any): any  {
    const root = productRoot();
    const manifest = readPackageManifest();
    const outDir = assertSafePackageOutput(path.resolve(optionValue(args, '--out', path.join(root, 'dist', 'buildr-package'))));
    validateReplaceablePackageOutput(outDir);
    const staging = path.join(path.dirname(outDir), `.${path.basename(outDir)}.buildr-stage-${crypto.randomUUID()}`);
    const backup = path.join(path.dirname(outDir), `.${path.basename(outDir)}.buildr-backup-${crypto.randomUUID()}`);
    try {
      buildPackageOutput(staging, root, manifest);
      if (fs.existsSync(outDir)) fs.renameSync(outDir, backup);
      fs.renameSync(staging, outDir);
      if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    } catch (error: any) {
      if (fs.existsSync(backup)) {
        if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
        fs.renameSync(backup, outDir);
      }
      throw error;
    } finally {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    }

    console.log(`Built Buildr package assets at ${outDir}`);
  }

  return {
    packageOutputInventory,
    packageOutputIntegrity,
    readPackageOutputReceipt,
    assertSafePackageOutput,
    validateReplaceablePackageOutput,
    buildPackageOutput,
    packageBuild,
  };
}
