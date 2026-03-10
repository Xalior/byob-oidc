import { test, expect } from '@playwright/test';
import { AuthPage } from '../../pages/auth.page.ts';
import { resetAdminUser } from '../../helpers/db.ts';

// @ts-ignore
import testdata from '../../../data/testdata.js';

test.describe('Authentication:Bad Login', () => {
    test.beforeAll(async () => {
        await resetAdminUser(testdata.admin.password);
    });

    test('02: Can\'t login without password...', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.login(testdata.admin.email, '');
        await expect(auth.alertDanger).toContainText('Login failed');
    });
});
