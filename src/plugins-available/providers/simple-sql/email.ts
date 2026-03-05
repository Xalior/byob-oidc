import { transporter } from '../../../lib/email.ts';
import { PluginConfig } from '../../../plugins/types.ts';

let _config: PluginConfig;

export function initializeEmail(config: PluginConfig): void {
    _config = config;
}

export const sendConfirmationEmail = async (email: string, confirmation_code: string): Promise<void> => {
    const confirmationUrl = `${_config.provider_url}confirm?${confirmation_code}`;

    const info = await transporter.sendMail({
        from: `"${_config.site_name}" <noreply@${_config.hostname}>`,
        to: email,
        subject: `✔ ${_config.site_name} Account Confirmation`,
        text: `${_config.site_name} Account Confirmation Email

    Please visit ${confirmationUrl} to confirm your account`,
        html: `<b>${_config.site_name} Account Confirmation Email</b><br>
  <br>
  Please visit <a href="${confirmationUrl}">
    ${confirmationUrl}</a> to confirm your account`,
    });

    console.log(`Confirmation email sent to ${email} with message ID: ${info.messageId}`);
};

export const sendPasswordResetEmail = async (email: string, confirmation_code: string): Promise<void> => {
    const resetPasswordUrl = `${_config.provider_url}reset_password?${confirmation_code}`;

    const info = await transporter.sendMail({
        from: `"${_config.site_name}" <noreply@${_config.hostname}>`,
        to: email,
        subject: `✔ ${_config.site_name} Password Reset`,
        text: `${_config.site_name} Password Reset Email

    Please visit ${resetPasswordUrl} to reset your password.

    If you did not request a password reset, please ignore this email or contact support if you have concerns.`,
        html: `<b>${_config.site_name} Password Reset Email</b><br>
  <br>
  Please visit <a href="${resetPasswordUrl}">
    ${resetPasswordUrl}</a> to reset your password.
  <br><br>
  If you did not request a password reset, please ignore this email or contact support if you have concerns.`,
    });

    console.log(`Password reset email sent to ${email} with message ID: ${info.messageId}`);
};
