export function createCapabilityRetirement({ assertSafeAssetTarget, crypto, existsFile, fs, path, removePath }) {
  function applyCapabilityRetirements({ targetRoot, manifest, contracts, bindings, findings, changed, checkOnly }) {
    const retirements = (manifest.capabilityContracts || []).flatMap((contract) => contract.replaces || []);
    const currentKeys = new Set((manifest.capabilityContracts || []).map((contract) => `${contract.id}@${contract.version}`));
    const replacementKeys = new Set(retirements.map((retirement) => `${retirement.id}@${retirement.version}`));
    const currentProviders = new Set((manifest.builtins?.skills || []).map((skill) => skill.id));
    const orphanKeys = new Set(bindings
      .filter((binding) => binding.capability.startsWith('buildr.') && !currentProviders.has(binding.provider))
      .map((binding) => `${binding.capability}@${binding.version}`)
      .filter((key) => !currentKeys.has(key) && !replacementKeys.has(key)));

    for (const key of orphanKeys) {
      const contractMatches = contracts.filter((item) => `${item.id}@${item.version}` === key);
      const bindingMatches = bindings.filter((item) => `${item.capability}@${item.version}` === key);
      if (contractMatches.length > 1 || bindingMatches.length > 1) throw new Error(`Orphan Buildr capability identity is duplicated: ${key}`);
      const contractEntry = contractMatches[0] || null;
      if (contractEntry && !contractEntry.path?.startsWith('contracts/buildr/')) throw new Error(`Orphan Buildr capability path is outside the managed namespace: ${key}`);
      const targetFile = contractEntry ? assertSafeAssetTarget(targetRoot, path.join(targetRoot, 'skills', contractEntry.path), path.join(targetRoot, 'skills', 'contracts', 'buildr'), 'Orphan Buildr capability retirement') : null;
      findings.push({ type: 'contract', id: key, required: false, status: checkOnly ? 'retiring' : 'retired', path: contractEntry ? `skills/${contractEntry.path}` : null, converge: true });
      if (checkOnly) continue;
      if (contractEntry) contracts.splice(contracts.indexOf(contractEntry), 1);
      for (const bindingEntry of bindingMatches) bindings.splice(bindings.indexOf(bindingEntry), 1);
      if (targetFile && existsFile(targetFile)) { removePath(targetFile); changed.push(`skills/${contractEntry.path}`); }
    }

    for (const retirement of retirements) {
      const contractMatches = contracts.filter((item) => item.id === retirement.id && item.version === retirement.version);
      const bindingMatches = bindings.filter((item) => item.capability === retirement.id && item.version === retirement.version);
      if (contractMatches.length > 1 || bindingMatches.length > 1) throw new Error(`Capability retirement identity is duplicated: ${retirement.id}@${retirement.version}`);
      const targetFile = assertSafeAssetTarget(targetRoot, path.join(targetRoot, retirement.target), path.join(targetRoot, 'skills', 'contracts'), 'Capability contract retirement');
      const targetExists = existsFile(targetFile);
      if (!contractMatches.length && !bindingMatches.length && !targetExists) continue;
      const expectedManifestPath = retirement.target.replace(/^skills\//, '');
      const contractEntry = contractMatches[0] || null;
      if (contractEntry && (contractEntry.path !== expectedManifestPath || contractEntry.description !== retirement.description)) throw new Error(`Capability retirement contract metadata has drifted: ${retirement.id}@${retirement.version}`);
      const bindingEntry = bindingMatches[0] || null;
      if (bindingEntry && bindingEntry.provider !== retirement.provider) throw new Error(`Capability retirement binding has drifted: ${retirement.id}@${retirement.version}`);
      if (targetExists) {
        const integrity = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex')}`;
        const acceptedIntegrities = new Set([retirement.integrity, ...(retirement.legacyIntegrities || [])]);
        if (!acceptedIntegrities.has(integrity)) throw new Error(`Capability retirement file has drifted: ${retirement.target}`);
      }
      findings.push({ type: 'contract', id: `${retirement.id}@${retirement.version}`, required: false, status: checkOnly ? 'retiring' : 'retired', path: retirement.target, converge: true });
      if (!checkOnly) {
        if (contractEntry) contracts.splice(contracts.indexOf(contractEntry), 1);
        if (bindingEntry) bindings.splice(bindings.indexOf(bindingEntry), 1);
        if (targetExists) { removePath(targetFile); changed.push(retirement.target); }
      }
    }
  }

  return { applyCapabilityRetirements };
}
