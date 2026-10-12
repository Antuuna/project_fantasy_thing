import { execFileSync, spawn } from 'node:child_process';

// Resolve only the approved running local stack. Never inherit hosted public values.
const status = JSON.parse(execFileSync('supabase', ['status', '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
}));
if (status.API_URL !== 'http://127.0.0.1:54321' || !status.ANON_KEY) {
  throw new Error('Browser tests require the approved local Supabase stack on port 54321.');
}
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  APP_URL: 'http://localhost:3101',
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
  await run(['start', '--port', '3101']);
} else {
  await run(['dev', '--port', '3101']);
}
