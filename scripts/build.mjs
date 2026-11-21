// Bundles the web game into the Android app's assets folder.
// Usage: node scripts/build.mjs [--serve]
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'android/app/src/main/assets/game');
const serve = process.argv.includes('--serve');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'web/index.html'), resolve(out, 'index.html'));
cpSync(resolve(root, 'web/style.css'), resolve(out, 'style.css'));

const options = {
  entryPoints: [resolve(root, 'web/src/main.js')],
  bundle: true,
  minify: !serve,
  sourcemap: serve,
  format: 'iife',
  target: ['chrome100'],
  outfile: resolve(out, 'game.js'),
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 8080 });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
