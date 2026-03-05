import home from './home.ts';
import docs from './docs.ts';
import { Application } from 'express';
import { getProvider, getExtensions } from '../plugins/registry.ts';

export default (app: Application): void => {
    // Core routes
    home(app);
    docs(app);

    // Provider-specific routes (registration, profile, etc. — if applicable)
    const provider = getProvider();
    if (provider.getRoutes) {
        provider.getRoutes(app);
    }

    // Extension routes
    for (const ext of getExtensions()) {
        if (ext.getMiddleware) ext.getMiddleware(app);
        if (ext.getRoutes) ext.getRoutes(app);
    }
};
