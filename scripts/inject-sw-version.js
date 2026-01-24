#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../client/public/sw.js');

// Get git SHA (short version)
const gitSha = execSync('git rev-parse --short HEAD').toString().trim();

// Read sw.js
let swContent = readFileSync(swPath, 'utf8');

// Replace CACHE_VERSION with git SHA
swContent = swContent.replace(
  /const CACHE_VERSION = '[^']*';/,
  `const CACHE_VERSION = '${gitSha}';`
);

// Write back
writeFileSync(swPath, swContent);

console.log(`Injected git SHA ${gitSha} into sw.js CACHE_VERSION`);
