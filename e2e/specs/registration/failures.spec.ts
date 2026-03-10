import { test, expect } from '@playwright/test';
import { RegistrationPage } from '../../pages/registration.page.ts';

// @ts-ignore
import testdata from '../../../data/testdata.js';

test.describe('Registration:Failures', () => {
    test('01: Can\'t register a duplicate...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Duplicate User', testdata.admin.email, testdata.admin.password, testdata.admin.password);
        await expect(reg.invalidFeedback).toHaveText(/User already exists/i);
    });

    test('02: Can\'t register a short username...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Four', testdata.newuser.email, testdata.newuser.password, testdata.newuser.password);
        await expect(reg.invalidFeedback).toContainText('Display name should be between 5 and 64 characters');
    });

    test('03: Can\'t register a long username...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register(
            'When I am Sixty Four characters long, this should fail, and that shoud be a good thing...',
            testdata.newuser.email, testdata.newuser.password, testdata.newuser.password
        );
        await expect(reg.invalidFeedback).toContainText('Display name should be between 5 and 64 characters');
    });

    test('04: Can\'t register with mismatched passwords...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Mismatched Passwords', testdata.newuser.email, testdata.newuser.password, testdata.newuser.password + '.');
        await expect(reg.invalidFeedback).toContainText("Passwords don't match");
    });

    test('04: Can\'t register with a short password...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Short Passwords', testdata.newuser.email, '12qwAS', '12qwAS');
        await expect(reg.invalidFeedback).toContainText('Strong password required');
    });

    test('05: Can\'t register with <2 upper case...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Short on Upper', testdata.newuser.email, '123123qweqweasdasD', '123123qweqweasdasD');
        await expect(reg.invalidFeedback).toContainText('Strong password required');
    });

    test('06: Can\'t register with <2 digit...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Short on Upper', testdata.newuser.email, '1qweqweqweqweasdASD', '1qweqweqweqweasdASD');
        await expect(reg.invalidFeedback).toContainText('Strong password required');
    });

    test('07: Can\'t register with <2 lower case...', async ({ page }) => {
        const reg = new RegistrationPage(page);
        await reg.register('Short on Upper', testdata.newuser.email, '123123QWEQWE', '123123QWEQWE');
        await expect(reg.invalidFeedback).toContainText('Strong password required');
    });
});
