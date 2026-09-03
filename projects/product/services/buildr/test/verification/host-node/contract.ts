#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const productRoot: any = path.resolve(import.meta.dirname, '../../..');
const manifest: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
const match: any = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/.exec(manifest.engines?.node || '');
assert.ok(match, 'package engines.node must declare one bounded major line');
const [, minMajor, minMinor, minPatch, maxMajor]: any = match.map(Number);
const [major, minor, patch]: any = process.versions.node.split('.').map(Number);
assert.equal(major >= minMajor && major < maxMajor, true, `Host Node ${process.versions.node} must satisfy ${manifest.engines.node}`);
assert.equal(major > minMajor || minor > minMinor || (minor === minMinor && patch >= minPatch), true, `Host Node ${process.versions.node} must satisfy ${manifest.engines.node}`);
assert.equal(process.release.name, 'node');
process.stdout.write(`Host Node contract passed: platform=${process.platform} node=${process.versions.node}.\n`);
