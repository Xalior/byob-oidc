#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { claimsFor, fault, passwdEntry, readRequest, reject, reply } from './passwd.mjs';

// Where `make install` puts the helper. The provider gives backends a scrubbed
// environment, so this path cannot come from the provider's settings. PAM_CHECK
// is honoured only for running this command by hand, and there is deliberately
// no fall back to the freshly built copy next to this file: that one is not
// setuid, and using it by accident looks exactly like a wrong password.
const PAM_CHECK = process.env.PAM_CHECK || '/usr/local/libexec/byob-pam-check';

const request = readRequest();

// A zero byte separates the two fields below, so one inside either value would
// let a caller choose where the split lands.
const NUL = String.fromCharCode(0);
if (typeof request.username !== 'string' || typeof request.password !== 'string') {
    fault('username and password must both be strings');
}
if (request.username.includes(NUL) || request.password.includes(NUL)) {
    reject('refused a username or password containing a zero byte');
}

// Username and password go to the helper on standard input, each ended by a
// zero byte. Nothing sensitive appears in the command line or the environment.
const checker = spawn(PAM_CHECK, [], { stdio: ['pipe', 'inherit', 'inherit'] });

checker.on('error', (err) => fault(`could not run ${PAM_CHECK}: ${err.message}`));

checker.on('close', (code) => {
    if (code === 1) reject(`PAM refused ${request.username}`);
    if (code !== 0) fault(`${PAM_CHECK} exited with code ${code}`);

    const entry = passwdEntry(request.username);
    if (!entry) fault(`PAM accepted ${request.username} but /etc/passwd has no such account`);

    reply(entry.name, claimsFor(entry));
});

checker.stdin.on('error', () => {});
checker.stdin.end(`${request.username}${NUL}${request.password}${NUL}`);
