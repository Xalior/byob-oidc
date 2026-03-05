import { expect } from '@wdio/globals'
import AuthPage from '../../pageobjects/auth.page.ts'
import { getDb } from "../../../src/plugins-available/providers/simple-sql/db.ts";
import { confirmation_codes, users } from "../../../src/plugins-available/providers/simple-sql/schema.ts";
import { eq } from "drizzle-orm";
import { hashAccountPassword } from "../../../src/plugins-available/providers/simple-sql/account.ts";
import * as assert from "node:assert";

// @ts-ignore
import testdata from "../../../data/testdata.js";

describe('Authentication:Bad Login', () => {
    async function init(): Promise<void> {
        let res = await getDb().update(users).set({
            login_attempts: 0,
            password: await hashAccountPassword(testdata.admin.password),
        }).where(eq(users.id, testdata.admin.id!));
        await expect(res[0]['info'] as unknown as number ===0);

        await getDb().delete(confirmation_codes).where(eq(confirmation_codes.user_id, testdata.admin.id!));
    }

    it("00: PREREQS", async () => {
        await init();
    });

    // it("01: Can't login with invalid credentials...", async () => {
    //     await AuthPage.login(testdata.admin.email, 'password');
    //     await expect(AuthPage.alertDanger).toHaveText(expect.stringContaining('Login failed'));
    // });

    it("02: Can't login without password...", async () => {
        await AuthPage.login(testdata.admin.email, '');
        await expect(AuthPage.alertDanger).toHaveText(expect.stringContaining('Login failed'));
    });
})