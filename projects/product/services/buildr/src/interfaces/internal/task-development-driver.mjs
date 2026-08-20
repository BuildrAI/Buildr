#!/usr/bin/env node

import process from 'node:process';
import { runTaskDevelopmentDriver } from './task-development-driver-runner.mjs';

process.exitCode = await runTaskDevelopmentDriver(process.argv.slice(2));
