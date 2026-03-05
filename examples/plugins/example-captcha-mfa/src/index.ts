/**
 * Example Captcha MFA Plugin for BYOB-OIDC
 *
 * Instead of sending an email code, presents a random question from a
 * configurable question bank. The user must answer correctly to proceed.
 * Useful as a bot deterrent or lightweight verification step.
 *
 * Environment variables:
 *   CAPTCHA_QUESTIONS_FILE  - Path to JSON questions file (optional, uses built-in defaults)
 *
 * Questions file format:
 *   [
 *     { "question": "What is 2 + 3?", "answer": "5" },
 *     { "question": "What color is the sky?", "answer": "blue" }
 *   ]
 *
 * The answer comparison is case-insensitive and whitespace-trimmed.
 * The challenge question is displayed via req.flash('info') and rendered
 * by the MFA form view.
 */

import type { MFAPlugin, OIDCAccount, PluginConfig, PluginServices } from '@byob-oidc/plugin-types';
import type { Request } from 'express';
import { readFileSync, existsSync } from 'node:fs';

interface CaptchaQuestion {
    question: string;
    answer: string;
}

const DEFAULT_QUESTIONS: CaptchaQuestion[] = [
    { question: 'What is 2 + 3?', answer: '5' },
    { question: 'What is 7 - 4?', answer: '3' },
    { question: 'What is 3 x 3?', answer: '9' },
    { question: 'What color is grass?', answer: 'green' },
    { question: 'What color is the sky on a clear day?', answer: 'blue' },
    { question: 'How many legs does a cat have?', answer: '4' },
    { question: 'What is the opposite of hot?', answer: 'cold' },
    { question: 'What is the opposite of up?', answer: 'down' },
    { question: 'How many days are in a week?', answer: '7' },
    { question: 'What comes after Monday?', answer: 'tuesday' },
    { question: 'What is 10 divided by 2?', answer: '5' },
    { question: 'How many months in a year?', answer: '12' },
    { question: 'What planet do we live on?', answer: 'earth' },
    { question: 'What is the first letter of the alphabet?', answer: 'a' },
    { question: 'How many sides does a triangle have?', answer: '3' },
];

let questions: CaptchaQuestion[] = [];
let services: PluginServices | undefined;

function pickRandom(): CaptchaQuestion {
    return questions[Math.floor(Math.random() * questions.length)];
}

function cacheKey(hostname: string, challengeId: string): string {
    return `${hostname}:captcha:${challengeId}`;
}

const plugin: MFAPlugin = {
    meta: {
        name: 'example-captcha',
        version: '1.0.0',
        type: 'mfa',
        description: 'Question-based captcha MFA — random questions to prove you are human',
    },

    async initialize(config: PluginConfig) {
        services = config.services;

        if (!services) {
            throw new Error('example-captcha MFA requires services (getSession) — ensure it is loaded as an external plugin');
        }

        // Load custom questions file or use defaults
        const questionsFile = process.env.CAPTCHA_QUESTIONS_FILE;
        if (questionsFile && existsSync(questionsFile)) {
            try {
                const content = readFileSync(questionsFile, 'utf-8');
                const parsed = JSON.parse(content);
                if (!Array.isArray(parsed) || parsed.length === 0) {
                    throw new Error('Questions file must be a non-empty JSON array');
                }
                for (const q of parsed) {
                    if (!q.question || !q.answer) {
                        throw new Error('Each question must have "question" and "answer" fields');
                    }
                }
                questions = parsed;
                console.log(`example-captcha: loaded ${questions.length} questions from ${questionsFile}`);
            } catch (err: any) {
                throw new Error(`Failed to load captcha questions from "${questionsFile}": ${err.message}`);
            }
        } else {
            questions = DEFAULT_QUESTIONS;
            console.log(`example-captcha: using ${questions.length} built-in questions`);
        }

        console.log('example-captcha MFA initialized');
    },

    async requiresChallenge(_account: OIDCAccount): Promise<boolean> {
        return true;
    },

    async issueChallenge(account: OIDCAccount, req: Request): Promise<string> {
        const session = services!.getSession();
        const challengeId = req.params.uid;
        const selected = pickRandom();

        // Store the expected answer in the session cache with 10 minute TTL
        await session.set(cacheKey(req.hostname, challengeId), {
            answer: selected.answer.toLowerCase().trim(),
            question: selected.question,
            accountId: account.accountId,
        }, 10 * 60);

        // Flash the question so the MFA form can display it
        req.flash('info', `Security question: ${selected.question}`);

        return challengeId;
    },

    async verifyChallenge(challengeId: string, req: Request): Promise<boolean> {
        const session = services!.getSession();
        const key = cacheKey(req.hostname, challengeId);
        const data = await session.get(key);

        if (!data) {
            req.flash('error', 'Challenge expired. Please log in again.');
            return false;
        }

        const submitted = req.body.mfa?.trim().toLowerCase();

        if (!submitted) {
            // Re-flash the question so user can try again
            req.flash('info', `Security question: ${data.question}`);
            req.flash('error', 'Please answer the security question.');
            return false;
        }

        if (submitted !== data.answer) {
            // Re-flash the question for retry
            req.flash('info', `Security question: ${data.question}`);
            req.flash('error', 'Incorrect answer. Please try again.');
            return false;
        }

        // Correct — clean up
        await session.del(key);
        return true;
    },
};

export default plugin;
