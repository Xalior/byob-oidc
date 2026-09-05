#!/usr/bin/env node
import { claimsFor, passwdEntry, readRequest, reject, reply } from './passwd.mjs';

const request = readRequest();

const entry = passwdEntry(request.account_id);
if (!entry) reject(`no such account: ${request.account_id}`);

reply(entry.name, claimsFor(entry));
