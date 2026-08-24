#!/usr/bin/env node

import process from 'node:process';
import { runTaskPlanningIdentityDriver } from './task-planning-identity-driver-runner.mjs';

process.exitCode = await runTaskPlanningIdentityDriver(process.argv.slice(2));
