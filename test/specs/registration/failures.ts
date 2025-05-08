import { expect } from '@wdio/globals'
import RegistrationPage from '../../pageobjects/registration.page.ts'

// @ts-ignore - our testdata doesn't have a type
import testdata from "../../../data/testdata.js"

describe('Registration:Failures', () => {
    it("01: Can't register a duplicate...", async () => {
        await RegistrationPage.register("Duplicate User", testdata.admin.email, testdata.admin.password, testdata.admin.password);
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Error: User already exists'));
    });

    it("02: Can't register a short username...", async () => {
        await RegistrationPage.register("Four", testdata.newuser.email, testdata.newuser.password, testdata.newuser.password);
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Display name should be between 5 and 64 characters'));
    });

    it("03: Can't register a long username...", async () => {
        await RegistrationPage.register("When I am Sixty Four characters long, this should fail, and that shoud be a good thing...",
         testdata.newuser.email, testdata.newuser.password, testdata.newuser.password);
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Display name should be between 5 and 64 characters'));
    });

    it("04: Can't register with missmatched passwords...", async () => {
        await RegistrationPage.register("Mismatched Passwords", testdata.newuser.email, testdata.newuser.password, testdata.newuser.password+".");
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining("Passwords don't match"));
    });

    it("04: Can't register with a short password...", async () => {
        await RegistrationPage.register("Short Passwords", testdata.newuser.email, "12qwAS", "12qwAS");
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Strong password required'));
    });

    it("05: Can't register with a <2 upper case...", async () => {
        await RegistrationPage.register("Short on Upper", testdata.newuser.email, "123123qweqweasdasD", "123123qweqweasdasD");
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Strong password required'));
    });

    it("06: Can't register with a <2 digit...", async () => {
        await RegistrationPage.register("Short on Upper", testdata.newuser.email, "1qweqweqweqweasdASD", "1qweqweqweqweasdASD");
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Strong password required'));
    });

    it("07: Can't register with a <2 lower case...", async () => {
        await RegistrationPage.register("Short on Upper", testdata.newuser.email, "123123QWEQWE", "123123QWEQWE");
        await expect(RegistrationPage.invalidFeedback).toHaveText(expect.stringContaining('Strong password required'));
    });
});