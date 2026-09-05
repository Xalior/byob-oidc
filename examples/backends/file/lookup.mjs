#!/usr/bin/env node
import { loadUsers, readRequest, reject, reply } from './lib.mjs';

const request = readRequest();
const users = loadUsers();

const record = users[request.account_id];
if (!record) {
    reject(`no such account: ${request.account_id}`);
}

reply(request.account_id, record.claims ?? {});
