import { test, expect } from '@playwright/test';
import { createTestClient, createTestUser, deleteTestUser } from '../support/local-supabase';
import { fixturePlayers, signIn } from '../support/browser';

test('watchlist pages are bounded, stable, and validate URL parameters', async ({page}) => {
  const user = await createTestUser('watch-pages');
  try {
    const players = await fixturePlayers(21);
    const client = createTestClient();
    expect((await client.auth.signInWithPassword(user)).error).toBeNull();
    expect((await client.from('watchlist_entries').insert(players.map(player => ({player_id: player.id, notes: `Note ${player.id}`})))).error).toBeNull();
    const expected = await client.from('watchlist_entries').select('player_id').order('created_at', {ascending:false}).order('id', {ascending:false}).limit(21);
    expect(expected.error).toBeNull();
    await signIn(page, user);
    await page.goto('/watchlist');
    await expect(page.locator('article')).toHaveCount(20);
    const first = players.find(player => player.id === expected.data![0].player_id)!;
    await expect(page.locator('article').first().getByRole('heading')).toHaveText(first.full_name);
    await page.getByRole('link', {name:'Next page', exact:true}).click();
    await expect(page.locator('article')).toHaveCount(1);
    const last = players.find(player => player.id === expected.data![20].player_id)!;
    await expect(page.locator('article').getByRole('heading')).toHaveText(last.full_name);
    await page.reload();
    await expect(page.getByLabel(`Notes for ${last.full_name}`)).toHaveValue(`Note ${last.id}`);
    await page.getByRole('link', {name:'Previous page', exact:true}).click();
    await expect(page.locator('article')).toHaveCount(20);
    await page.goto('/watchlist?page=0');
    await expect(page.locator('p[role=alert]')).toContainText('Page must');
  } finally { await deleteTestUser(user); }
});
