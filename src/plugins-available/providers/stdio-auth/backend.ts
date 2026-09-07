import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

/** Milliseconds between SIGTERM and SIGKILL for a command that overran. */
const KILL_GRACE_MS = 2_000;

export type BackendResult =
    | { status: 'ok'; accountId: string; claims: Record<string, any> }
    | { status: 'rejected' }
    | { status: 'fault'; reason: string };

export interface BackendOptions {
    command: string;
    timeoutMs: number;
    maxOutputBytes: number;
}

/**
 * Run a backend command and interpret its reply.
 *
 * The request goes to the command's stdin as one line of JSON, and stdin is
 * closed so a command reading to end of file terminates. The exit code carries
 * the verdict: 0 success, 1 rejected, anything else a failure of the backend
 * itself. Success puts one JSON object on stdout.
 *
 * The password travels on stdin only. It must never reach argv or the child's
 * environment, where other users of the machine can read it.
 */
export async function runBackend(
    request: Record<string, any>,
    options: BackendOptions,
): Promise<BackendResult> {
    return new Promise<BackendResult>((resolve) => {
        let settled = false;
        let termTimer: ReturnType<typeof setTimeout> | undefined;
        let killTimer: ReturnType<typeof setTimeout> | undefined;

        const finish = (result: BackendResult) => {
            if (settled) return;
            settled = true;
            if (termTimer) clearTimeout(termTimer);
            if (killTimer) clearTimeout(killTimer);
            resolve(result);
        };

        let child: ChildProcessWithoutNullStreams;
        try {
            child = spawn(options.command, [], {
                env: { PATH: process.env.PATH ?? '' },
                stdio: ['pipe', 'pipe', 'pipe'],
            });
        } catch (err: any) {
            return resolve({ status: 'fault', reason: `could not run ${options.command}: ${err.message}` });
        }

        let stdout = '';
        let stderr = '';
        let overran = false;

        termTimer = setTimeout(() => {
            child.kill('SIGTERM');
            killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
            finish({ status: 'fault', reason: `${options.command} exceeded ${options.timeoutMs}ms` });
        }, options.timeoutMs);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            if (stdout.length + chunk.length > options.maxOutputBytes) {
                overran = true;
                child.kill('SIGKILL');
                return;
            }
            stdout += chunk;
        });

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
            if (stderr.length < options.maxOutputBytes) stderr += chunk;
        });

        child.on('error', (err: any) => {
            finish({ status: 'fault', reason: `could not run ${options.command}: ${err.message}` });
        });

        child.on('close', (code: number | null) => {
            if (stderr.trim()) {
                console.error(`[stdio-auth] ${options.command}: ${stderr.trim()}`);
            }

            if (overran) {
                return finish({ status: 'fault', reason: `${options.command} wrote more than ${options.maxOutputBytes} bytes` });
            }
            if (code === 0) return finish(parseReply(stdout, options.command));
            if (code === 1) return finish({ status: 'rejected' });
            return finish({ status: 'fault', reason: `${options.command} exited with code ${code}` });
        });

        child.stdin.on('error', () => {
            // A command that exits without reading stdin closes the pipe first.
            // The exit code still decides the outcome, so there is nothing to do.
        });
        child.stdin.end(JSON.stringify(request) + '\n');
    });
}

function parseReply(stdout: string, command: string): BackendResult {
    let parsed: any;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        return { status: 'fault', reason: `${command} succeeded but its output is not JSON` };
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { status: 'fault', reason: `${command} succeeded but its output is not a JSON object` };
    }

    const { account_id: accountId, ...claims } = parsed;

    if (typeof accountId !== 'string' || accountId === '') {
        return { status: 'fault', reason: `${command} succeeded but returned no account_id` };
    }

    // This becomes the sub claim in every token. A NUL ends a C string, so two
    // ids that differ after one could be read as the same person downstream.
    if (accountId.includes('\u0000')) {
        return { status: 'fault', reason: `${command} returned an account_id containing a NUL` };
    }

    // Claims pass through as the backend wrote them, except that sub always
    // restates account_id. The two disagreeing would give the account two
    // identities, one in the token and one everywhere else.
    return { status: 'ok', accountId, claims: { ...claims, sub: accountId } };
}
