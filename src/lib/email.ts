import { config } from './config.ts';
import { createTransport, Transporter } from "nodemailer";

export const transporter: Transporter = createTransport(config.smtp);
