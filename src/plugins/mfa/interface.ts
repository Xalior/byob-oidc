import { Request } from 'express';
import { Plugin, PluginMeta } from '../types.ts';
import { OIDCAccount } from '../provider/interface.ts';

export interface MFAPlugin extends Plugin {
    meta: PluginMeta & { type: 'mfa' };

    /**
     * Called after provider.authenticate() succeeds.
     * Returns true if this plugin requires a challenge step.
     * The "none" plugin always returns false.
     */
    requiresChallenge(account: OIDCAccount): Promise<boolean>;

    /**
     * Generate and deliver a challenge (e.g. email a pin code).
     * Returns an opaque challenge ID that core stores in the interaction.
     */
    issueChallenge(account: OIDCAccount, req: Request): Promise<string>;

    /**
     * Verify the user's response to the challenge.
     * req.body contains the user's input (e.g. { mfa: "123456" }).
     * Returns true if verified, false if not (plugin sets flash errors on req).
     */
    verifyChallenge(challengeId: string, req: Request): Promise<boolean>;
}
