#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { claimsFor, fault, passwdEntry, readRequest, reject, reply } from './passwd.mjs';

const PAM_CHECK = process.env.PAM_CHECK || new URL('pam_check', import.meta.url).pathname;

const request = readRequest();

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
checker.stdin.end(`${request.username}\0${request.password}\0`);
