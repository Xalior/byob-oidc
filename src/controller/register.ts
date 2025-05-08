import { check, validationResult, matchedData } from 'express-validator';
import { users, confirmation_codes } from '../db/schema.js';
import { db } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { sendConfirmationEmail} from "../lib/email.js";
import {nanoid} from "nanoid";
import {generateAccountId, hashAccountPassword} from "../models/account.ts";
import { Request, Response, NextFunction, Application } from 'express';
import config from "../../data/config.ts";

export default (app: Application): void => {
    console.log("config.client_features.registration",config.client_features.registration);
    if(!config.client_features.registration) return; //do nothing, feature disabled

    app.get('/register', async (req: Request, res: Response, next: NextFunction) => {
        try {
            return res.render('register');
        } catch (err) {
            next(err);
        }
    });

    app.post('/register',
        check('display_name').trim().notEmpty().isLength({
            min: 5,
            max: 64
        }).withMessage("Display name should be between 5 and 64 characters.").escape(),

        check('email').trim().notEmpty().isEmail().withMessage('Not a valid e-mail address').custom(
            async (value: string, {req, loc, path}: {req: Request, loc: string, path: string}) => {
                try {
                    const existing_user = (await db.select()
                        .from(users)
                        .where(eq(users.email, value))
                        .limit(1))[0];

                    if (existing_user) {
                        if (!existing_user.verified) {
                            throw new Error("User already exists - have you <a href=\"reconfirm\">lost your confirmation link</a>?");
                        }

                        if (existing_user.suspended) {
                            throw new Error("The account associated with this email address has been suspended.");
                        }

                        throw new Error("User already exists - do you need to <a href=\"/lost_password\">reset your password</a>?");
                    } else {
                        return value;
                    }
                } catch (err) {
                    console.log(err);
                    throw new Error(err as string);
                }
            }
        ),

        check('password_1').trim().notEmpty().isStrongPassword({
            minLength: 16,
            minLowercase: 2,
            minUppercase: 2,
            minNumbers: 2,
            minSymbols: 0,
        }).withMessage('Strong password required (Min. length 16 characters long and must containing at-least 2 uppercase, 2 lowercase and 2 numeric characters.'),

        check('password_2').trim().custom((value: string, {req, loc, path}: {req: Request, loc: string, path: string}) => {
            if (value !== req.body.password_1) {
                // throw error if passwords do not match
                throw new Error("Passwords don't match");
            } else {
                return value;
            }
        }).trim(),
        check('agree_tos').notEmpty().withMessage('You must agree to our terms of service to join.'),

        // Actual page response
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(req.body.confirm_spammer === 'on') {
                    // Redirect to confirmation static page -- the email= slug only logs the email address in the weblog
                    // it's a red herring in a honeypot ;-)  -- but stored lazily so we can maybe report on it later...
                    return res.redirect(`/confirm?email=${req.body.email}`);
                }

                console.log("validationResult(req)",validationResult(req));

                const validation_errors = validationResult(req)?.errors;

                if(validation_errors && validation_errors.length) {
                    req.body.errors = [];

                    validation_errors.forEach((error) => {
                        req.body.errors[error.path] = error.msg;
                    })


                    return res.render('register', {
                        reg_form: req.body
                    });
                }

                const reg_form = matchedData(req, { includeOptionals: true });

                const new_user_id = (await db.insert(users).values({
                    email: reg_form.email,
                    account_id: generateAccountId(),
                    password: await hashAccountPassword(reg_form.password_1),
                    display_name: reg_form.display_name,
                }).$returningId())[0].id;

                const confirmation_code_id = (await db.insert(confirmation_codes).values({
                    user_id: new_user_id,
                    confirmation_code: nanoid(52)
                }).$returningId())[0].id;

                const confirmation_code = (await db.select()
                    .from(confirmation_codes)
                    .where(eq(confirmation_codes.id, confirmation_code_id))
                    .limit(1))[0];

                await sendConfirmationEmail(req.body.email, confirmation_code.confirmation_code);

                // Redirect to confirmation static page
                return res.redirect(`/confirm`);
            } catch (err) {
                next(err);
            }
        });
};