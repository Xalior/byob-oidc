# File backend

A worked example of the `stdio-auth` contract. It keeps accounts in a JSON file
and checks passwords with scrypt.

It runs anywhere Node runs, so it is the quickest way to see the provider
working and the easiest thing to copy when you write a backend of your own. It
is an example, not a user directory. Nothing here manages accounts, expires
passwords or locks anyone out.

## Try it

Make a users file. The password is read from standard input, so it never appears
in your shell history or in the process list.

```sh
printf 'hunter2' | ./add-user.mjs jane jane@example.com 'Jane Smith' > users.json
```

Check it answers correctly:

```sh
echo '{"version":1,"operation":"authenticate","username":"jane","password":"hunter2"}' | ./authenticate.mjs
```

You should see the account and its claims, and an exit code of `0`. Try a wrong
password and you get exit code `1` and nothing on standard output.

## Point the provider at it

```
PROVIDER=stdio-auth
STDIO_AUTH_AUTHENTICATE_COMMAND=/path/to/examples/backends/file/authenticate.mjs
STDIO_AUTH_LOOKUP_COMMAND=/path/to/examples/backends/file/lookup.mjs
STDIO_AUTH_USERS_FILE=/path/to/users.json
```

`STDIO_AUTH_USERS_FILE` is this example's own setting. If you leave it out, the
scripts read `users.json` from the folder they live in.

## The users file

```json
{
  "jane": {
    "password": "scrypt$<salt in hex>$<hash in hex>",
    "claims": {
      "email": "jane@example.com",
      "name": "Jane Smith"
    }
  }
}
```

The key is the account id, and it becomes the `sub` claim in every token issued
for that person. Everything under `claims` is passed on to the identity provider
exactly as written.

Add users by appending entries. `add-user.mjs` prints one entry at a time and
does not merge, so you join them together yourself.

## What to copy, and what not to

Worth copying: passwords arrive on standard input, the comparison is timing
safe, an unknown account costs the same time as a wrong password, and the three
exit codes mean what the contract says they mean.

Not worth copying: the whole user file is read on every request, and there is no
locking, so two writers can lose each other's changes.
