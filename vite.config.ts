import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT ?? 5174),
      proxy: {
        '/api': {
          target: env.VITE_API_URL ?? 'http://localhost:3205',
          changeOrigin: true,
        },
      },
    },
  };
});
