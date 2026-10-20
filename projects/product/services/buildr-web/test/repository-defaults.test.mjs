import assert from 'node:assert/strict';
import test from 'node:test';
import { repositoryCodeFromUrl } from '../src/features/workspace/components/repository-defaults.ts';

test('Git URL defaults use the final repository segment across HTTPS SSH and SCP', () => {
  for (const url of ['https://github.com/BuildrAI/Buildr.git', 'https://github.com/BuildrAI/Buildr.git/', 'ssh://git@host:2222/team/Buildr.git', 'git@host:team/Buildr.git', 'host:Buildr.git', 'https://host/team/Buildr.git?token=ignored#readme']) assert.equal(repositoryCodeFromUrl(url), 'Buildr');
  assert.equal(repositoryCodeFromUrl(' https://host/team/my-repo/ '), 'my-repo');
});

test('incomplete addresses or nonportable segments do not become repository identifiers', () => {
  for (const url of ['', 'https://host', 'https://host/', 'git@host:', 'https://host/.git', 'https://host/team/a%2Fb.git', 'https://host/team/a%20b.git', 'https://host/team/%ZZ.git']) assert.equal(repositoryCodeFromUrl(url), '', url);
});

test('pasted unicode dashes and invisible characters normalize into portable identifiers', () => {
  assert.equal(repositoryCodeFromUrl('https://host/team/fe–milk–supplier.git'), 'fe-milk-supplier');
  assert.equal(repositoryCodeFromUrl('git@host:team/fe—milk.git'), 'fe-milk');
  assert.equal(repositoryCodeFromUrl('https://host/team/fe−milk​supplier.git'), 'fe-milksupplier');
});
