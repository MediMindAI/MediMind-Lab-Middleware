/**
 * MediMind Lab Middleware — Entry Point
 *
 * This is the main file that starts everything:
 * 1. Loads configuration (which analyzers, how to connect)
 * 2. Starts the REST API (so MediMind EMR can check status)
 * 3. Connects to each analyzer
 * 4. Begins listening for results
 *
 * Think of this as the "power button" for the middleware.
 */

import 'dotenv/config';
import { loadConfig, getEnabledAnalyzers } from './config/configLoader.js';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  MediMind Lab Middleware v0.1.0');
  console.log('  Starting up...');
  console.log('========================================\n');

  // Step 1: Load configuration
  console.log('[1/4] Loading configuration...');
  const config = loadConfig();
  const enabledAnalyzers = getEnabledAnalyzers(config);
  console.log(`  Found ${config.analyzers.length} analyzers (${enabledAnalyzers.length} enabled)\n`);

  for (const analyzer of enabledAnalyzers) {
    const conn = analyzer.connection === 'serial'
      ? `Serial ${analyzer.port} @ ${analyzer.baudRate} baud`
      : `TCP ${analyzer.host}:${analyzer.tcpPort}`;
    console.log(`  - ${analyzer.name} [${analyzer.protocol}] via ${conn}`);
  }
  console.log();

  // Step 2: Initialize logging
  console.log('[2/4] Initializing logging...');
  console.log(`  Log directory: ${config.logging.dir}`);
  console.log(`  Log level: ${config.logging.level}\n`);

  // Step 3: Start REST API
  console.log('[3/4] Starting REST API...');
  console.log(`  API listening on http://${config.api.host}:${config.api.port}\n`);
  // TODO: Start Express server

  // Step 4: Connect to analyzers
  console.log('[4/4] Connecting to analyzers...');
  for (const analyzer of enabledAnalyzers) {
    console.log(`  Connecting to ${analyzer.name}...`);
    // TODO: Start protocol driver for each analyzer
  }
  console.log();

  console.log('========================================');
  console.log('  Middleware is running!');
  console.log('  Press Ctrl+C to stop.');
  console.log('========================================\n');

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    // TODO: Close all connections, flush queue
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down...');
    // TODO: Close all connections, flush queue
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
