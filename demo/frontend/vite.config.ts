import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import Sonda from 'sonda/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const isDevelopment = process.env.NODE_ENV === 'development';

// Start the mock server when running dev mode
function startServerPlugin(): Plugin {
  let serverProcess: ChildProcess | null = null;

  const cleanup = () => {
    if (serverProcess && !serverProcess.killed) {
      // Kill the entire process group to ensure child processes are terminated
      if (serverProcess.pid) {
        try {
          process.kill(-serverProcess.pid, 'SIGTERM');
        } catch {
          // Fallback to regular kill if process group kill fails
          serverProcess.kill('SIGTERM');
        }
      }
      serverProcess = null;
    }
  };

  return {
    name: 'start-mock-server',
    configureServer(server) {
      // Start server when Vite dev server starts
      // Use detached: true to create a new process group
      serverProcess = spawn('npx', ['tsx', 'watch', 'server/server.ts'], {
        cwd: resolve(__dirname, '../..'),
        stdio: 'inherit',
        detached: true,
      });

      console.log('Debug collector started at http://localhost:3001');
      console.log('To send telemetry to the debug collector, set:');
      console.log('  VITE_DATA_URL=http://localhost:3001');
      console.log('in your .env file or environment variables.');

      // Handle cleanup when Vite closes
      server.httpServer?.on('close', cleanup);

      // Also handle process exits
      process.on('exit', cleanup);
      process.on('SIGINT', () => {
        cleanup();
        process.exit();
      });
      process.on('SIGTERM', () => {
        cleanup();
        process.exit();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [Sonda({ enabled: false }), startServerPlugin()],
  // In development, alias SDK imports to local source files for live editing.
  // In production, use the installed package from node_modules.
  resolve: isDevelopment
    ? {
        alias: {
          '@embrace-io/web-sdk/react-instrumentation': resolve(
            __dirname,
            '../../src/react-instrumentation/index.ts',
          ),
          '@embrace-io/web-sdk': resolve(__dirname, '../../src/index.ts'),
        },
      }
    : undefined,
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'react-router-v5': resolve(__dirname, 'react-router-v5/index.html'),
        'react-router-v6-declarative': resolve(
          __dirname,
          'react-router-v6-declarative/index.html',
        ),
        'react-router-v6-data': resolve(
          __dirname,
          'react-router-v6-data/index.html',
        ),
      },
      output: {
        sourcemapDebugIds: true,
      },
    },
  },
});
