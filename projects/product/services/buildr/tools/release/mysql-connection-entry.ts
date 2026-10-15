import { runMySqlConnectionProgram } from '../../src/modules/mysql-query/interfaces/program/mysql-connection-program.ts';

runMySqlConnectionProgram().catch(() => { process.stderr.write('MySQL 接入程序执行失败。\n'); process.exitCode = 1; });
