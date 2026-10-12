import { execFileSync, spawn } from 'node:child_process';

// Resolve only the approved running local stack. Never inherit hosted public values.
const status = JSON.parse(execFileSync('supabase', ['status', '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
}));
const port = process.env.LOCAL_APP_PORT ?? '3101';
if (!['3000', '3101'].includes(port)) throw new Error('Local application runner supports ports 3000 and 3101 only.');
if (status.API_URL !== 'http://127.0.0.1:54321' || !status.ANON_KEY) {
  throw new Error('Browser tests require the approved local Supabase stack on port 54321.');
}
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  APP_URL: `http://localhost:${port}`,
};
delete env.SUPABASE_DB_URL;
delete env.SUPABASE_SERVICE_ROLE_KEY;
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { env, stdio: 'inherit' });
    const stop = () => child.kill('SIGTERM');
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    child.once('error', reject);
    child.once('exit', code => {
      process.removeListener('SIGTERM', stop);
      process.removeListener('SIGINT', stop);
      if (code === 0) resolve(); else reject(new Error(`Next.js exited with code ${code}`));
    });
  });
}
if (process.env.E2E_PRODUCTION === '1') {
  await run(['build', '--webpack']);
  await run(['start', '--port', port]);
} else {
  await run(['dev', '--port', port]);
}
