import { db } from '../db/index.ts';
import { clients } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

interface ClientProfile {
    client_id: string;
    client_secret: string;
    grant_requirements: string;
    grant_types: string;
    redirect_uris: string;
    post_logout_redirect_uris: string;
    created_at: Date;
    [key: string]: any;
}

export class Client {
    id: string;
    client_id: string;
    client_secret: string;
    grant_requirements: string[];
    grant_types: string[];
    redirect_uris: string[];
    post_logout_redirect_uris: string[];
    created_at: Date;

    constructor(client_profile: ClientProfile) {
        this.id = client_profile.client_id;
        this.client_id = client_profile.client_id;
        this.client_secret = client_profile.client_secret;
        this.grant_requirements = JSON.parse(client_profile.grant_requirements);
        this.grant_types = JSON.parse(client_profile.grant_types);
        this.redirect_uris = JSON.parse(client_profile.redirect_uris);
        this.post_logout_redirect_uris = JSON.parse(client_profile.post_logout_redirect_uris);
        this.created_at = client_profile.created_at;
    }

    static async findByClientId(client_id: string): Promise<Client | null> {
        const client = await db.select()
            .from(clients)
            .where(eq(clients.client_id, client_id))
            .limit(1);

        // OIDC Client site not found
        if(!client.length) return null;

        return new Client(client[0]);
    }
}