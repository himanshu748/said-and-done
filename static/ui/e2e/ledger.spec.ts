import { expect, test } from '@playwright/test';

for (const [stage, message] of [['context', 'Could not load the Atlassian context'], ['list', 'Could not load promises']] as const) {
  test(`recovers when ${stage} fails on startup`, async ({ page }) => {
    await page.goto(`/?startupError=${stage}`);
    await expect(page.getByRole('alert')).toContainText(message);
    await page.evaluate(() => { window.__sdAllowStartup = true; });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('kept track of');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('ledger groups open promises by deadline and settles one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Local demo with sample data. Reload to reset your changes.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('kept track of');
  const overdue = page.getByRole('region', { name: 'Overdue' });
  await expect(overdue.getByRole('heading', { name: 'send the redlined MSA' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'No date given' })).toContainText('update the checklist');
  await expect(page.getByText('soft promise')).toBeVisible();

  const card = page.getByRole('listitem').filter({ hasText: 'send the redlined MSA' });
  await card.getByRole('button', { name: 'Mark kept' }).click();
  await expect(overdue).toHaveCount(0);
  await page.getByRole('tab', { name: /Kept/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'send the redlined MSA' })).toContainText('Kept');
  await page.reload();
  await expect(overdue.getByRole('heading', { name: 'send the redlined MSA' })).toBeVisible();
});

test('opens the source, edits a date and searches', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('listitem').filter({ hasText: 'book the review session' });
  await card.getByRole('button', { name: /LEO-4/ }).click();
  expect(await page.evaluate(() => window.__sdNav)).toEqual(['/browse/LEO-4']);
  await card.getByRole('button', { name: 'Details' }).click();
  await card.getByLabel('Due date').fill('2026-12-09');
  await card.getByRole('button', { name: 'Save date' }).click();
  await expect(card).toContainText('Wed');
  await page.getByPlaceholder('Search people, issues, words').fill('banner');
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('empty ledger scans the last 30 days', async ({ page }) => {
  await page.goto('/?empty=1');
  await expect(page.getByRole('heading', { name: 'No promises yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Scan last 30 days' }).first().click();
  await expect(page.getByRole('status')).toContainText('found 1 new promise');
  await expect(page.getByRole('heading', { name: 'send the onboarding pack' })).toBeVisible();
});

test('labels an incomplete scan and still shows its results', async ({ page }) => {
  await page.goto('/?module=confluence-ledger&empty=1&partialScan=1');
  await page.getByRole('button', { name: 'Scan last 30 days' }).first().click();
  await expect(page.getByRole('status')).toContainText('Scan incomplete');
  await expect(page.getByRole('status')).toContainText('found 1 new promise');
  await expect(page.getByRole('heading', { name: 'send the onboarding pack' })).toBeVisible();
});

test('both scan buttons stay disabled until the refreshed ledger arrives', async ({ page }) => {
  await page.goto('/?empty=1&holdScanRefresh=1');
  const scanButtons = page.getByRole('button', { name: 'Scan last 30 days' });
  await expect(scanButtons).toHaveCount(2);
  await scanButtons.first().click();
  await page.waitForFunction(() => {
    const calls = window.__sdCalls ?? [];
    const scanIndex = calls.findIndex(({ name }) => name === 'scan');
    return scanIndex >= 0 && calls.slice(scanIndex + 1).some(({ name }) => name === 'list');
  });
  await expect(scanButtons.first()).toBeDisabled({ timeout: 1500 });
  await expect(scanButtons.last()).toBeDisabled({ timeout: 1500 });
  await page.evaluate(() => { window.__sdAllowScanRefresh = true; });
  await expect(page.getByRole('heading', { name: 'send the onboarding pack' })).toBeVisible();
  await expect(scanButtons).toBeEnabled();
});

test('mine shows only the viewer\'s promises', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Mine/ }).click();
  await expect(page.getByRole('heading', { name: 'send the redlined MSA' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'share the final banner set' })).toHaveCount(0);
});

test('creates a shareable handoff from the open promises matching the current filters', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('tab', { name: /Overdue/ }).click();
  const initialCalls = await page.evaluate(() => window.__sdCalls?.map(({ name }) => name));
  await page.getByRole('button', { name: 'Prepare handoff' }).click();
  const draft = page.getByRole('textbox', { name: 'Handoff draft' });
  const text = await draft.inputValue();
  expect(text).toContain('Legal lead: send the redlined MSA (overdue 2026-11-24)');
  expect(text).toContain('https://example.atlassian.net/browse/LEO-4');
  expect(text).not.toContain('share the final banner set');
  expect(text).not.toContain('file the signed NDA');
  await page.getByRole('button', { name: 'Copy draft' }).click();
  await expect(page.getByText('Copied to clipboard.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  expect(await page.evaluate(() => window.__sdCalls?.map(({ name }) => name))).toEqual(initialCalls);

  await page.getByRole('tab', { name: /^Kept/ }).click();
  await expect(page.getByRole('button', { name: 'Refresh handoff draft' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close draft' }).click();
  await expect(draft).toHaveCount(0);
});

test('selects the handoff text if the clipboard is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Clipboard blocked')) } });
  });
  await page.goto('/?module=confluence-ledger');
  await page.getByRole('button', { name: 'Prepare handoff' }).click();
  await page.getByRole('button', { name: 'Copy draft' }).click();
  await expect(page.getByText('Text selected. Use your device’s copy command.')).toBeVisible();
  const draft = page.getByRole('textbox', { name: 'Handoff draft' });
  await expect(draft).toBeFocused();
  expect(await draft.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe((await draft.inputValue()).length);
});

test('requires a fresh handoff after the matching open promises change', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('tab', { name: /Mine/ }).click();
  await page.getByRole('button', { name: 'Prepare handoff' }).click();

  const draft = page.getByRole('textbox', { name: 'Handoff draft' });
  const copy = page.getByRole('button', { name: 'Copy draft' });
  const refresh = page.getByRole('button', { name: 'Refresh handoff draft' });
  const search = page.getByRole('searchbox', { name: 'Search promises' });
  await expect(draft).toHaveValue(/send the redlined MSA/);
  await expect(draft).not.toHaveValue(/share the final banner set/);

  await search.fill('checklist');
  await expect(copy).toBeDisabled();
  await expect(page.getByText('Refresh the draft to copy the current handoff.')).toBeVisible();
  await expect(draft).toHaveValue(/send the redlined MSA/);
  await refresh.click();
  await expect(draft).toHaveValue(/update the checklist/);
  await expect(draft).not.toHaveValue(/send the redlined MSA/);
  await page.getByRole('tab', { name: /^All/ }).click();
  await copy.click();
  await expect(page.getByText('Copied to clipboard.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await draft.inputValue());

  const checklist = page.getByRole('listitem').filter({ hasText: 'update the checklist' });
  await checklist.getByRole('button', { name: 'Mark kept' }).click();
  await expect(checklist).toContainText('Kept');
  await expect(page.getByText('No open promises match your filters.')).toBeVisible();
  await expect(copy).toBeDisabled();
  await expect(refresh).toBeDisabled();
  await expect(page.getByText('Copied to clipboard.')).toHaveCount(0);
});

test('not a promise hides a card with undo', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('tab', { name: /^Open/ });
  await expect(open).toContainText('4');
  const card = page.getByRole('listitem').filter({ hasText: 'update the checklist' });
  await card.getByRole('button', { name: 'Not a promise' }).click();
  await expect(card).toContainText('Hidden as not a promise');
  await expect(open).toContainText('3');
  await page.getByRole('button', { name: 'Scan last 30 days' }).click();
  await expect(page.getByRole('status')).toContainText('found 1 new promise');
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.getByRole('heading', { name: 'update the checklist' })).toBeVisible();
  await expect(open).toContainText('5');
});

test('hiding a promise due this week updates the count', async ({ page }) => {
  await page.goto('/');
  const week = page.locator('.stat').filter({ hasText: 'Due this week' });
  await expect(week).toContainText('2');
  await page.getByRole('listitem').filter({ hasText: 'book the review session' }).getByRole('button', { name: 'Not a promise' }).click();
  await expect(week).toContainText('1');
});

test('issue panel is compact and scoped', async ({ page }) => {
  await page.goto('/?module=jira-issue-promises');
  await expect(page.getByText(/open promises on this issue/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
});

test('small screens and dark theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/?theme=dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
