import { MFAPlugin } from '../../../plugins/mfa/interface.ts';
import { OIDCAccount } from '../../../plugins/provider/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { transporter } from '../../../lib/email.ts';
import { getSession } from '../../../plugins/registry.ts';
import { Request } from 'express';

let _config: PluginConfig;

function mfaCacheKey(challengeId: string): string {
    return `${_config.hostname}:mfaCode:${challengeId}`;
}

const plugin: MFAPlugin = {
    meta: { name: 'otp', version: '1.0.0', type: 'mfa', description: 'Email one-time password MFA' },

    async initialize(config: PluginConfig) {
        _config = config;
    },

    async requiresChallenge(_account: OIDCAccount): Promise<boolean> {
        return true;
    },

    async issueChallenge(account: OIDCAccount, req: Request): Promise<string> {
        const session = getSession();
        const pin = ('000000' + Math.floor(Math.random() * 1000000)).slice(-6);
        const requestTime = new Date().toJSON();
        const challengeId = req.params.uid;

        await session.set(mfaCacheKey(challengeId), {
            pin,
            accountId: account.accountId,
            requestTime,
        }, 15 * 60); // 15 minute TTL

        // Get email from claims
        const claims = await account.claims('id_token', 'email');
        const email = claims.email;

        if (!email) {
            throw new Error('Cannot issue OTP challenge: account has no email claim');
        }

        // Format client info for email
        const clientInfo = `IP: ${req.ip || 'unknown'}, User-Agent: ${req.headers?.['user-agent'] || 'unknown'}`;

        const resetPasswordUrl = `${_config.provider_url}lost_password`;

        await transporter.sendMail({
            from: `"${_config.site_name}" <noreply@${_config.hostname}>`,
            to: email,
            subject: `🔒 ${_config.site_name} Login PIN`,
            text: `${_config.site_name} Login PIN

You attempted to log into ${_config.site_name} - and that required this time sensitive passcode.

Your one use passcode is: ${pin}

If you did not log in, then someone could have your password!
You should log in, immediately, and change your password to something new - and unique.

Please visit ${resetPasswordUrl} to reset your password.

This login attempt came from ${clientInfo} at ${requestTime}.`,
            html: `<b>${_config.site_name} Login PIN</b><br>
<br>
You attempted to log into ${_config.site_name} - and that required this time sensitive passcode.
<br>
<h2>Your one use passcode is: ${pin}</h2>
<br>
If you did not log in, then someone could have your password!
You should log in, immediately, and change your password to something new - and unique.
<br>
Please visit <a href="${resetPasswordUrl}">${resetPasswordUrl}</a> to reset your password.
<br><br>
This login attempt came from ${clientInfo} at ${requestTime}.`,
        });

        console.log(`Login PIN email sent to ${email}`);
        return challengeId;
    },

    async verifyChallenge(challengeId: string, req: Request): Promise<boolean> {
        const session = getSession();
        const mfaData = await session.get(mfaCacheKey(challengeId));

        if (!mfaData) {
            req.flash('error', 'MFA code expired. Please log in again.');
            return false;
        }

        const submittedPin = req.body.mfa?.trim();

        if (!submittedPin || submittedPin.length !== 6 || submittedPin !== mfaData.pin) {
            req.flash('error', 'Invalid Passcode!');
            return false;
        }

        // Cleanup used code
        await session.del(mfaCacheKey(challengeId));
        return true;
    },
};

export default plugin;
