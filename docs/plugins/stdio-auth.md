# The stdio-auth provider

`stdio-auth` authenticates users by running a command that you supply. The
plugin never knows what is behind that command. It can be a script that reads a
file, a program that talks to a directory server, or a helper that calls the
operating system's own authentication library.

The plugin and your command exchange JSON. The plugin writes one JSON object to
the command's standard input. The command writes one JSON object to its standard
output and sets an exit code. That is the whole interface.

This document is the contract. If your command follows it, the plugin will work
with it.

## Configuration

```
PROVIDER=stdio-auth

STDIO_AUTH_AUTHENTICATE_COMMAND=/usr/local/libexec/byob-authenticate
STDIO_AUTH_LOOKUP_COMMAND=/usr/local/libexec/byob-lookup
```

Both settings are required. The plugin refuses to start when either is missing,
rather than failing later during a login.

Each setting is a path to an executable file and nothing else. The plugin does
not accept arguments and does not pass the value through a shell. If your
backend needs command line arguments, write a small wrapper script that supplies
them.

Optional settings and their defaults:

```
STDIO_AUTH_TIMEOUT_MS=5000          # how long a command may run
STDIO_AUTH_MAX_OUTPUT_BYTES=65536   # how much stdout the plugin will read
STDIO_AUTH_CACHE_MAX=1000           # how many lookup results to hold
STDIO_AUTH_CACHE_TTL_MS=30000       # how long to hold each one
```

The login page asks for a `Username` in a plain text box, because the name a
person types is whatever your backend recognises. A text box takes an email
address as readily as anything else, so a backend that does use addresses needs
no change. To reword the label, set the core setting `LOGIN_LABEL`, which
applies whichever provider is running.

## The two commands

The plugin runs the authenticate command when a user submits the login form. It
runs the lookup command when it needs a user's details without a password, which
happens when it issues a token and when a client calls the userinfo endpoint.

The two commands are separate executables. Each one is told which operation it
is performing anyway, so a single program can serve both settings if you prefer.

## The request

The plugin starts the command, writes one line of JSON to its standard input,
then closes standard input. Your command can read to end of file, or read a
single line. Both work.

Authenticate:

```json
{"version":1,"operation":"authenticate","username":"jane","password":"correct horse"}
```

Lookup:

```json
{"version":1,"operation":"lookup","account_id":"jane"}
```

`version` is `1` for this contract. If the contract ever changes in a way that
old commands cannot handle, the number will change. Ignore any field you do not
recognise, so that new fields do not break your command.

## The reply

On success, write one JSON object to standard output and exit with code `0`.

```json
{"account_id":"jane","email":"jane@example.com","name":"Jane Smith","groups":["staff","admin"]}
```

`account_id` is required. It is the identity the rest of the system uses, and it
becomes the `sub` claim in every token issued for this user. Your backend
decides it, not the plugin. This matters when a user can log in under more than
one spelling of their name. If `jane`, `Jane` and `jane@example.com` are the same
person, return the same `account_id` for all three, or they become three
separate identities.

Choose an `account_id` that never gets reused. If it is handed to a different
person later, that person inherits the first person's access at every client
application that remembered the old value.

Every other field in the object becomes a claim on the user, exactly as you
wrote it. The plugin does not rename, filter or validate them.

Both commands return the same shape. The authenticate command returns the user's
claims along with the verdict, so that a successful login does not need a second
call to the lookup command.

The whole of standard output must be that one JSON object. Anything else, whether
it comes before or after, makes the reply unreadable.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success. Standard output holds the JSON reply. |
| `1` | Rejected. Wrong password, or no such account. No output needed. |
| anything else | The backend failed. |

A backend failure is not a rejection. It means your command could not reach a
decision: a database was down, a configuration file was missing, a helper was
not installed.

## Diagnostics

Write anything you want to log to standard error. The plugin captures it and
writes it to the server log, and it never reaches the browser.

Please use it. A user who meets a broken backend sees the same message as a user
who typed the wrong password, so the server log is the only place the real
failure appears.

## Timeouts

A command that has not finished within `STDIO_AUTH_TIMEOUT_MS` is sent
`SIGTERM`, and `SIGKILL` shortly after. The plugin treats the result as a backend
failure.

## The environment your command receives

The plugin gives the command a minimal environment containing `PATH` and nothing
else. The server's own settings, including its database and cache credentials,
are not passed on. If your backend needs configuration of its own, read it from a
file, or set it in the wrapper script that launches it.

The command runs as the same operating system user as the identity provider. It
receives no elevated privileges. If your backend needs them, for example to read
a shadow password file, the privilege must come from the backend itself.

## Passwords

The password reaches your command on standard input only. It is never placed in
the command line, where other users of the machine could read it from the process
list, and never in the environment, where they could read it from `/proc`.

Please keep that property in anything your command goes on to run.

## Caching

The plugin keeps recent lookup results in memory, so that issuing a token does
not run your lookup command every time. A successful authenticate also fills the
cache, since it returns the same information.

Only successful lookups are cached. A lookup that finds nothing is never stored,
so a newly created account is visible at once.

The cache holds `STDIO_AUTH_CACHE_MAX` entries for `STDIO_AUTH_CACHE_TTL_MS`
each. The oldest unused entry is dropped when the cache is full. Entries are
removed when they are next touched, rather than on a timer.

The trade this makes is worth understanding. When you disable or delete an
account, your backend stops authenticating it immediately, so nobody can log in.
Tokens already issued keep working until they expire, as they always would, and
for up to the cache lifetime the userinfo endpoint may still answer from the
stored copy. Shorten `STDIO_AUTH_CACHE_TTL_MS` if that window matters to you,
and set it to `0` to switch the cache off.

## What this provider does not do

There is no registration, no password reset and no profile page. `stdio-auth`
answers questions about accounts that already exist somewhere else, and that
somewhere else owns their creation, their passwords and their removal. The
pages hide the links to all three, so nobody is offered a page that is not
there.

Account state is your backend's business too. An account that is expired, locked,
suspended or out of hours should be rejected with exit code `1`. The plugin has no
opinion about why.

Repeated failed passwords are your backend's business as well. The plugin keeps
no counters and locks nothing out.

## A complete example

A command that authenticates one hard-coded user, written in shell. It reads the
JSON with no tools beyond `sed`, which is fine for an example and not something
to copy into production.

```sh
#!/bin/sh
request=$(cat)

username=$(printf '%s' "$request" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
password=$(printf '%s' "$request" | sed -n 's/.*"password":"\([^"]*\)".*/\1/p')

if [ "$username" = "jane" ] && [ "$password" = "hunter2" ]; then
    printf '{"account_id":"jane","email":"jane@example.com","name":"Jane Smith"}\n'
    exit 0
fi

echo "rejected login for $username" >&2
exit 1
```

Working backends, one reading a file of users and one calling the operating
system's authentication library, are in `examples/backends/`.
