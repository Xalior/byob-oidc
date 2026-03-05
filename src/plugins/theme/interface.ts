import { Plugin, PluginMeta } from '../types.ts';

export interface ThemePlugin extends Plugin {
    meta: PluginMeta & { type: 'theme' };
    site_name: string;
    page(html: string): string;
    logout(form: string, hostname: string): string;
    loggedout(display: string): string;
    error(html: string): string;
    /** Theme provides its own Mustache layouts directory, or null for default views */
    layoutsDir(): string | null;
    /** Theme provides its own static assets directory */
    assetsDir(): string;
}
