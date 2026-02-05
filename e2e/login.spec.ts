import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should show login modal when clicking login button', async ({ page }) => {
    await page.goto('/');
    
    // Click login button
    await page.getByRole('button', { name: /log in/i }).click();
    
    // Check that login modal is visible
    await expect(page.getByRole('heading', { name: 'Log In' })).toBeVisible();
    
    // Check both tabs are present
    await expect(page.getByRole('button', { name: 'Extension' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Private Key' })).toBeVisible();
  });

  test('should show private key input when switching to nsec tab', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /log in/i }).click();
    await page.getByRole('button', { name: 'Private Key' }).click();
    
    await expect(page.getByPlaceholder(/nsec1/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in with private key/i })).toBeVisible();
  });

  test('should show error for invalid private key format', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /log in/i }).click();
    await page.getByRole('button', { name: 'Private Key' }).click();
    
    // Enter invalid key
    await page.getByPlaceholder(/nsec1/i).fill('invalid-key');
    await page.getByRole('button', { name: /log in with private key/i }).click();
    
    await expect(page.getByText(/invalid format/i)).toBeVisible();
  });
});
