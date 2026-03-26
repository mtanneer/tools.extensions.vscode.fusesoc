import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  files: 'out/test/**/*.test.js',
  extensionDevelopmentPath: __dirname,
  mocha: {
    timeout: 20000,
    ui: 'tdd',
  },
});
