import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from './process.ts';
import YAML from 'yaml';
import {
  BUILDR_REQUIRED_BLOCK_START,
  BOOTSTRAP_CONTRACT_RESOURCE,
  LEGACY_PACKAGE_PATHS,
  PACKAGE_RUNTIME_TARGET,
  RESOURCE_WORKSPACE_ROOT,
} from './product-layout.ts';

export {
  fs, crypto, os, path, process, fileURLToPath, execFileSync, spawnSync, YAML,
  RESOURCE_WORKSPACE_ROOT, PACKAGE_RUNTIME_TARGET, BOOTSTRAP_CONTRACT_RESOURCE,
  LEGACY_PACKAGE_PATHS,
  BUILDR_REQUIRED_BLOCK_START,
};
