import { test, expect } from '@playwright/test';

test.describe('Relay Management Flow', () => {
  test('should navigate to relay management', async ({ page }) => {
    await page.goto('/');
    
    // Click relays link
    await page.getByRole('button', { name: /relays/i }).click();
    
    // Check we're on relay page
    await expect(page.getByRole('heading', { name: /relay management/i })).toBeVisible();
    await expect(page.getByPlaceholder(/wss:\/\/relay/i)).toBeVisible();
  });

  test('should add and remove relay', async ({ page }) => {
    await page.goto('/relays');
    
    // Add a relay
    await page.getByPlaceholder(/wss:\/\/relay/i).fill('wss://relay.damus.io');
    await page.getByRole('button', { name: 'Add' }).click();
    
    // Check relay appears in list
    await expect(page.getByText('wss://relay.damus.io')).toBeVisible();
    
    // Remove the relay
    await page.locator('button[title="Remove relay"]').first().click();
    
    // Check relay is removed
    await expect(page.getByText('wss://relay.damus.io')).not.toBeVisible();
  });

  test('should show relay connection status', async ({ page }) => {
    await page.goto('/relays');
    
    // Check connected relays section exists
    await expect(page.getByText(/connected relays/i)).toBeVisible();
    
    // Should show localhost relay
    await expect(page.getByText('ws://localhost:4433')).toBeVisible();
  });
});
