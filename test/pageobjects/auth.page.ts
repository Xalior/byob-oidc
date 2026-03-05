import { $, browser } from '@wdio/globals'
import Page from './page.ts';
import { getDb } from "../../src/plugins-available/providers/simple-sql/db.ts";
import { confirmation_codes, users } from "../../src/plugins-available/providers/simple-sql/schema.ts";
import { eq, desc } from "drizzle-orm";

async function get_reset_code(): Promise<any> {
    const reset_code = (await getDb().select()
        .from(confirmation_codes)
        .where(
            eq(confirmation_codes.user_id, 1)
        )
        .orderBy(desc(confirmation_codes.created_at))
        .limit(1))[0];

    console.log(reset_code)

    return reset_code;
}

/**
 * sub page containing specific selectors and methods for a specific page
 */
class AuthPage extends Page {
    /**
     * define selectors using getter methods
     */
    get inputEmail() {
        return $('#login_email');
    }

    get inputPassword() {
        return $('#login_password');
    }

    get inputPasswordConfirm() {
        return $('#login_password_confirm');
    }

    get inputLoginMFA() {
        return $('#login_mfa');
    }

    get btnSubmit() {
        return $('button[type="submit"]');
    }

    /**
     * a method to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */
    async login(email: string, password: string): Promise<void> {
        await super.open('/login');
        await this.inputEmail.setValue(email);
        await this.inputPassword.setValue(password);
        await this.btnSubmit.click();
    }

    async logout(): Promise<void> {
        await super.open('/logout');
        await this.btnSubmit.click();
    }

    async lost_password(email: string): Promise<void> {
        await super.open('/lost_password');
        await this.inputEmail.setValue(email);
        await this.btnSubmit.click();
    }

    async reset_password(reset_code: string, admin_email: string, admin_password: string): Promise<void> {
        await super.open(`/reset_password?${reset_code}`);
        await this.inputEmail.setValue(admin_email);
        await this.inputPassword.setValue(admin_password);
        await this.inputPasswordConfirm.setValue(admin_password);
        await this.btnSubmit.click();
    }

    async confirm_login(pin: string): Promise<void> {
        await this.inputLoginMFA.setValue(pin);
        await this.btnSubmit.click();
    }
    
    /**
     * overwrite specific options to adapt it to page object
     */
    async open(url?: string): Promise<string> {
        if(!url) url='/login';
        return await super.open(url);
    }
}

export default new AuthPage();