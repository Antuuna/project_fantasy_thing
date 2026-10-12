import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const localApiUrl = "http://127.0.0.1:54321";
type LocalStatus = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
export type TestUser = { email: string; password: string; id?: string };

let status: LocalStatus | undefined;
let admin: SupabaseClient | undefined;

// This module is for Node test setup only. No environment-variable fallback is
// permitted: even a correctly configured hosted project is not a test target.
function getLocalStatus(): LocalStatus {
  if (status) return status;
  let candidate: Partial<LocalStatus>;
  try {
    candidate = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch {
    throw new Error("Local Supabase is unavailable. Start the local stack before running browser tests.");
  }
  if (candidate?.API_URL !== localApiUrl) {
    throw new Error("Browser tests require the approved local Supabase API at http://127.0.0.1:54321.");
  }
  if (typeof candidate.ANON_KEY !== "string" || !candidate.ANON_KEY ||
      typeof candidate.SERVICE_ROLE_KEY !== "string" || !candidate.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase test credentials are missing.");
  }
  status = candidate as LocalStatus;
  return status;
}

// Only public values may be forwarded to the Next.js build/server or browser.
export function getLocalSupabasePublicConfig() {
  const local = getLocalStatus();
  return { url: local.API_URL, publishableKey: local.ANON_KEY };
}

export function getTestAdmin(): SupabaseClient {
  if (!admin) {
    const local = getLocalStatus();
    admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}

export function createTestClient(): SupabaseClient {
  const local = getLocalSupabasePublicConfig();
  return createClient(local.url, local.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function newTestUser(prefix = "browser"): TestUser {
  // UUIDs avoid collisions across processes, retries, and simultaneous test runs.
  return { email: `${prefix}-${randomUUID()}@example.com`, password: `Local-test-${randomUUID()}!` };
}

export async function createTestUser(prefix = "browser"): Promise<TestUser & { id: string }> {
  const user = newTestUser(prefix);
  const { data, error } = await getTestAdmin().auth.admin.createUser({
    email: user.email, password: user.password, email_confirm: true,
  });
  if (error || !data.user) throw new Error("Unable to create a local test account.");
  return { ...user, id: data.user.id };
}

export async function findTestUserId(email: string): Promise<string | undefined> {
  // Browser-created signup accounts need discovery even if a later assertion
  // fails. Paginate so unrelated local accounts cannot hide a cleanup target.
  for (let page = 1; ; page++) {
    const { data, error } = await getTestAdmin().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("Unable to inspect local test accounts for cleanup.");
    const user = data.users.find(candidate => candidate.email === email);
    if (user) return user.id;
    if (data.users.length < 100) return undefined;
  }
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  const id = user.id ?? await findTestUserId(user.email);
  if (!id) return; // Signup may have failed before creating an account.
  const { error } = await getTestAdmin().auth.admin.deleteUser(id);
  if (error) throw new Error("Unable to clean up a local test account.");
}
