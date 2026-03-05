/**
 * Example CSV Provider Plugin for BYOB-OIDC
 *
 * Authenticates users against a CSV flat file with bcrypt-hashed passwords.
 * This is a read-only provider — no registration, profile, or password reset routes.
 *
 * CSV format (with header row):
 *   id,email,password_hash,name
 *   1,alice@example.com,$2a$11$...,Alice Smith
 *   2,bob@example.com,$2a$11$...,Bob Jones
 *
 * Environment variables:
 *   CSV_USERS_FILE  - Path to the CSV file (default: /data/users.csv)
 *
 * To generate a bcrypt hash for testing:
 *   node -e "import('bcryptjs').then(b => b.hash('password', 11).then(console.log))"
 */

import type { ProviderPlugin, OIDCAccount, PluginConfig } from '@byob-oidc/plugin-types';
import type { Request } from 'express';
import { readFileSync, watchFile, unwatchFile } from 'node:fs';
import bcrypt from 'bcryptjs';

interface CSVUser {
    id: string;
    email: string;
    password_hash: string;
    name: string;
}

let users: CSVUser[] = [];
let csvFilePath: string = '';

function parseCSV(content: string): CSVUser[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return []; // header only or empty

    const header = lines[0].split(',').map(h => h.trim());
    const idIdx = header.indexOf('id');
    const emailIdx = header.indexOf('email');
    const passIdx = header.indexOf('password_hash');
    const nameIdx = header.indexOf('name');

    if (idIdx === -1 || emailIdx === -1 || passIdx === -1 || nameIdx === -1) {
        throw new Error(
            `CSV header must contain: id,email,password_hash,name. Got: ${header.join(',')}`
        );
    }

    const result: CSVUser[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const fields = line.split(',').map(f => f.trim());
        result.push({
            id: fields[idIdx],
            email: fields[emailIdx],
            password_hash: fields[passIdx],
            name: fields[nameIdx],
        });
    }
    return result;
}

function loadUsers(): void {
    const content = readFileSync(csvFilePath, 'utf-8');
    users = parseCSV(content);
    console.log(`example-csv-provider: loaded ${users.length} users from ${csvFilePath}`);
}

function findUserByEmail(email: string): CSVUser | undefined {
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function findUserById(id: string): CSVUser | undefined {
    return users.find(u => u.id === id);
}

function wrapUser(user: CSVUser): OIDCAccount {
    return {
        accountId: user.id,
        async claims(use: string, scope: string) {
            const claims: Record<string, any> = { sub: user.id };
            if (scope.includes('email') || use === 'id_token') {
                claims.email = user.email;
                claims.email_verified = true;
            }
            if (scope.includes('profile')) {
                claims.name = user.name;
            }
            return claims;
        },
    };
}

const plugin: ProviderPlugin = {
    meta: {
        name: 'example-csv',
        version: '1.0.0',
        type: 'provider',
        description: 'CSV flat-file provider with bcrypt authentication',
    },

    async initialize(config: PluginConfig) {
        csvFilePath = process.env.CSV_USERS_FILE || '/data/users.csv';

        try {
            loadUsers();
        } catch (err: any) {
            throw new Error(`Failed to load CSV users file "${csvFilePath}": ${err.message}`);
        }

        // Watch for changes and reload automatically
        watchFile(csvFilePath, { interval: 5000 }, () => {
            try {
                loadUsers();
            } catch (err: any) {
                console.error(`example-csv-provider: failed to reload CSV: ${err.message}`);
            }
        });

        console.log(`example-csv-provider initialized (file: ${csvFilePath})`);
    },

    async shutdown() {
        unwatchFile(csvFilePath);
    },

    async authenticate(req: Request): Promise<OIDCAccount | null> {
        const { login, password } = req.body;
        if (!login || !password) {
            req.flash('error', 'Email and password are required');
            return null;
        }

        const user = findUserByEmail(login);
        if (!user) {
            req.flash('error', 'Invalid email or password');
            return null;
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            req.flash('error', 'Invalid email or password');
            return null;
        }

        return wrapUser(user);
    },

    async findAccount(ctx: any, id: string): Promise<OIDCAccount | null> {
        const user = findUserById(id);
        return user ? wrapUser(user) : null;
    },

    async getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>> {
        const user = findUserById(accountId);
        if (!user) return { sub: accountId };
        const claims: Record<string, any> = { sub: accountId };
        if (scope.includes('email') || use === 'id_token') {
            claims.email = user.email;
            claims.email_verified = true;
        }
        if (scope.includes('profile')) {
            claims.name = user.name;
        }
        return claims;
    },

    // No routes — this is a read-only CSV provider
};

export default plugin;
