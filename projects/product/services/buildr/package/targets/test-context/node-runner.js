import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
function normalizeFiles(files, cwd) {
    const result = files.map((item) => typeof item === 'string' ? { file: item, signature: 'default' } : item);
    for (const item of result) {
        if (!item || typeof item.file !== 'string' || !item.file)
            throw new Error('node_test_context_runner_input_invalid: each file descriptor requires file.');
        if (item.signature != null && typeof item.signature !== 'string')
            throw new Error('node_test_context_runner_input_invalid: file signature must be a string.');
    }
    return result.map((item) => ({ file: path.resolve(cwd, item.file), signature: item.signature ?? 'default' }))
        .sort((left, right) => left.signature.localeCompare(right.signature) || left.file.localeCompare(right.file));
}
function partition(files, workerCount) {
    const groups = Array.from({ length: workerCount }, () => []);
    for (const item of files) {
        const target = groups.reduce((best, group) => group.length < best.length ? group : best, groups[0]);
        target.push(item);
    }
    return groups.filter((group) => group.length > 0);
}
function runHost(input, options) {
    return new Promise((resolve) => {
        const child = spawn(options.nodeExecutable, [
            '--test',
            '--test-isolation=none',
            '--test-concurrency=1',
            ...input.files,
        ], {
            cwd: input.cwd,
            env: {
                ...options.env,
                NODE_TEST_CONTEXT_HOST: '1',
                NODE_TEST_CONTEXT_EVENTS_FILE: input.eventsFile,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => resolve({ status: 'failed', exitCode: null, signal: null, stdout, stderr: `${stderr}${error.stack || error.message}\n` }));
        child.on('close', (exitCode, signal) => resolve({ status: exitCode === 0 ? 'passed' : 'failed', exitCode, signal, stdout, stderr }));
    });
}
export async function runNodeTestContextHosts(options) {
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const files = normalizeFiles(options.files ?? [], cwd);
    if (files.length === 0)
        throw new Error('node_test_context_runner_input_invalid: at least one file is required.');
    const requestedWorkers = options.workers ?? 1;
    if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1)
        throw new Error('node_test_context_runner_input_invalid: workers must be a positive integer.');
    const workerCount = Math.min(requestedWorkers, files.length);
    const groups = partition(files, workerCount);
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'node-test-context-hosts-'));
    const startedAt = Date.now();
    try {
        const results = await Promise.all(groups.map(async (group, index) => {
            const eventsFile = path.join(temporaryRoot, `host-${index + 1}.ndjson`);
            const result = await runHost({ cwd, files: group.map((item) => item.file), eventsFile }, {
                nodeExecutable: options.nodeExecutable ?? process.execPath,
                env: { ...process.env, ...options.env },
            });
            const events = fs.statSync(eventsFile, { throwIfNoEntry: false })?.isFile()
                ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
                : [];
            return Object.freeze({ host: index + 1, files: Object.freeze(group.map((item) => item.file)), events: Object.freeze(events), ...result });
        }));
        return Object.freeze({
            status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
            workerCount: groups.length,
            durationMs: Date.now() - startedAt,
            hosts: Object.freeze(results),
            events: Object.freeze(results.flatMap((result) => result.events.map((event) => ({ host: result.host, ...event })))),
        });
    }
    finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
}
