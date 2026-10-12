/** Controlled, exclusive local confirmation run. Stop preserves data volumes.
 * Normal config is restored byte-for-byte and the local stack restarted in finally.
 * Never invoke alongside another local server/database/browser suite.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configPath = path.join(root, 'supabase/config.toml');
const lockPath = path.join(root, 'supabase/.confirmation-test-lock');
let testProcess;
let interrupted = false;

function signal() {
  interrupted = true;
  if (testProcess) testProcess.kill('SIGINT');
}
process.on('SIGINT', signal);
process.on('SIGTERM', signal);

function captured(command, args, label, timeout = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let size = 0;
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size < 8_000_000) output += chunk.toString();
      else child.kill('SIGTERM');
    });
    // Supabase start/status can contain credentials. Consume without forwarding.
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error(`${label} could not start.`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${label} failed; local command exit ${code ?? 'signal'}. Output withheld to protect credentials.`));
    });
  });
}

async function localStatus() {
  let status;
  try { status = JSON.parse(await captured('supabase', ['status', '--output', 'json'], 'Local stack status')); }
  catch { throw new Error('The approved local Supabase stack must be running before the confirmation run.'); }
  let database;
  try { database = new URL(status.DB_URL); } catch { throw new Error('Local database status is unavailable.'); }
  if (status.API_URL !== 'http://127.0.0.1:54321' || status.INBUCKET_URL !== 'http://127.0.0.1:54324' ||
      database.hostname !== '127.0.0.1' || database.port !== '54322' || database.pathname !== '/postgres' ||
      !['postgres:', 'postgresql:'].includes(database.protocol) || database.search || database.hash || !status.ANON_KEY) {
    throw new Error('Confirmation tests require the approved loopback API/database/mail ports 54321/54322/54324.');
  }
  return status;
}

async function authMode(confirmationEnabled) {
  const status = await localStatus();
  const response = await fetch(`${status.API_URL}/auth/v1/settings`, {
    headers: { apikey: status.ANON_KEY }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || (await response.json()).mailer_autoconfirm !== !confirmationEnabled) {
    throw new Error('The local auth service did not load the expected confirmation setting.');
  }
}

async function databaseCounts() {
  const code = `import json\nfrom scripts.testing.local_db import connect_local_db\ntables = ['nba_teams','nba_players','nba_games','nba_player_game_stats','nba_dataset_imports','rosters','roster_members','watchlist_entries','lineup_entries']\nwith connect_local_db() as c:\n c.execute('set transaction read only')\n counts = {t:c.execute('select count(*) from public.'+t).fetchone()[0] for t in tables}\n counts['auth_users'] = c.execute('select count(*) from auth.users').fetchone()[0]\n print(json.dumps(counts, sort_keys=True))`;
  try { return JSON.parse(await captured(path.join(root, '.venv/bin/python'), ['-c', code], 'Local database inventory')); }
  catch { throw new Error('Local database count verification failed; .venv with psycopg and the populated local stack are required.'); }
}

function setting(source, section, key, replace) {
  const headers = [...source.matchAll(/^\[([^\]]+)\][^\r\n]*(?:\r?\n|$)/gm)];
  const index = headers.findIndex(match => match[1] === section);
  if (index < 0) throw new Error(`Required local config section ${section} is missing.`);
  const begin = headers[index].index + headers[index][0].length;
  const end = headers[index + 1]?.index ?? source.length;
  const block = source.slice(begin, end);
  const pattern = new RegExp(`^(${key}\\s*=\\s*)([^\\r\\n]*)(\\r?)$`, 'gm');
  const matches = [...block.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected exactly one local ${section}.${key} setting.`);
  const changed = block.replace(pattern, (_line, prefix, value, cr) => `${prefix}${replace(value)}${cr}`);
  return source.slice(0, begin) + changed + source.slice(end);
}

export function confirmationConfig(source) {
  let config = setting(source, 'auth.email', 'enable_confirmations', value => {
    if (!/^false\s*(?:#.*)?$/.test(value)) throw new Error('Normal local email confirmation must be disabled before this controlled run.');
    return value.replace(/^false/, 'true');
  });
  config = setting(config, 'auth', 'additional_redirect_urls', value => {
    let existing;
    try { existing = JSON.parse(value); } catch { throw new Error('Local auth redirect allowlist must be a single-line string array.'); }
    if (!Array.isArray(existing) || !existing.every(item => typeof item === 'string')) throw new Error('Invalid local redirect allowlist.');
    return JSON.stringify([...new Set([...existing, 'http://localhost:3101/auth/callback', 'http://localhost:3101/auth/callback?next=/update-password'])]);
  });
  return config;
}

async function requireFreeTestPort() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 3101 });
    socket.once('connect', () => { socket.destroy(); reject(new Error('Port 3101 is occupied. Stop the other browser/app run before changing local confirmation mode.')); });
    socket.once('error', error => { socket.destroy(); if (error.code === 'ECONNREFUSED') resolve(); else reject(new Error('Unable to establish that the local browser-test port is free.')); });
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('Local test port check timed out.')); });
  });
}

function browserTests() {
  return new Promise((resolve, reject) => {
    testProcess = spawn('npx', ['playwright', 'test', 'tests/confirmation'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, E2E_CONFIRMATION: '1', E2E_PRODUCTION: '1' },
    });
    testProcess.on('error', () => { testProcess = undefined; reject(new Error('Confirmation browser runner could not start.')); });
    testProcess.on('close', code => {
      testProcess = undefined;
      if (code === 0 && !interrupted) resolve();
      else reject(new Error(`Confirmation browser checks failed or interrupted (exit ${code ?? 'signal'}).`));
    });
  });
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/testing/confirmation-mode.mjs');
  await localStatus();
  await authMode(false);
  await requireFreeTestPort();
  try { await mkdir(lockPath, { mode: 0o700 }); }
  catch { throw new Error('Another confirmation run or interrupted-run backup exists at supabase/.confirmation-test-lock. Inspect it before continuing.'); }
  let original;
  let baseline;
  let changed = false;
  let failure;
  let restoreFailure;
  try {
    original = await readFile(configPath);
    const changedConfig = confirmationConfig(original.toString('utf8'));
    baseline = await databaseCounts();
    await writeFile(path.join(lockPath, 'original-config.toml'), original, { mode: 0o600 });
    changed = true; // Even a partial write must trigger byte-for-byte restoration.
    await writeFile(configPath, changedConfig);
    console.log('Restarting the local stack with email confirmation enabled; data volumes are preserved.');
    await captured('supabase', ['stop'], 'Local stack stop');
    await captured('supabase', ['start'], 'Local confirmation stack start', 300_000);
    await authMode(true);
    if (interrupted) throw new Error('Confirmation run interrupted before browser checks.');
    await browserTests();
  } catch (error) { failure = error; }
  finally {
    if (changed) {
      try {
        await writeFile(configPath, original);
        console.log('Restoring the original local config and restarting with normal confirmation disabled.');
        await captured('supabase', ['stop'], 'Restore stack stop');
        await captured('supabase', ['start'], 'Restore stack start', 300_000);
        await authMode(false);
        if (!(await readFile(configPath)).equals(original)) throw new Error('Original local configuration was not restored byte-for-byte.');
        const restored = await databaseCounts();
        if (JSON.stringify(restored) !== JSON.stringify(baseline)) throw new Error('Local row counts differ after the confirmation run; inspect fixture cleanup before continuing.');
        console.log('Normal local auth restored; configuration bytes and all shared/private/account row counts match the baseline.');
      } catch (error) { restoreFailure = error; }
    }
    // Preserve recovery backup on restoration failure. SIGKILL/power loss also
    // leaves this directory for manual recovery; never overwrite such a backup.
    if (!restoreFailure) await rm(lockPath, { recursive: true });
  }
  if (restoreFailure) throw new Error(`${restoreFailure.message} Recovery config retained at supabase/.confirmation-test-lock/original-config.toml.`);
  if (failure) throw failure;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Only our controlled messages are emitted; never dump subprocess buffers,
    // SDK objects, stack traces, or auth email links.
    console.error(error instanceof Error ? error.message : 'Local confirmation test run failed.');
    process.exitCode = 1;
  });
}
