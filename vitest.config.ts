import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [vue(), WxtVitest()],
  test: {
    environment: 'happy-dom',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.output', '.wxt'],
  },
});
