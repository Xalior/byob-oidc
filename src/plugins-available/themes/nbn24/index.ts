import { ThemePlugin } from '../../../plugins/theme/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import theme from './theme.ts';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plugin: ThemePlugin = {
    meta: { name: 'nbn24', version: '1.0.0', type: 'theme' },

    site_name: '',

    async initialize(config: PluginConfig) {
        this.site_name = config.site_name;
        theme.site_name = config.site_name;
    },

    page: (html: string) => theme.page(html),
    logout: (form: string, hostname: string) => theme.logout(form, hostname),
    loggedout: (display: string) => theme.loggedout(display),
    error: (html: string) => theme.error(html),

    layoutsDir() {
        // nbn24 has no layouts dir — falls back to core default views
        return null;
    },
    assetsDir() {
        return path.resolve(__dirname, '../../../../public/themes/nbn24');
    },
};

export default plugin;
