#!/usr/bin/env node

import process from 'node:process';
import { reportCliFailure, runCli } from '../src/bootstrap/cli/main.ts';

try {
  await runCli(process.argv);
} catch (error) {
  reportCliFailure(error, process.argv);
}
