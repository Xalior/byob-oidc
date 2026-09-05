# PAM backend

Authenticates people against the accounts of the Linux machine the identity
provider runs on, through PAM. If someone can log in to that machine, they can
log in here.

This backend works on Linux only. It is an example, and you should read it and
adapt it before putting it in front of real users.

## How it is built

The work is split in two, because only one small part of it needs privilege.

`pam_check` is a short C program. It reads a username and a password from
standard input, asks PAM whether they are valid, and says yes or no through its
exit code. It takes no arguments and reads no environment.

`authenticate.mjs` and `lookup.mjs` speak the `stdio-auth` contract. They handle
the JSON, run `pam_check` when a password needs checking, and read account
details out of `/etc/passwd`. They need no privilege at all.

## Why the split matters

`pam_unix` compares passwords against `/etc/shadow`, which ordinary users cannot
read. It reaches the file through the helper `/usr/sbin/unix_chkpwd`, and that
helper refuses to check anybody's password but the caller's own.

So a check of another person's password only succeeds when the caller is root,
or belongs to the `shadow` group. Running the whole identity provider as root to
buy that is a poor trade. Giving the privilege to one program that does nothing
else is a much smaller thing to trust.

## Build and install

```sh
make
```

Tell PAM what this service should do. Create `/etc/pam.d/byob-oidc`. The
simplest version that checks a local password and honours account expiry:

```
auth     required  pam_unix.so
account  required  pam_unix.so
```

Most distributions ship shared fragments you should prefer instead, so that this
service follows the same rules as the rest of the machine:

```
@include common-auth
@include common-account
```

Do not point this at the `login` or `sshd` service files. Those describe the
rules for logging in at a console or over SSH, which are not the rules you want
for a web login.

Then install the helper so that only the identity provider's group can run it,
and only it carries the privilege:

```sh
sudo make install
```

That installs `pam_check` as root-owned and setuid, readable and runnable by the
group `byob-oidc`. Change the group in the `Makefile` to whichever group your
service account belongs to.

## Point the provider at it

```
PROVIDER=stdio-auth
STDIO_AUTH_AUTHENTICATE_COMMAND=/path/to/examples/backends/pam/authenticate.mjs
STDIO_AUTH_LOOKUP_COMMAND=/path/to/examples/backends/pam/lookup.mjs
PAM_CHECK=/usr/local/libexec/byob-pam-check
```

`PAM_CHECK` is this example's own setting. Leave it out and the scripts look for
`pam_check` next to themselves, which is what you want while testing and not
what you want in production.

## Claims

`/etc/passwd` gives you a login name and a comment field. This backend returns
`preferred_username` from the login name, and `name` from the first part of the
comment field when there is one.

There is no email address in `/etc/passwd`, so no `email` claim is returned. If
your machines put an address in the comment field, or you keep one elsewhere,
add it in `claimsFor` in `passwd.mjs`.

## Things to decide before you rely on this

The account id is the login name, so it becomes the `sub` claim. If you ever
delete an account and later give the same name to a different person, every
client application that remembered the old `sub` will treat the new person as
the old one. Returning the numeric user id avoids the name being reused, but
user ids get reused too. If neither is safe on your machines, keep a mapping of
your own.

Repeated wrong passwords are PAM's business, not this backend's. Add
`pam_faillock` to the service file if you want lockout, and remember that the
count is shared with every other service that uses the same module.

This backend does not tell PAM where the login came from, so `PAM_RHOST` is
unset and your auth log will not show the user's address. The provider does not
pass the client address to backends.

Anyone who can log in to the machine can log in to the identity provider,
including system accounts that were never meant for people. Restrict that in the
service file, with `pam_succeed_if` on the user id or on group membership.
