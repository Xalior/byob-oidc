import { expect } from '@wdio/globals'
import AuthPage from '../../pageobjects/auth.page.ts'
import { getDb } from "../../../src/plugins-available/providers/simple-sql/db.ts";
import { confirmation_codes, users } from "../../../src/plugins-available/providers/simple-sql/schema.ts";
import { eq } from "drizzle-orm";
import { hashAccountPassword } from "../../../src/plugins-available/providers/simple-sql/account.ts";

const admin_email: string = 'darran@xalior.com';
let admin_password: string = '123123qweqweASDASD';
const admin_account_id: number = 1;

describe('Authentication:Logout', () => {
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

    it("01: Can logout...", async () => {
        await AuthPage.logout();
        await expect(AuthPage.navbar).toHaveText(expect.stringMatching(/login/i));
    });
})