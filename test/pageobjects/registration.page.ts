import { $, browser } from '@wdio/globals'
import Page from './page.ts';
import { initializeDb, getDb } from "../../src/plugins-available/providers/simple-sql/db.ts";
import { config } from "../../src/lib/config.ts";
initializeDb(config.database_url);
import { confirmation_codes } from "../../src/plugins-available/providers/simple-sql/schema.ts";
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
class RegistrationPage extends Page {
    /**
     * define selectors using getter methods
     */
    get inputName() {
        return $('#display_name');
    }

    get inputEmail() {
        return $('#login_email');
    }

    get inputPassword1() {
        return $('#login_password');
    }

    get inputPassword2() {
        return $('#login_password_confirm');
    }

    get invalidFeedback() {
        return $('.invalid-feedback');
    }

    get btnSubmit() {
        return $('button[type="submit"]');
    }

    async register(name: string, email: string, password1: string, password2: string): Promise<void> {
        await this.open();
        await this.inputName.setValue(name);
        await this.inputEmail.setValue(email);
        await this.inputPassword1.setValue(password1);
        await this.inputPassword2.setValue(password2);
        await this.btnSubmit.click();
    }

    /**
     * methods to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */

    /**
     * overwrite specific options to adapt it to page object
     */
    async open(url?: string): Promise<string> {
        if (!url) url = '/register';
        return await super.open(url);
    }
}

export default new RegistrationPage();