import { browser, expect } from '@wdio/globals'
import AuthPage from '../../pageobjects/auth.page.ts'
import { initializeDb, getDb } from "../../../src/plugins-available/providers/simple-sql/db.ts";
import { confirmation_codes, users } from "../../../src/plugins-available/providers/simple-sql/schema.ts";
import { eq } from "drizzle-orm";
import { hashAccountPassword } from "../../../src/plugins-available/providers/simple-sql/account.ts";
import { createConnection, getConnection } from "../../../src/plugins-available/sessions/redis/connection.ts";
import { config } from "../../../src/lib/config.ts";

// Initialize DB and Redis for test data access
initializeDb(config.database_url);
createConnection(config.cache_url);

const admin_email = 'darran@xalior.com';
let admin_password = '123123qweqweASDASD';
const admin_account_id = 1;

describe('Authentication:Login', () => {
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

        const cache = getConnection();
        const raw: any = await cache.call('JSON.GET', `${config.hostname}:mfaCode:${interaction_id}`);
        const mfa_pin = raw ? JSON.parse(raw) : null;
        console.log(":mfa_pin:", mfa_pin);

        expect(mfa_pin !== null && mfa_pin !== undefined).toBeTruthy();
        await AuthPage.confirm_login(mfa_pin.pin);
        await expect(AuthPage.navbar).toHaveText(expect.stringMatching(/logout/i));
    });
})
