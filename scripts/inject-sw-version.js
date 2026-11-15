#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../client/public/sw.js');

// CLI deployments may not include Git metadata; each deployment still needs a unique cache version.
let gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
if (!gitSha) {
  try {
    gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    gitSha = process.env.VERCEL_DEPLOYMENT_ID || `build-${Date.now()}`;
  }
}

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
