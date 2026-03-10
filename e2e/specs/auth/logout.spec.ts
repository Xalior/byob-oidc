import { test, expect } from '@playwright/test';
import { AuthPage } from '../../pages/auth.page.ts';
import { resetAdminUser, getMfaPin } from '../../helpers/db.ts';

const admin_email = 'darran@xalior.com';
const admin_password = '123123qweqweASDASD';

test.describe('Authentication:Logout', () => {
    test.beforeAll(async () => {
        await resetAdminUser(admin_password);
    });

    test('01: Can logout...', async ({ page }) => {
        const auth = new AuthPage(page);

        // Must login first (each Playwright test gets a fresh browser context)
        await auth.login(admin_email, admin_password);
        await expect(auth.inputLoginMFA).toBeVisible();

        const interactionUrl = page.url();
        const matches = /\/interaction\/([a-zA-Z0-9\-._]+)\/login/.exec(interactionUrl);
        if (!matches) throw new Error('Could not extract interaction ID from URL');

        const mfaPin = await getMfaPin(matches[1]);
        expect(mfaPin).not.toBeNull();
        await auth.confirmLogin(mfaPin!.pin);
        await expect(auth.navbar).toContainText(/logout/i);

        // Now test logout
        await auth.logout();
        await expect(auth.navbar).toContainText(/login/i);
    });
});
