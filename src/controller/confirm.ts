import { users, confirmation_codes } from "../db/schema.ts";
import { db } from "../db/index.ts";
import { eq, and, gte } from "drizzle-orm";
import { Request, Response, NextFunction, Application } from 'express';

export default (app: Application): void => {
    app.get('/confirm', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const age_limit = new Date(Date.now() - (60*30));
            const query_string = req.url.replace(/^\/confirm\?/, '');

            console.log("query_string:", query_string);
            // Search for a confirmation code that matches the raw query string
            const confirmation_code = await db.select()
            .from(confirmation_codes)
            .where(
                eq(confirmation_codes.confirmation_code, query_string)
            )
            .limit(1);

            console.log("confirmation_code:", confirmation_code);

            // If we found it, mark the user as confirmed, and redir to login
            if(confirmation_code.length) {
                if(confirmation_code[0].used > 0) {
                    req.flash('info', "This account has already been activated once!");

                    return res.redirect('/login');
                }

                // Check for expired codes here, and handle accordingly
                //                     gte(confirmation_codes.created_at, age_limit)
                // removed from above query, so we can handle error messages instead

                await db.update(users).set({
                    verified: 1,
                    confirmed_at: new Date(Date.now()),
                    login_attempts: 0,
                    // @ts-ignore
                }).where(eq(users.id, confirmation_code[0].user_id));

                await db.update(confirmation_codes).set({
                    used: 1,
                })
                .where(
                    eq(confirmation_codes.confirmation_code, query_string)
                );

                req.flash('success', 'Account confirmed - please login to continue');

                return res.redirect("/login");
            }

            // SHush now, no need to tell them anything...
            return res.render('confirm');
        } catch (err) {
            next(err);
        }
    });
};