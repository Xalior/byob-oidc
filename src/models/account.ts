import {nanoid} from 'nanoid';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';
import {config} from '../lib/config.ts'
import bcrypt from 'bcryptjs';
import { Request } from 'express';

export interface User extends Express.User {
    id: number;
    account_id: string;
    email: string;
    password: string;
    display_name: string;
    verified: number;
    suspended: number;
    login_attempts: number;
    [key: string]: any;
}

export interface AccountProfile {
    email: string;
    display_name: string;
    user: User;
    [key: string]: any;
}

export const generateAccountId = (): string => {
    return nanoid(16)
}

const PASSWORD_SALT = config.password.salt;

export const hashAccountPassword = async (password: string): Promise<string> => {
    try {
        const salt = await bcrypt.genSalt(PASSWORD_SALT);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.log(error);
        throw new Error('Error hashing password');
    }
}

export class Account {
    accountId: string;
    profile: AccountProfile;

    constructor(id: string | undefined, profile: AccountProfile) {
        if(id) {
            console.log("ACCOUNT", id);
        }
        this.accountId = id || nanoid();
        this.profile = profile;
    }

    /**
     * @param use - can either be "id_token" or "userinfo", depending on
     *   where the specific claims are intended to be put in.
     * @param scope - the intended scope, while oidc-provider will mask
     *   claims depending on the scope automatically you might want to skip
     *   loading some claims from external resources etc. based on this detail
     *   or not return them in id tokens but only userinfo and so on.
     */
    async claims(use: string, scope: string): Promise<any> { // eslint-disable-line no-unused-vars
        const user = (await db.select()
            .from(users)
            .where(eq(users.account_id, this.accountId))
            .limit(1))[0];

        return {
            sub: this.accountId,
            email: user.email,
            verified: user.verified,
            suspended: user.suspended,
            display_name: user.display_name,
        };
    }

    static async findByLogin(req: Request): Promise<Account | null> {
        const email = req.body.login;
        const password = req.body.password;

        const user = (await db.select()
            .from(users)
            .where(and
                (
                    eq(users.email, email),
                    eq(users.verified, 1),
                    eq(users.suspended, 0),
                )
            )
            .limit(1))[0];

        // User not found
        if(!user) {
            req.flash('error', 'Login failed, try again.<br> Or maybe you <a href="/lost_password">forgot your password</a>?');

            return null;
        }

        // User not found
        if(user.login_attempts>2) {
            req.flash('error', 'Account Locked.<br> <a href="/lost_password">Reset your password</a> to continue.');

            return null;
        }

        // Password wrong?
        if (!(await bcrypt.compare(password, user.password))) {
            await db.update(users).set({
                login_attempts: user.login_attempts+1,
            }).where(eq(users.id, user.id));

            req.flash('error', 'Login failed, try again.<br> Or maybe you <a href="/lost_password">lost your password</a>?');

            return null;
        }

        // If the user has failed to login before, reset that to zero now
        if(user.login_attempts>0) {
            await db.update(users).set({
                login_attempts: 0,
            }).where(eq(users.id, user.id));
        }

        return new Account(user.account_id, {
            email: user.email,
            display_name: user.display_name,
            user: user,
        });
    }

    static async findAccount(ctx: any, id: string, token?: any): Promise<Account | null> { // eslint-disable-line no-unused-vars
        // token is a reference to the token used for which a given account is being loaded,
        //   it is undefined in scenarios where account claims are returned from authorization endpoint
        // ctx is the http request context

        const user = (await db.select()
            .from(users)
            .where(eq(users.account_id, id))
            .limit(1))[0];

        if (!user) {
            return null; // maintain existing behavior for OIDC
        }

        return new Account(user.account_id, {
            email: user.email,
            display_name: user.display_name,
            user: user,
        });
    }
}

export const ensureAuthenticated = (req: Request, res: any, next: () => void): void => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    if (req.session) {
        req.session.destination_path = req.route.path;
    }
    res.redirect('/login') // if not auth
};

export const forwardAuthenticated = (req: Request, res: any, next: () => void): void => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return next();
    }
    res.redirect('/profile');  // if auth
}
