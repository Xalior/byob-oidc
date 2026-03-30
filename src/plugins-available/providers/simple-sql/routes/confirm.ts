import { users, confirmation_codes } from "../schema.ts";
import { getDb } from "../db.ts";
import { eq, and, gte } from "drizzle-orm";
import { Request, Response, NextFunction, Application } from 'express';
import { Client } from '../../../../models/clients.ts';

export default (app: Application): void => {
    app.get('/confirm', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const age_limit = new Date(Date.now() - (60*30));
            const query_string = req.url.replace(/^\/confirm\?/, '');

            console.log("query_string:", query_string);
            // Search for a confirmation code that matches the raw query string
            const confirmation_code = await getDb().select()
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

                await getDb().update(users).set({
                    verified: 1,
                    confirmed_at: new Date(Date.now()),
                    login_attempts: 0,
                    // @ts-ignore
                }).where(eq(users.id, confirmation_code[0].user_id));

                await getDb().update(confirmation_codes).set({
                    used: 1,
                })
                .where(
                    eq(confirmation_codes.confirmation_code, query_string)
                );

                // Check if user registered from a specific OIDC client — redirect them back
                const userId = confirmation_code[0].user_id;
                const confirmedUser = userId ? (await getDb().select()
                    .from(users)
                    .where(eq(users.id, userId))
                    .limit(1))[0] : null;

                if (confirmedUser?.registered_from_client_id) {
                    const originClient = await Client.findByClientId(confirmedUser.registered_from_client_id);
                    if (originClient && originClient.redirect_uris.length > 0) {
                        // Strip the OIDC callback path to get the site root
                        const redirectUrl = new URL(originClient.redirect_uris[0]);
                        req.flash('success', 'Account confirmed - redirecting you back');
                        return res.redirect(redirectUrl.origin);
                    }
                }

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