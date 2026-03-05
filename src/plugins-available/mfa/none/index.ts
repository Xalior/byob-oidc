import { MFAPlugin } from '../../../plugins/mfa/interface.ts';
import { OIDCAccount } from '../../../plugins/provider/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { Request } from 'express';

const plugin: MFAPlugin = {
    meta: { name: 'none', version: '1.0.0', type: 'mfa', description: 'No MFA — pass-through' },

    async initialize(_config: PluginConfig) {
        // Nothing to initialize
    },

    async requiresChallenge(_account: OIDCAccount): Promise<boolean> {
        return false;
    },

    async issueChallenge(_account: OIDCAccount, _req: Request): Promise<string> {
        // Should never be called since requiresChallenge returns false
        throw new Error('MFA "none" plugin does not issue challenges');
    },

    async verifyChallenge(_challengeId: string, _req: Request): Promise<boolean> {
        // Should never be called since requiresChallenge returns false
        throw new Error('MFA "none" plugin does not verify challenges');
    },
};

export default plugin;
