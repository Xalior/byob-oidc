import type { OIDCAdapter } from '../../../plugins/session/interface.ts';

type Store = Map<string, { value: any; expiresAt: number | null }>;

/** Allow external code to register a Client finder (same pattern as Redis adapter) */
let _clientFinder: ((id: string) => Promise<any>) | null = null;

export function setClientFinder(finder: (id: string) => Promise<any>): void {
    _clientFinder = finder;
}

const grantable = new Set([
    'AccessToken',
    'AuthorizationCode',
    'RefreshToken',
    'DeviceCode',
    'BackchannelAuthenticationRequest',
]);

export function createAdapter(store: Store) {
    // Secondary index: grantId -> list of keys
    const grantKeys = new Map<string, string[]>();
    // Secondary index: userCode -> id
    const userCodes = new Map<string, string>();
    // Secondary index: uid -> id
    const sessionUids = new Map<string, string>();

    function get(key: string): any | undefined {
        const entry = store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
            store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    function set(key: string, value: any, expiresIn?: number): void {
        store.set(key, {
            value,
            expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
        });
    }

    class LRUAdapter implements OIDCAdapter {
        model: string;
        name: string;

        constructor(name: string) {
            this.model = name;
            this.name = name;
        }

        key(id: string): string {
            return `${this.model}:${id}`;
        }

        async upsert(id: string, payload: any, expiresIn?: number): Promise<void> {
            const key = this.key(id);
            set(key, payload, expiresIn);

            if (grantable.has(this.name) && payload.grantId) {
                const list = grantKeys.get(payload.grantId) || [];
                list.push(key);
                grantKeys.set(payload.grantId, list);
            }

            if (payload.userCode) {
                userCodes.set(payload.userCode, id);
            }

            if (payload.uid) {
                sessionUids.set(payload.uid, id);
            }
        }

        async find(id: string): Promise<any | undefined> {
            if (this.model === 'Client') {
                if (!_clientFinder) {
                    throw new Error('Client finder not registered. Call setClientFinder() during boot.');
                }
                return _clientFinder(id);
            }

            return get(this.key(id));
        }

        async findByUserCode(userCode: string): Promise<any | undefined> {
            const id = userCodes.get(userCode);
            if (!id) return undefined;
            return this.find(id);
        }

        async findByUid(uid: string): Promise<any | undefined> {
            const id = sessionUids.get(uid);
            if (!id) return undefined;
            return this.find(id);
        }

        async consume(id: string): Promise<void> {
            const payload = get(this.key(id));
            if (payload) {
                payload.consumed = Math.floor(Date.now() / 1000);
            }
        }

        async destroy(id: string): Promise<void> {
            store.delete(this.key(id));
        }

        async revokeByGrantId(grantId: string): Promise<void> {
            const keys = grantKeys.get(grantId) || [];
            for (const key of keys) {
                store.delete(key);
            }
            grantKeys.delete(grantId);
        }
    }

    return LRUAdapter;
}
