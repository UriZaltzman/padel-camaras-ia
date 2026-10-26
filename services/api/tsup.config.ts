import { defineConfig } from 'tsup';

// Bundles the API into one CommonJS file. Workspace packages (such as `@app/config/brand`)
// ship TypeScript sources, so they are bundled in; npm dependencies stay external.
// `emitDecoratorMetadata` in tsconfig makes tsup compile with SWC, which NestJS needs for DI.
export default defineConfig({
  entry: { main: 'src/main.ts', seed: 'src/seed/main.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@app\//],
});
