import { ensureAuthenticated } from "../models/account.ts";
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { check, validationResult, matchedData } from 'express-validator';
import { Request, Response, NextFunction, Application } from 'express';
import {FieldValidationError} from "express-validator/lib/base.js";

export default (app: Application): void => {
    app.get('/profile', ensureAuthenticated, async (req: Request, res: Response) => {
        return res.render('profile');
    });

    app.post('/profile', ensureAuthenticated,
        check('display_name').trim().notEmpty().isLength({
            min: 5,
            max: 64
        }).withMessage("Display name should be between 5 and 64 characters.").escape(),

        async (req: Request, res: Response) => {
        try {
            const validation_errors = validationResult(req)?.array() as FieldValidationError[];

            if(validation_errors && validation_errors.length) {
                validation_errors.forEach((error) => {
                    req.flash('error', error.msg);
                });
                return res.redirect('/profile');
            }

            const profile_form = matchedData(req, { includeOptionals: true });

            // Update the user's display_name in the database
            const results = await db.update(users)
                .set({ display_name: profile_form.display_name })
                .where(eq(users.account_id, req.user.sub));

            req.flash('success', 'Profile updated successfully');
            return res.redirect('/profile');
        } catch (error) {
            console.error('Error updating profile:', error);
            req.flash('error', 'An error occurred while updating your profile');
            return res.redirect('/profile');
        }
    });
};