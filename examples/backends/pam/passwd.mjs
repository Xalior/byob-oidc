import { readFileSync } from 'node:fs';

/**
 * Read one account out of /etc/passwd.
 *
 * This file is readable by everyone, so no privilege is needed here. Only the
 * password check needs privilege, and that lives in pam_check.
 */
export function passwdEntry(username) {
    const lines = readFileSync('/etc/passwd', 'utf8').split('\n');

    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;

        const [name, , uid, gid, gecos, home, shell] = line.split(':');
        if (name !== username) continue;

        return { name, uid, gid, gecos: gecos ?? '', home, shell };
    }

    return null;
}

/**
 * Turn a passwd entry into claims.
 *
 * There is no email address in /etc/passwd. Add one here if your machines put
 * it in the comment field, or leave the claim out and let the client ask for
 * it elsewhere.
 */
export function claimsFor(entry) {
    const fullName = entry.gecos.split(',')[0];

    return {
        preferred_username: entry.name,
        ...(fullName ? { name: fullName } : {}),
    };
}

export function readRequest() {
    return JSON.parse(readFileSync(0, 'utf8'));
}

export function reply(accountId, claims) {
    process.stdout.write(JSON.stringify({ account_id: accountId, ...claims }) + '\n');
    process.exit(0);
}

export function reject(note) {
    process.stderr.write(`${note}\n`);
    process.exit(1);
}

export function fault(note) {
    process.stderr.write(`${note}\n`);
    process.exit(2);
}
