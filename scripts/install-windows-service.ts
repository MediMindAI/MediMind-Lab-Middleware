/**
 * Install or uninstall the MediMind Lab Middleware as a Windows Service.
 *
 * This script wraps the compiled middleware (dist/index.js) as a native
 * Windows Service using the `node-windows` library. The service auto-starts
 * on boot and restarts on crashes.
 *
 * Usage (must run as Administrator):
 *   npx tsx scripts/install-windows-service.ts install
 *   npx tsx scripts/install-windows-service.ts uninstall
 *
 * Or via npm scripts:
 *   npm run install-service
 *   npm run uninstall-service
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  // node-windows ships as CJS; dynamic import handles ESM interop.
  const nodeWindows = await import('node-windows');
  const Service = nodeWindows.Service;

  const projectRoot = resolve(__dirname, '..');

  const svc = new Service({
    name: 'MediMind Lab Middleware',
    description: 'Receives lab analyzer results and forwards to Medplum Cloud',
    script: resolve(projectRoot, 'dist/index.js'),

    // Auto-restart on crash: grow delay by 25% each time, start at 1s, max 5 restarts.
    grow: 0.25,
    wait: 1,
    maxRestarts: 5,
    abortOnError: false,

    // Environment variables — use absolute paths because the service's
    // working directory is NOT the project folder.
    env: [
      { name: 'NODE_ENV', value: 'production' },
      { name: 'CONFIG_PATH', value: resolve(projectRoot, 'config/analyzers.json') },
      { name: 'LOG_DIR', value: resolve(projectRoot, 'logs') },
      { name: 'QUEUE_DB_PATH', value: resolve(projectRoot, 'data/queue.db') },
    ],
  });

  const command = process.argv[2];

  if (command === 'install') {
    svc.on('install', () => {
      console.log('Service installed. Starting...');
      svc.start();
    });
    svc.on('alreadyinstalled', () => {
      console.log('Service is already installed.');
    });
    svc.on('start', () => {
      console.log('Service started. Check services.msc to verify.');
    });
    svc.on('error', (err: Error) => {
      console.error('Service error:', err.message);
    });
    svc.install();
  } else if (command === 'uninstall') {
    svc.on('uninstall', () => {
      console.log('Service uninstalled.');
    });
    svc.uninstall();
  } else {
    console.error('Usage: npx tsx scripts/install-windows-service.ts <install|uninstall>');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
