import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmationConfig } from '../../scripts/testing/confirmation-mode.mjs';

const normal = `[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
[auth.email]
# Keep routine confirmation disabled.
enable_confirmations = false
max_frequency = "1m"
[auth.sms]
enable_confirmations = false
`;

test('confirmation mode changes only email confirmation and adds exact local callbacks', () => {
  const expected = normal.replace('additional_redirect_urls = ["http://localhost:3000/auth/callback"]',
    'additional_redirect_urls = ["http://localhost:3000/auth/callback","http://localhost:3101/auth/callback","http://localhost:3101/auth/callback?next=/update-password"]')
    .replace('enable_confirmations = false\nmax_frequency', 'enable_confirmations = true\nmax_frequency');
  assert.equal(confirmationConfig(normal), expected);
  assert.match(confirmationConfig(normal), /\[auth.sms\]\nenable_confirmations = false/);
});

test('confirmation config preserves CRLF, comments, site URL, and SMS settings', () => {
  const crlf = normal.replaceAll('\n', '\r\n');
  const modified = confirmationConfig(crlf);
  assert.equal(modified.replaceAll('\r\n', '\n'), confirmationConfig(normal));
  assert.match(modified, /# Keep routine confirmation disabled\.\r\n/);
  assert.match(modified, /site_url = "http:\/\/localhost:3000"\r\n/);
});

test('existing callback allowlist entries are preserved and exact additions are not duplicated', () => {
  const existing = normal.replace('additional_redirect_urls = ["http://localhost:3000/auth/callback"]',
    'additional_redirect_urls = ["http://localhost:3000/auth/callback","http://localhost:3101/auth/callback","http://localhost:3101/auth/callback?next=/update-password"]');
  const modified = confirmationConfig(existing);
  assert.equal((modified.match(/http:\/\/localhost:3101\/auth\/callback"/g) ?? []).length, 1);
  assert.equal((modified.match(/http:\/\/localhost:3101\/auth\/callback\?next=\/update-password/g) ?? []).length, 1);
  assert.match(modified, /http:\/\/localhost:3000\/auth\/callback/);
});

test('already enabled confirmation is rejected before any config or stack writes', () => {
  assert.throws(() => confirmationConfig(normal.replace('enable_confirmations = false\nmax_frequency',
    'enable_confirmations = true\nmax_frequency')), /Normal local email confirmation must be disabled/);
});

test('missing or duplicate settings and invalid callback arrays fail closed', () => {
  assert.throws(() => confirmationConfig(normal.replace('[auth.email]', '[auth.mail]')), /section/);
  assert.throws(() => confirmationConfig(normal.replace('max_frequency = "1m"', 'enable_confirmations = false')), /exactly one/);
  assert.throws(() => confirmationConfig(normal.replace('additional_redirect_urls = ["http://localhost:3000/auth/callback"]',
    'additional_redirect_urls = "http://localhost:3000"')), /Invalid local redirect allowlist/);
});
