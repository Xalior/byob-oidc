import {config} from './config.ts'
import { createTransport, Transporter } from "nodemailer";
import { Request } from 'express';

export const transporter: Transporter = createTransport(config.smtp);

export const sendConfirmationEmail = async (email: string, confirmation_code: string): Promise<void> => {
  // Properly format the confirmation URL with a named parameter
  const confirmationUrl = `${config.provider_url}confirm?${confirmation_code}`;

  // send mail with defined transport object
  const info = await transporter.sendMail({
    from: '"NBN:ID" <noreply@nextbestnetwork.com>', // sender address
    to: email, // list of receivers
    subject: "✔ NBN:ID Account Confirmation", // Subject line
    text: `NBN:ID Account Confirmation Email

    Please visit ${confirmationUrl} to confirm your account`, // plain text body

    html: `<b>NBN:ID Account Confirmation Email</b><br>
  <br>
  Please visit <a href="${confirmationUrl}">
    ${confirmationUrl}</a> to confirm your account`,
  });

  // Log only necessary information, not the entire info object
  console.log(`Confirmation email sent to ${email} with message ID: ${info.messageId}`);
}

export const sendLoginPinEmail = async (req: Request | string, email: string, pin_code: string, request_time: string): Promise<void> => {
  // Format the reset password URL
  const resetPasswordUrl = `${config.provider_url}lost_password`;

  // Format client information safely
  const clientInfo = typeof req === 'object' ? 
    `IP: ${req.ip || 'unknown'}, User-Agent: ${req.headers?.['user-agent'] || 'unknown'}` : 
    String(req).substring(0, 100); // Limit length for safety

  // send mail with defined transport object
  const info = await transporter.sendMail({
    from: '"NBN:ID" <noreply@nextbestnetwork.com>', // sender address
    to: email, // list of receivers
    subject: "🔒 NBN:ID Login PIN", // Subject line
    text: `NBN:ID Login PIN

    You attempted to log into NBN:ID - and that required this time sensitive passcode.

    Your one use passcode is: ${pin_code}

    If you did not log in, then someone could have your password!
    You should log in, immediately, and change your password to something new - and unique.

    Please visit ${resetPasswordUrl} to reset your password.

    This login attempt came from ${clientInfo} at ${request_time}.`, // plain text body
    html: `<b>NBN:ID Login PIN</b><br>
  <br>
    You attempted to log into NBN:ID - and that required this time sensitive passcode.
  <br>
  <h2>Your one use passcode is: ${pin_code}</h2>
  <br>
    If you did not log in, then someone could have your password!
    You should log in, immediately, and change your password to something new - and unique.
  <br>
  Please visit <a href="${resetPasswordUrl}">
    ${resetPasswordUrl}</a> to reset your password.
  <br><br>
    This login attempt came from ${clientInfo} at ${request_time}.`,
  });

  // Log only necessary information, not the entire info object
  console.log(`Login PIN email sent to ${email} with message ID: ${info.messageId}`);
}

export const sendPasswordResetEmail = async (email: string, confirmation_code: string): Promise<void> => {
  // Properly format the reset password URL with a named parameter
  const resetPasswordUrl = `${config.provider_url}reset_password?${confirmation_code}`;

  // send mail with defined transport object
  const info = await transporter.sendMail({
    from: '"NBN:ID" <noreply@nextbestnetwork.com>', // sender address
    to: email, // list of receivers
    subject: "✔ NBN:ID Password Reset", // Subject line
    text: `NBN:ID Password Reset Email

    Please visit ${resetPasswordUrl} to reset your password.

    If you did not request a password reset, please ignore this email or contact support if you have concerns.`, // plain text body

    html: `<b>NBN:ID Password Reset Email</b><br>
  <br>
  Please visit <a href="${resetPasswordUrl}">
    ${resetPasswordUrl}</a> to reset your password.
  <br><br>
  If you did not request a password reset, please ignore this email or contact support if you have concerns.`,
  });

  // Log only necessary information, not the entire info object
  console.log(`Password reset email sent to ${email} with message ID: ${info.messageId}`);
}