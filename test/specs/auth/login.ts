import { browser, expect } from '@wdio/globals'
import AuthPage from '../../pageobjects/auth.page.ts'
import { db } from "../../../src/db/index.ts";
import { confirmation_codes, users } from "../../../src/db/schema.ts";
import { eq } from "drizzle-orm";
import { hashAccountPassword } from "../../../src/models/account.ts";
import DatabaseAdapter from "../../../src/database_adapter.ts";

const mfa_cache = new DatabaseAdapter('MFACode');

const admin_email = 'darran@xalior.com';
let admin_password = '123123qweqweASDASD';
const admin_account_id = 1;

describe('Authentication:Login', () => {
    async function init(): Promise<void> {
        let res = await db.update(users).set({
            login_attempts: 0,
            password: await hashAccountPassword(admin_password),
        }).where(eq(users.id, admin_account_id));
        console.log("Reset admin 'account':", res[0]['info']);

        res = await db.delete(confirmation_codes).where(eq(confirmation_codes.user_id, admin_account_id));
        console.log("Reset admin 'confirmation_codes':", res[0]['affectedRows']);
    }

    it("00: PREREQS", async () => {
        await init();
    });

    it("01: Can login with valid credentials...", async () => {
        await AuthPage.login(admin_email, admin_password);
        await expect(AuthPage.inputLoginMFA).toExist();

        const interaction_url = await browser.getUrl();
        console.log(":interaction_url:", interaction_url);

        const interaction_regex = /https:\/\/[a-zA-Z0-9.-]+\/interaction\/([a-zA-Z0-9\-._]+)\/login/
        const interaction_matches = interaction_regex.exec(interaction_url);
        console.log(":interaction_matches:", interaction_matches);

        if (!interaction_matches) {
            throw new Error("Could not extract interaction ID from URL");
        }

        const interaction_id = interaction_matches[1];
        console.log(":interaction_id:", interaction_id);

        const mfa_pin = await mfa_cache.find(interaction_id);
        console.log(":mfa_pin:", mfa_pin);

        expect(mfa_pin !== null).toBeTruthy();
        await AuthPage.confirm_login(mfa_pin.pin);
        await expect(AuthPage.navbar).toHaveText(expect.stringMatching(/logout/i));
    });
})