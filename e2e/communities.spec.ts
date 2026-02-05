import { test, expect } from '@playwright/test';

test.describe('Community Flow', () => {
  test('should navigate to communities page', async ({ page }) => {
    await page.goto('/');
    
    // Click communities link
    await page.getByRole('link', { name: /communities/i }).click();
    
    // Check we're on communities page
    await expect(page.getByRole('heading', { name: /communities/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search communities/i)).toBeVisible();
  });

  test('should show create community button when logged in', async ({ page }) => {
    await page.goto('/communities');
    
    // Initially no create button
    await expect(page.getByRole('button', { name: /new community/i })).not.toBeVisible();
    
    // Login
    await page.getByRole('button', { name: /log in/i }).click();
    await page.getByRole('button', { name: 'Private Key' }).click();
    await page.getByPlaceholder(/nsec1/i).fill('nsec1test123456789abcdefghijklmnopqrstuvwxyz123456789abcd');
    await page.getByRole('button', { name: /log in with private key/i }).click();
    
    // Now create button should be visible
    await expect(page.getByRole('button', { name: /new community/i })).toBeVisible();
  });

  test('should open create community modal', async ({ page }) => {
    await page.goto('/communities');
    
    // Login first
    await page.getByRole('button', { name: /log in/i }).click();
    await page.getByRole('button', { name: 'Private Key' }).click();
    await page.getByPlaceholder(/nsec1/i).fill('nsec1test123456789abcdefghijklmnopqrstuvwxyz123456789abcd');
    await page.getByRole('button', { name: /log in with private key/i }).click();
    
    // Click create community
    await page.getByRole('button', { name: /new community/i }).click();
    
    // Check modal is open
    await expect(page.getByRole('heading', { name: 'Create Community' })).toBeVisible();
    await expect(page.getByLabel(/community name/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
  });
});
