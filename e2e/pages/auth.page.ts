import { type Page, type Locator } from '@playwright/test';

export class AuthPage {
    readonly page: Page;
    readonly inputEmail: Locator;
    readonly inputPassword: Locator;
    readonly inputPasswordConfirm: Locator;
    readonly inputLoginMFA: Locator;
    readonly btnSubmit: Locator;
    readonly navbar: Locator;
    readonly alertFlash: Locator;
    readonly alertInfo: Locator;
    readonly alertDanger: Locator;

    constructor(page: Page) {
        this.page = page;
        this.inputEmail = page.locator('#login_email');
        this.inputPassword = page.locator('#login_password');
        this.inputPasswordConfirm = page.locator('#login_password_confirm');
        this.inputLoginMFA = page.locator('#login_mfa');
        this.btnSubmit = page.locator('button[type="submit"]');
        this.navbar = page.locator('.navbar');
        this.alertFlash = page.locator('.alert-flash');
        this.alertInfo = page.locator('.alert-info');
        this.alertDanger = page.locator('.alert-danger');
    }

    async login(email: string, password: string) {
        await this.page.goto('/login');
        await this.inputEmail.fill(email);
        await this.inputPassword.fill(password);
        await this.btnSubmit.click();
        await this.page.waitForLoadState('load');
    }

    async logout() {
        await this.page.goto('/logout', { waitUntil: 'domcontentloaded' });
        const logoutBtn = this.page.locator('button[name="logout"]');
        if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await logoutBtn.click();
            await this.page.waitForLoadState('load');
        }
    }

    async lostPassword(email: string) {
        await this.page.goto('/lost_password');
        await this.inputEmail.fill(email);
        await this.btnSubmit.click();
        await this.page.waitForLoadState('load');
    }

    async resetPassword(resetCode: string, email: string, password: string) {
        await this.page.goto(`/reset_password?${resetCode}`);
        await this.inputEmail.fill(email);
        await this.inputPassword.fill(password);
        await this.inputPasswordConfirm.fill(password);
        await this.btnSubmit.click();
        await this.page.waitForLoadState('load');
    }

    async confirmLogin(pin: string) {
        await this.inputLoginMFA.fill(pin);
        await this.btnSubmit.click();
        await this.page.waitForLoadState('load');
    }
}
