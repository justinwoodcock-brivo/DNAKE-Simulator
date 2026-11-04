import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'safari15' },
  // Dev server only: a build would bake the key from .env into the packaged app.
  envPrefix: command === 'serve' ? ['VITE_', 'DNAKE_SECRET'] : ['VITE_'],
}));
