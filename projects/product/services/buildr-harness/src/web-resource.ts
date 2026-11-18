import {fileURLToPath} from 'node:url';
export const harnessWebRoot = () => fileURLToPath(new URL('../build/harness-web-dist/', import.meta.url));
