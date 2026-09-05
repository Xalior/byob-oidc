import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const USERS_FILE = process.env.STDIO_AUTH_USERS_FILE || new URL('users.json', import.meta.url).pathname;

/** Read the request the plugin wrote to standard input. */
export function readRequest() {
    try {
        return JSON.parse(readFileSync(0, 'utf8'));
    } catch (err) {
        fault(`request was not readable JSON: ${err.message}`);
    }
}

/** Answer with an account and exit successfully. */
export function reply(accountId, claims) {
    process.stdout.write(JSON.stringify({ account_id: accountId, ...claims }) + '\n');
    process.exit(0);
}

/** Refuse the request: wrong password, or no such account. */
export function reject(note) {
    process.stderr.write(`${note}\n`);
    process.exit(1);
}

/** Something is wrong with this backend, and no decision was reached. */
export function fault(note) {
    process.stderr.write(`${note}\n`);
    process.exit(2);
}

export function loadUsers() {
    try {
        return JSON.parse(readFileSync(USERS_FILE, 'utf8'));
    } catch (err) {
        fault(`could not read ${USERS_FILE}: ${err.message}`);
    }
}

/** Turn a password into the string stored in the users file. */
export function hashPassword(password) {
    const salt = randomBytes(16);
    const derived = scryptSync(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Compare a submitted password against a stored one, in constant time. */
export function passwordMatches(password, stored) {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) {
        fault('a stored password is not in the scrypt$salt$hash form');
    }

    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(expected, actual);
}
