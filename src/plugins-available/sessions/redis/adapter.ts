import Redis from 'ioredis';
import type { OIDCAdapter } from '../../../plugins/session/interface.ts';

const grantable = new Set([
    'AccessToken',
    'AuthorizationCode',
    'RefreshToken',
    'DeviceCode',
    'BackchannelAuthenticationRequest',
]);

const storable = new Set([
    // oidc-provider
    'Grant',
    'Session',
    'AccessToken',
    'AuthorizationCode',
    'RefreshToken',
    'ClientCredentials',
    'Client',
    'InitialAccessToken',
    'RegistrationAccessToken',
    'DeviceCode',
    'Interaction',
    'ReplayDetection',
    'PushedAuthorizationRequest',
    'BackchannelAuthenticationRequest',
    // app-level (MFA, confirmation codes, etc.)
    'MFACode',
    'ConfirmationCode',
]);

/** Allow external code to register a Client finder (decouples from DB layer) */
let _clientFinder: ((id: string) => Promise<any>) | null = null;

export function setClientFinder(finder: (id: string) => Promise<any>): void {
    _clientFinder = finder;
}

export function createAdapter(cache: Redis) {
    const hostname = process.env.HOSTNAME || 'localhost';
    const debugEnabled = process.env.DEBUG_ADAPTER === 'true';

    function debug(msg: string, obj?: any) {
        if (debugEnabled) {
            console.debug(msg);
            if (obj) console.debug(obj);
        }
    }

    function grantKeyFor(id: string): string {
        return `${hostname}:grant:${id}`;
    }

    function sessionUidKeyFor(id: string): string {
        return `${hostname}:sessionUid:${id}`;
    }

    function userCodeKeyFor(userCode: string): string {
        return `${hostname}:userCode:${userCode}`;
    }

    class RedisAdapter implements OIDCAdapter {
        model: string;
        name: string;

        constructor(name: string) {
            if (!storable.has(name)) {
                throw new Error(`Storable name "${name}" not found.`);
            }
            this.model = name;
            this.name = name;
        }

        key(id: string): string {
            return `${hostname}:${this.model}:${id}`;
        }

        async upsert(id: string, payload: any, expiresIn?: number): Promise<void> {
            debug(`adapter.upsert: ${this.key(id)}:`, payload);

            const key = this.key(id);
            const multi = cache.multi();

            multi.call('JSON.SET', key, '.', JSON.stringify(payload));

            if (expiresIn) {
                multi.expire(key, expiresIn);
            }

            if (grantable.has(this.name) && payload.grantId) {
                const grantKey = grantKeyFor(payload.grantId);
                multi.rpush(grantKey, key);
                const ttl = await cache.ttl(grantKey);
                if (expiresIn && expiresIn > ttl) {
                    multi.expire(grantKey, expiresIn);
                }
            }

            if (payload.userCode) {
                const userCodeKey = userCodeKeyFor(payload.userCode);
                multi.set(userCodeKey, id);
                if (expiresIn) {
                    multi.expire(userCodeKey, expiresIn);
                }
            }

            if (payload.uid) {
                const uidKey = sessionUidKeyFor(payload.uid);
                multi.set(uidKey, id);
                if (expiresIn) {
                    multi.expire(uidKey, expiresIn);
                }
            }

            await multi.exec();
        }

        async find(id: string): Promise<any | undefined> {
            if (this.model === 'Client') {
                if (!_clientFinder) {
                    throw new Error('Client finder not registered. Call setClientFinder() during boot.');
                }
                const item = await _clientFinder(id);
                debug(`adapter.find(client): ${this.key(id)}:`, item);
                return item;
            }

            const key = this.key(id);
            const item: any = await cache.call('JSON.GET', key);

            debug(`adapter.find: ${this.key(id)}:`, item);

            if (!item) return undefined;
            return JSON.parse(item);
        }

        async findByUserCode(userCode: string): Promise<any | undefined> {
            const id = await cache.get(userCodeKeyFor(userCode));
            debug(`adapter.findByUserCode: ${userCodeKeyFor(userCode)}:`, id);
            if (!id) return undefined;
            return this.find(id);
        }

        async findByUid(uid: string): Promise<any | undefined> {
            const id = await cache.get(sessionUidKeyFor(uid));
            debug(`adapter.findByUid: ${sessionUidKeyFor(uid)}:`, id);
            if (!id) return undefined;
            return this.find(id);
        }

        async consume(id: string): Promise<void> {
            await cache.call('JSON.SET', this.key(id), 'consumed', Math.floor(Date.now() / 1000));
        }

        async destroy(id: string): Promise<void> {
            const key = this.key(id);
            await cache.del(key);
        }

        async revokeByGrantId(grantId: string): Promise<void> {
            const multi = cache.multi();
            const tokens = await cache.lrange(grantKeyFor(grantId), 0, -1);
            tokens.forEach((token: any) => multi.del(token));
            multi.del(grantKeyFor(grantId));
            await multi.exec();
        }
    }

    return RedisAdapter;
}
