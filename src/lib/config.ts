import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import dotenv from "dotenv";

const DEFAULT_THEME = 'nbn24';

// Load environment variables from .env file
dotenv.config();

export const env = createEnv({
    server: {
        // Core
        HOSTNAME: z.string().nonempty("must not be empty"),
        SITE_NAME: z.string().default('OIDC Provider'),
        MODE: z.string().default('dev'),
        PORT: z.coerce.number().default(5000),
        SESSION_SECRET: z.string().default('session-secret'),
        CLIENT_ID: z.string().default('SELF'),
        CLIENT_SECRET: z.string().default('SELF_SECRET'),

        // Plugin selectors
        THEME: z.string().default(DEFAULT_THEME),
        PROVIDER: z.string().default('simple-sql'),
        SESSION: z.string().default('redis'),
        MFA: z.string().default('otp'),
        EXTENSIONS: z.string().default(''),

        // External plugin directory (prebuilt JS bundles)
        PLUGIN_DIR: z.string().default('/data/plugins'),

        // Debug
        DEBUG_ADAPTER: z.string().default("false")
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
        DEBUG_ACCOUNT: z.string().default("false")
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),

        // SMTP (core service — used by MFA and providers)
        SMTP_HOST: z.string().nonempty("SMTP relay must not be empty"),
        SMTP_PORT: z.coerce.number().default(25),
        SMTP_SECURE: z.string().default("false")
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
        SMTP_USER: z.string().optional(),
        SMTP_PASS: z.string().optional(),

        // Legacy — still validated but read by plugins directly from process.env
        DATABASE_URL: z.string().nonempty("MySQL database URL must not be empty"),
        CACHE_URL: z.string().nonempty("REDIS cache must not be empty"),
        PASSWORD_SALT: z.coerce.number().default(11),
        CLIENT_FEATURES_REGISTRATION: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
        PATREON_CLIENT_ID: z.string().optional(),
        PATREON_CLIENT_SECRET: z.string().optional(),
    },

    runtimeEnv: process.env,
    onValidationError: (error) => {
        console.error("Invalid environment variables:", error);
        throw new Error("Invalid environment variables");
    },
});

/** App-level config — no oidc-provider types */
export interface AppConfig {
    provider_url: string;
    hostname: string;
    site_name: string;
    mode: string;
    port: number;
    session_secret: string;
    client_id: string;
    client_secret: string;
    // Plugin selectors
    theme: string;
    provider: string;
    session: string;
    mfa: string;
    extensions: string;
    plugin_dir: string;
    // Debug
    debug: {
        adapter: boolean;
        account: boolean;
    };
    // SMTP
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string | undefined;
            pass: string | undefined;
        };
    };
    // Legacy (still available for backwards compat)
    database_url: string;
    cache_url: string;
    password: { salt: number };
    client_features: { registration: boolean | undefined };
    patreon: {
        client_id: string | undefined;
        client_secret: string | undefined;
    };
}

export const config: AppConfig = {
    provider_url: `https://${env.HOSTNAME}/`,
    hostname: env.HOSTNAME,
    site_name: env.SITE_NAME,
    mode: env.MODE,
    port: env.PORT,
    session_secret: env.SESSION_SECRET,
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,

    // Plugin selectors
    theme: env.THEME,
    provider: env.PROVIDER,
    session: env.SESSION,
    mfa: env.MFA,
    extensions: env.EXTENSIONS,
    plugin_dir: env.PLUGIN_DIR,

    debug: {
        adapter: env.DEBUG_ADAPTER,
        account: env.DEBUG_ACCOUNT,
    },

    smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    },

    // Legacy
    database_url: env.DATABASE_URL,
    cache_url: env.CACHE_URL,
    password: { salt: env.PASSWORD_SALT },
    client_features: { registration: env.CLIENT_FEATURES_REGISTRATION },
    patreon: {
        client_id: env.PATREON_CLIENT_ID,
        client_secret: env.PATREON_CLIENT_SECRET,
    },
};
