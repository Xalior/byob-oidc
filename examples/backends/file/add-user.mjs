#!/usr/bin/env node
// Print a users.json entry for a password read from standard input.
//
//   echo -n 'hunter2' | ./add-user.mjs jane jane@example.com 'Jane Smith'
import { readFileSync } from 'node:fs';
import { hashPassword } from './lib.mjs';

const [accountId, email, name] = process.argv.slice(2);
if (!accountId) {
    process.stderr.write('usage: add-user.mjs <account_id> [email] [name] < password\n');
    process.exit(2);
}

const password = readFileSync(0, 'utf8').replace(/\n$/, '');

const claims = {};
if (email) claims.email = email;
if (name) claims.name = name;

process.stdout.write(JSON.stringify({
    [accountId]: { password: hashPassword(password), claims },
}, null, 2) + '\n');
