#!/usr/bin/env node

import process from 'node:process';
import { runTaskRetrospectiveDriver } from './task-retrospective-driver-runner.mjs';

process.exitCode = await runTaskRetrospectiveDriver(process.argv.slice(2));
