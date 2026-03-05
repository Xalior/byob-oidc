import { Plugin, PluginMeta } from '../types.ts';
import session from 'express-session';

export interface SessionPlugin extends Plugin {
    meta: PluginMeta & { type: 'session' };

    /**
     * Return an oidc-provider adapter constructor.
     * Matches oidc-provider's adapter interface: constructor(name) => { upsert, find, ... }
     */
    getAdapterConstructor(): AdapterConstructor;

    /**
     * Return an express-session store.
     * If not implemented, core uses the default MemoryStore.
     */
    getSessionStore?(): session.Store;

    /** Store a value with optional TTL (seconds) */
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;

    /** Retrieve a value by key */
    get(key: string): Promise<any | undefined>;

    /** Delete a value by key */
    del(key: string): Promise<void>;

    /** Whether the backing store is connected and healthy */
    isConnected(): boolean;

    /**
     * Register a function the adapter uses to look up OIDC clients by client_id.
     * Called once at boot by server.ts after the Client model is available.
     */
    setClientFinder(finder: (id: string) => Promise<any>): void;
}

/** Matches oidc-provider's expected adapter factory */
export type AdapterConstructor = new (name: string) => OIDCAdapter;

export interface OIDCAdapter {
    upsert(id: string, payload: any, expiresIn?: number): Promise<void>;
    find(id: string): Promise<any | undefined>;
    findByUserCode?(userCode: string): Promise<any | undefined>;
    findByUid?(uid: string): Promise<any | undefined>;
    consume(id: string): Promise<void>;
    destroy(id: string): Promise<void>;
    revokeByGrantId(grantId: string): Promise<void>;
}
