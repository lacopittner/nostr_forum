import { test, expect } from '@playwright/test';

test.describe('Feed Flow', () => {
  test('should display feed with posts', async ({ page }) => {
    await page.goto('/');
    
    // Check feed is visible
    await expect(page.getByText(/the relay is quiet|sort by/i)).toBeVisible();
    
    // Check sorting options
    await expect(page.getByRole('button', { name: 'hot' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'new' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'top' })).toBeVisible();
  });

  test('should navigate to post detail when clicking post', async ({ page }) => {
    await page.goto('/');
    
    // If there are posts, click on one
    const posts = page.locator('[class*="bg-card"]').first();
    if (await posts.isVisible().catch(() => false)) {
      await posts.click();
      
      // Check we're on post detail page
      await expect(page.getByRole('button', { name: /back/i })).toBeVisible();
      await expect(page.getByPlaceholder(/what are your thoughts/i)).toBeVisible();
    }
  });

  test('should show create post area only when logged in', async ({ page }) => {
    await page.goto('/');
    
    // Initially no create post area
    await expect(page.getByPlaceholder(/what's on your mind/i)).not.toBeVisible();
    
    // Login with nsec
    await page.getByRole('button', { name: /log in/i }).click();
    await page.getByRole('button', { name: 'Private Key' }).click();
    await page.getByPlaceholder(/nsec1/i).fill('nsec1test123456789abcdefghijklmnopqrstuvwxyz123456789abcd');
    await page.getByRole('button', { name: /log in with private key/i }).click();
    
    // Now create post area should be visible
    await expect(page.getByPlaceholder(/what's on your mind/i)).toBeVisible();
  });
});
