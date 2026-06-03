#!/usr/bin/env node
import { startServer } from './server.js';

startServer().catch((err) => {
  process.stderr.write(`[elektron-rytm-mcp] fatal: ${err.stack || err.message}\n`);
  process.exit(1);
});
