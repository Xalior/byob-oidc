import { test, expect } from '@playwright/test';
import { AuthPage } from '../../pages/auth.page.ts';
import { resetAdminUser } from '../../helpers/db.ts';

const admin_email = 'darran@xalior.com';
const admin_password = '123123qweqweASDASD';

test.describe('Authentication:Password Lockout', () => {
    test.beforeAll(async () => {
        await resetAdminUser(admin_password);
    });

    test('01: Can\'t login with invalid credentials...', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.login(admin_email, 'password');
        await expect(auth.alertDanger).toContainText('Login failed');
    });

    test('02: Can detect repeated failed logins...', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.login(admin_email, 'password');
        await expect(auth.alertDanger).toContainText('Login failed');
        await auth.login(admin_email, 'password');
        await expect(auth.alertDanger).toContainText('Login failed');
        // The account should now be locked, let's try a valid password to be sure
        await auth.login(admin_email, admin_password);
        await expect(auth.alertDanger).toContainText('Account Locked');
        // Now unlock the account
        await resetAdminUser(admin_password);
    });
});
