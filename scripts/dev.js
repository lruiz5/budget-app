#!/usr/bin/env node
/**
 * Development server wrapper that reads SERVER_PORT from .env
 * and passes it to Next.js dev server.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Default port
let port = 3000;

// Try to read SERVER_PORT from .env.local or .env
const envFiles = ['.env.local', '.env'];
for (const envFile of envFiles) {
  const envPath = path.join(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^SERVER_PORT=(\d+)/m);
    if (match) {
      port = parseInt(match[1], 10);
      console.log(`Using SERVER_PORT=${port} from ${envFile}`);
      break;
    }
  }
}

// Also check environment variable directly
if (process.env.SERVER_PORT) {
  port = parseInt(process.env.SERVER_PORT, 10);
  console.log(`Using SERVER_PORT=${port} from environment`);
}

// Run next dev with the port
const args = ['dev', '-p', port.toString(), ...process.argv.slice(2)];
const next = spawn('npx', ['next', ...args], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: port.toString() }
});

next.on('close', (code) => {
  process.exit(code);
});
