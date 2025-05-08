import {check, validationResult, matchedData, ValidationError} from 'express-validator';
import { users, confirmation_codes } from '../db/schema.ts';
import { db } from "../db/index.ts";
import { eq, and } from "drizzle-orm";
import { sendConfirmationEmail} from "../lib/email.ts";
import { nanoid } from "nanoid";
import { Request, Response, NextFunction, Application } from 'express';
import {FieldValidationError} from "express-validator/lib/base.js";

export default (app: Application): void => {
    app.get('/reconfirm', async (req: Request, res: Response, next: NextFunction) => {
        try {
            return res.render('reconfirm');
        } catch (err) {
            next(err);
        }
    });

    app.post('/reconfirm',
        check('email').trim().notEmpty().isEmail().withMessage('Not a valid e-mail address'),

        // Actual page response
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                if(req.body.confirm_spammer === 'on') {
                    // Redirect to confirmation static page -- the email= hostname only logs the email address in the weblog
                    // it's a red herring in a honeypot ;-)  -- but stored lazily so we can maybe report on it later...
                    return res.redirect(`/confirm?email=${req.body.email}`);
                }

                const validation_errors = validationResult(req)?.array() as FieldValidationError[];

                console.log(validation_errors);
                if(validation_errors && validation_errors.length) {
                    req.body.errors = [];

                    validation_errors.forEach((error) => {
                        req.body.errors[error.path] = error.msg;
                    })

                    console.log(req.body);
                    return res.render('reconfirm', {
                        conf_form: req.body
                    });
                }

                const conf_form = matchedData(req, { includeOptionals: true });

                const existing_user = (await db.select()
                    .from(users)
                    .where(and(
                        eq(users.email, conf_form.email),
                        eq(users.verified, 0),
                    ))
                    .limit(1))[0];

                if (existing_user) {
                    const confirmation_code_id = (await db.insert(confirmation_codes).values({
                        user_id: existing_user.id,
                        confirmation_code: nanoid(52)
                    }).$returningId())[0].id;

                    const [confirmation_code] = (await db.select()
                        .from(confirmation_codes)
                        .where(eq(confirmation_codes.id, confirmation_code_id))
                        .limit(1));

                    await sendConfirmationEmail(existing_user.email, confirmation_code.confirmation_code);
                }

                req.flash('info', 'If you have a pending account a reconfirmation email has now been sent. <br> '
                    + 'Please check your inbox, and any spam folders, for the link.');

                // Redirect to confirmation static page
                return res.redirect(`/confirm`);
            } catch (err) {
                next(err);
            }
        });
};
