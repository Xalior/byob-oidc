import { type Page, type Locator } from '@playwright/test';

export class RegistrationPage {
    readonly page: Page;
    readonly inputName: Locator;
    readonly inputEmail: Locator;
    readonly inputPassword: Locator;
    readonly inputPasswordConfirm: Locator;
    readonly invalidFeedback: Locator;
    readonly btnSubmit: Locator;

    constructor(page: Page) {
        this.page = page;
        this.inputName = page.locator('#display_name');
        this.inputEmail = page.locator('#login_email');
        this.inputPassword = page.locator('#login_password');
        this.inputPasswordConfirm = page.locator('#login_password_confirm');
        this.invalidFeedback = page.locator('.invalid-feedback').first();
        this.btnSubmit = page.locator('button[type="submit"]');
    }

    async register(name: string, email: string, password1: string, password2: string) {
        await this.page.goto('/register');
        await this.inputName.fill(name);
        await this.inputEmail.fill(email);
        await this.inputPassword.fill(password1);
        await this.inputPasswordConfirm.fill(password2);
        await this.btnSubmit.click();
        await this.page.waitForLoadState('load');
    }
}
