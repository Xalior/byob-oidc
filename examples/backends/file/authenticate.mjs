#!/usr/bin/env node
import { loadUsers, passwordMatches, readRequest, reject, reply } from './lib.mjs';

const request = readRequest();
const users = loadUsers();

const record = Object.hasOwn(users, request.username) ? users[request.username] : undefined;

// Hash even when the account is unknown, so that a missing account and a wrong
// password take the same time to answer.
const stored = record ? record.password : 'scrypt$00$00';
const matched = passwordMatches(request.password ?? '', stored);

if (!record || !matched) {
    reject(`rejected login for ${request.username}`);
}

reply(request.username, record.claims ?? {});
