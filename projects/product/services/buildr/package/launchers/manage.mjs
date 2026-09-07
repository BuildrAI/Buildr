#!/usr/bin/env node
import { main } from './manage.ts';

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
