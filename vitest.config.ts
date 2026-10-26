import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // tsconfig ha `jsx: "preserve"` per Next: senza questa riga un test che
  // monta un componente (.test.tsx) resterebbe con il JSX non trasformato.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
