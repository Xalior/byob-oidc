/*
 * pam_check — ask Linux-PAM whether a username and password are valid.
 *
 * Reads a username and a password from standard input, each terminated by a
 * zero byte. A zero byte cannot appear in either value, so any password is
 * carried safely, including one containing newlines.
 *
 * Exit codes match the stdio-auth contract: 0 accepted, 1 rejected, 2 the
 * check could not be made.
 *
 * This program exists so that the privilege needed to read shadow passwords
 * lives in one small place, rather than in the identity provider itself. It
 * takes no command line arguments and reads no environment, so there is
 * nothing for a caller to steer.
 */

#include <security/pam_appl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define PAM_SERVICE_NAME "byob-oidc"
#define MAX_FIELD 4096

#define EXIT_ACCEPTED 0
#define EXIT_REJECTED 1
#define EXIT_FAULT 2

struct conversation_data {
    const char *password;
};

/*
 * Answer every prompt that hides its input with the password we were given.
 * Prompts that echo, such as a challenge, cannot be answered here.
 */
static int converse(int num_msg, const struct pam_message **msg,
                    struct pam_response **resp, void *appdata_ptr)
{
    struct conversation_data *data = (struct conversation_data *)appdata_ptr;
    struct pam_response *replies;
    int i;

    if (num_msg <= 0)
        return PAM_CONV_ERR;

    replies = calloc((size_t)num_msg, sizeof(struct pam_response));
    if (replies == NULL)
        return PAM_BUF_ERR;

    for (i = 0; i < num_msg; i++) {
        switch (msg[i]->msg_style) {
        case PAM_PROMPT_ECHO_OFF:
            replies[i].resp = strdup(data->password);
            if (replies[i].resp == NULL) {
                free(replies);
                return PAM_BUF_ERR;
            }
            break;
        case PAM_PROMPT_ECHO_ON:
            free(replies);
            return PAM_CONV_ERR;
        case PAM_ERROR_MSG:
        case PAM_TEXT_INFO:
            fprintf(stderr, "pam: %s\n", msg[i]->msg);
            break;
        default:
            free(replies);
            return PAM_CONV_ERR;
        }
    }

    *resp = replies;
    return PAM_SUCCESS;
}

/*
 * Overwrite a buffer so the password does not linger in memory. The volatile
 * pointer stops a compiler removing a write it can prove nobody reads.
 */
static void wipe(char *buffer, size_t size)
{
    volatile char *p = buffer;
    while (size--)
        *p++ = '\0';
}

/* Read up to a zero byte from standard input. */
static int read_field(char *buffer, size_t size)
{
    size_t used = 0;
    int c;

    while ((c = getchar()) != EOF) {
        if (c == '\0') {
            buffer[used] = '\0';
            return 0;
        }
        if (used + 1 >= size)
            return -1;
        buffer[used++] = (char)c;
    }

    return -1;
}

int main(void)
{
    char username[MAX_FIELD];
    char password[MAX_FIELD];
    struct conversation_data data;
    struct pam_conv conv;
    pam_handle_t *pamh = NULL;
    int status;
    int result = EXIT_FAULT;

    if (read_field(username, sizeof(username)) != 0 || username[0] == '\0') {
        fprintf(stderr, "no username on standard input\n");
        return EXIT_FAULT;
    }
    if (read_field(password, sizeof(password)) != 0) {
        fprintf(stderr, "no password on standard input\n");
        return EXIT_FAULT;
    }

    data.password = password;
    conv.conv = converse;
    conv.appdata_ptr = &data;

    status = pam_start(PAM_SERVICE_NAME, username, &conv, &pamh);
    if (status != PAM_SUCCESS) {
        fprintf(stderr, "pam_start: %s\n", pam_strerror(NULL, status));
        goto done;
    }

    status = pam_authenticate(pamh, 0);
    if (status != PAM_SUCCESS) {
        fprintf(stderr, "pam_authenticate: %s\n", pam_strerror(pamh, status));
        result = EXIT_REJECTED;
        goto done;
    }

    /*
     * A correct password is not enough. This second check is what refuses an
     * account that is expired, locked or barred from logging in now.
     */
    status = pam_acct_mgmt(pamh, 0);
    if (status != PAM_SUCCESS) {
        fprintf(stderr, "pam_acct_mgmt: %s\n", pam_strerror(pamh, status));
        result = EXIT_REJECTED;
        goto done;
    }

    result = EXIT_ACCEPTED;

done:
    if (pamh != NULL)
        pam_end(pamh, status);

    wipe(password, sizeof(password));
    return result;
}
