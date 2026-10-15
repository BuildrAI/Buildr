#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertMinimumNodeVersion } from '../../../src/infrastructure/process.ts';

const productRoot: any = path.resolve(import.meta.dirname, '../../..');
const manifest: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
const match = /^>=(\d+\.\d+\.\d+)$/.exec(manifest.engines?.node || '');
assert.ok(match, 'package engines.node must declare one minimum stable version');
assertMinimumNodeVersion(process.versions.node, match[1]);
assert.equal(process.release.name, 'node');
process.stdout.write(`Host Node contract passed: platform=${process.platform} node=${process.versions.node}.\n`);
