CC ?= cc
CFLAGS ?= -O2 -Wall -Wextra
LDLIBS = -lpam

pam_check: pam_check.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

# Give the helper the privilege it needs to read shadow passwords, and allow
# only the identity provider's own group to run it.
install: pam_check
	install -o root -g byob-oidc -m 4750 pam_check /usr/local/libexec/byob-pam-check

clean:
	rm -f pam_check

.PHONY: install clean
