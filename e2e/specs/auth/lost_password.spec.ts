import { test, expect } from '@playwright/test';
import { AuthPage } from '../../pages/auth.page.ts';
import { resetAdminUser, getUnusedConfirmationCode } from '../../helpers/db.ts';

const admin_email = 'darran@xalior.com';
const admin_password = '123123qweqweASDASD';

test.describe('Authentication:Lost Password', () => {
    test.beforeAll(async () => {
        await resetAdminUser(admin_password);
    });

    test('01: Can request a password reset...', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.lostPassword(admin_email);
        await expect(auth.alertInfo).toContainText('If you have an account');
    });

    test('02: Can follow lost_password emails...', async ({ page }) => {
        const confirmationCode = await getUnusedConfirmationCode(1);
        const auth = new AuthPage(page);
        await auth.resetPassword(confirmationCode.confirmation_code, admin_email, admin_password);
        await expect(auth.alertInfo).toContainText('Password changed successfully');
    });
});
