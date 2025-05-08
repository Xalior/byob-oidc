import { check, validationResult, matchedData } from 'express-validator';
import { users, confirmation_codes } from '../db/schema.ts';
import { db } from "../db/index.ts";
import { eq, and } from "drizzle-orm";
import { sendPasswordResetEmail } from "../lib/email.ts";
import { nanoid } from "nanoid";
import { generateAccountId, hashAccountPassword } from "../models/account.ts";
import { Request, Response, NextFunction, Application } from 'express';

export default (app: Application): void => {
    app.get('/reset_password', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const query_string = req.url.replace(/^\/reset_password\?/, '');

            // Search for a confirmation code that matches the raw query string
            const confirmation_code = (await db.select()
                .from(confirmation_codes)
                .where(
                    and(
                        eq(confirmation_codes.confirmation_code, query_string),
                        eq(confirmation_codes.used, 0)
                    )
                )
                .limit(1))[0];

            if(!confirmation_code) {
                req.flash('error', 'Confirmation code not recognized!');

                return res.redirect(`/`);
            }

            return res.render('reset_password', {
                query_string: query_string
            });
        } catch (err: unknown) {
            next(err);
        }
    });

    app.post('/reset_password',
        check('email').trim().notEmpty().isEmail().withMessage('Not a valid e-mail address'),

        check('password_1').trim().notEmpty().isStrongPassword({
            minLength: 16,
            minLowercase: 2,
            minUppercase: 2,
            minNumbers: 2,
            minSymbols: 0,
        }).withMessage('Strong password required (Min. length 16 characters long and must containing at-least 2 uppercase, 2 lowercase and 2 numeric characters.'),

        check('password_2').trim().custom((value: string, meta) => {
            const req = meta.req;
            if (value !== req.body.password_1) {
                // throw error if passwords do not match
                throw new Error("Passwords don't match");
            } else {
                return value;
            }
        }).trim(),

        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const query_string = req.url.replace(/^\/reset_password\?/, '');

                const result = validationResult(req);
                const validation_errors = result.array();

                if(validation_errors && validation_errors.length) {
                    console.error(validation_errors);
                    req.body.errors = [];

                    validation_errors.forEach((error) => {
                        req.body.errors[error.path] = error.msg;
                    })

                    req.body.confirmation_code = query_string;

                    return res.render('reset_password', {
                        reset_form: req.body,
                        query_string: query_string
                    });
                }

                const age_limit = new Date(Date.now() - (60*30));

                // Search for a confirmation code that matches the raw query string
                const confirmation_code = (await db.select()
                    .from(confirmation_codes)
                    .innerJoin(users, eq(confirmation_codes.user_id, users.id))
                    .where(
                        and(
                            eq(confirmation_codes.user_id, users.id),
                            eq(confirmation_codes.used, 0),
                            eq(confirmation_codes.confirmation_code, query_string)
                        )
                    )
                    .limit(1))[0];

                console.log("confirmation_details:", confirmation_code);

                const reset_form = matchedData(req, { includeOptionals: true });

                // If we found it, mark the user as confirmed, and redir to login
                if(confirmation_code?.users?.email === reset_form.email) {
                    await db.update(users).set({
                        password: await hashAccountPassword(reset_form.password_1),
                    }).where(
                        eq(users.id, confirmation_code.users.id)
                    );

                    await db.update(confirmation_codes).set({
                        used: 1,
                    })
                    .where(
                        eq(confirmation_codes.confirmation_code, query_string)
                    );

                    req.flash('info', 'Password changed successfully.');

                    return res.redirect(`/`);
                } else {
                    if(!req.body.errors) {req.body.errors = {};}
                    req.body.errors.email = "Please confirm your email address matches your account..."
                    console.log("Failing ",confirmation_code, " VS ", reset_form);
                }

                return res.render('reset_password', {
                    reset_form: req.body,
                    query_string: query_string
                });
            } catch (err: unknown) {
                next(err);
            }
    });
};
