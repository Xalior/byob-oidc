import { expect } from '@wdio/globals'
import BasicPage from '../../pageobjects/basic.page.ts'
import AuthPage from '../../pageobjects/auth.page.ts'
import SecurePage from '../../pageobjects/secure.page.ts'
import { getDb } from "../../../src/plugins-available/providers/simple-sql/db.ts";
import { confirmation_codes, users } from "../../../src/plugins-available/providers/simple-sql/schema.ts";
import { and, eq } from "drizzle-orm";
import { hashAccountPassword } from "../../../src/plugins-available/providers/simple-sql/account.ts";

const admin_email: string = 'darran@xalior.com';
let admin_password: string = '123123qweqweASDASD';
const admin_account_id: number = 1;

describe('Authentication:Password Lockout', () => {
    async function init(): Promise<void> {
        let res = await getDb().update(users).set({
            login_attempts: 0,
            password: await hashAccountPassword(admin_password),
        }).where(eq(users.id, admin_account_id));
        console.log("Reset admin 'account':", res[0]['info']);

        res = await getDb().delete(confirmation_codes).where(eq(confirmation_codes.user_id, admin_account_id));
        console.log("Reset admin 'confirmation_codes':", res[0]['affectedRows']);
    }

    it("00: PREREQS", async () => {
        await init();
    });

    it("01: Can't login with invalid credentials...", async () => {
        await AuthPage.login(admin_email, 'password');
        await expect(AuthPage.alertDanger).toHaveText(expect.stringContaining('Login failed'));
    });

    it("02: Can detect repeated failed logins...", async () => {
        await AuthPage.login(admin_email, 'password');
        await expect(AuthPage.alertDanger).toHaveText(expect.stringContaining('Login failed'));
        await AuthPage.login(admin_email, 'password');
        await expect(AuthPage.alertDanger).toHaveText(expect.stringContaining('Login failed'));
        // The account should now be locked, let's try a valid password to be sure... and see...
        await AuthPage.login(admin_email, admin_password);
        await expect(AuthPage.alertDanger).toHaveText(expect.stringContaining('Account Locked'));
        // Now unlock the account
        await init();
    });
})