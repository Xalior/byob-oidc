import { test, expect } from '@playwright/test';
import { AuthPage } from '../../pages/auth.page.ts';
import { resetAdminUser, getMfaPin } from '../../helpers/db.ts';

const admin_email = 'darran@xalior.com';
const admin_password = '123123qweqweASDASD';

test.describe('Authentication:Login', () => {
    test.beforeAll(async () => {
        await resetAdminUser(admin_password);
    });

    test('01: Can login with valid credentials...', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.login(admin_email, admin_password);
        await expect(auth.inputLoginMFA).toBeVisible();

        const interactionUrl = page.url();
        console.log(':interaction_url:', interactionUrl);

        const interactionRegex = /https:\/\/[a-zA-Z0-9.-]+\/interaction\/([a-zA-Z0-9\-._]+)\/login/;
        const matches = interactionRegex.exec(interactionUrl);
        console.log(':interaction_matches:', matches);

        if (!matches) {
            throw new Error('Could not extract interaction ID from URL');
        }

        const interactionId = matches[1];
        console.log(':interaction_id:', interactionId);

        const mfaPin = await getMfaPin(interactionId);
        console.log(':mfa_pin:', mfaPin);

        expect(mfaPin).not.toBeNull();
        await auth.confirmLogin(mfaPin!.pin);
        await expect(auth.navbar).toContainText(/logout/i);
    });
});
