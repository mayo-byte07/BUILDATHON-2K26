import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
let stopping = false;
let client;
let server;
let reuseApi = false;

async function apiIsHealthy() {
  try {
    const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(900) });
    return response.ok;
  } catch {
    return false;
  }
}

function launch(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  child.stdout.on('data', data => process.stdout.write(`[${label}] ${data}`));
  child.stderr.on('data', data => process.stderr.write(`[${label}] ${data}`));
  child.on('error', error => console.error(`[${label}] Could not start: ${error.message}`));
  return child;
}

function stopChild(child) {
  if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
}

async function waitForApi(timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await apiIsHealthy()) return true;
    if (server && server.exitCode !== null) return false;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\n[dev] Stopping AASHRAY...');
  stopChild(client);
  if (!reuseApi) stopChild(server);
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[dev] Starting AASHRAY...');
if (await apiIsHealthy()) {
  reuseApi = true;
  console.log('[dev] Existing API on port 3001 is healthy; reusing it.');
} else {
  server = launch('server', process.execPath, ['server/index.js']);
  server.once('exit', (code, signal) => {
    if (!stopping) console.error(`[dev] Backend process exited (code=${code}, signal=${signal || 'none'}).`);
  });
  const healthy = await waitForApi();
  if (!healthy) {
    console.error('[dev] API did not stay available on port 3001. Check whether that port is occupied or inspect the server error above.');
    stopping = true;
    stopChild(server);
    process.exitCode = 1;
    process.exit();
  }
}

console.log('[dev] Starting frontend; if port 5173 is occupied, Vite will choose the next available port.');
console.log('[dev] API health: http://localhost:3001/api/health');
client = launch('client', process.execPath, [viteBin, '--host', '0.0.0.0', '--port', '5173']);
client.once('exit', (code, signal) => {
  if (stopping) return;
  console.error(`[dev] Frontend stopped (code=${code}, signal=${signal || 'none'}).`);
  stopping = true;
  if (!reuseApi) stopChild(server);
  process.exitCode = code || 0;
});
