import esbuild from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

await Promise.all([
  esbuild.build({
    entryPoints: ['src/code.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/code.js',
    target: ['es2020'],
  }),
  esbuild.build({
    entryPoints: ['src/ui.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/ui.js',
    target: ['es2020'],
  }),
  copyFile('src/ui.html', 'dist/ui.html'),
]);

console.log('Built plugin to dist/');
