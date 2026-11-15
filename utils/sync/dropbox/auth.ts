import { browser } from 'wxt/browser';
import { base64Url } from '../../encoding';
import { hasExtensionStorage, type KeyValueStore } from '../../storage/store';
import { createConfigStore, requestHostPermission, type FetchFn } from '../shared';

/** Public identifier for the Tabloid Dropbox app. PKCE means there is no app secret to protect or ship. */
export const DROPBOX_APP_KEY = 'ubu9lzqx2c937ei';

export const DROPBOX_ORIGINS = ['https://api.dropboxapi.com/*', 'https://content.dropboxapi.com/*'];

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const AUTH_KEY = 'dropbox:auth';
/** Refresh slightly early so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

export interface DropboxAuth {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  refreshToken: string;
}

export function createCodeVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildAuthUrl(params: { redirectUri: string; challenge: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: params.redirectUri,
    state: params.state,
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

class TokenRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

async function requestTokens(body: Record<string, string>, fetchFn: FetchFn): Promise<TokenResponse> {
  const response = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DROPBOX_APP_KEY, ...body }),
  });
  if (!response.ok) {
    let code: string | undefined;
    let detail = '';
    try {
      const error = (await response.json()) as { error?: string; error_description?: string };
      code = error.error;
      detail = [error.error, error.error_description].filter(Boolean).join(': ');
    } catch {
      // Not JSON; the status alone will have to do.
    }
    throw new TokenRequestError(`Dropbox sign-in failed (${response.status}${detail ? `, ${detail}` : ''}).`, code);
  }
  return (await response.json()) as TokenResponse;
}

export function createAuthStore(store?: KeyValueStore) {
  return createConfigStore<DropboxAuth>(AUTH_KEY, store);
}

export type AuthStore = ReturnType<typeof createAuthStore>;

/** The redirect URI to register in the Dropbox app console. */
export function getRedirectUri(): string {
  return browser.identity.getRedirectURL();
}

/**
 * Runs the OAuth PKCE sign-in. Must be called from a user gesture: it asks for access to the
 * Dropbox API hosts first (optional permission), then opens Dropbox's consent page.
 */
export async function connectDropbox(authStore: AuthStore = createAuthStore(), fetchFn: FetchFn = fetch): Promise<void> {
  if (!browser.identity?.launchWebAuthFlow) {
    throw new Error(
      hasExtensionStorage()
        ? 'The extension is missing the "identity" permission. Reload it from the browser\'s extensions page (Firefox: remove and re-add it) so the updated manifest takes effect.'
        : 'Dropbox sign-in only works inside the installed extension.',
    );
  }
  await requestHostPermission(DROPBOX_ORIGINS, 'Dropbox');

  const verifier = createCodeVerifier();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = getRedirectUri();
  const authUrl = buildAuthUrl({ redirectUri, challenge: await codeChallenge(verifier), state });

  const redirected = await browser.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirected) throw new Error('Dropbox sign-in was cancelled.');
  const result = new URL(redirected);
  if (result.searchParams.get('state') !== state) throw new Error('Dropbox sign-in returned an unexpected state.');
  const code = result.searchParams.get('code');
  if (!code) throw new Error(result.searchParams.get('error_description') ?? 'Dropbox did not return a sign-in code.');

  const tokens = await requestTokens(
    { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri },
    fetchFn,
  );
  if (!tokens.refresh_token) throw new Error('Dropbox did not grant offline access.');
  await authStore.set({
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
  });
}

/** Returns a valid access token, refreshing it when needed. `force` skips the expiry check. */
export async function getAccessToken(
  authStore: AuthStore,
  fetchFn: FetchFn = fetch,
  options: { force?: boolean; now?: () => number } = {},
): Promise<string> {
  const auth = await authStore.get();
  if (!auth) throw new Error('Not connected to Dropbox. Reconnect it in Tabloid settings.');
  const now = options.now?.() ?? Date.now();
  if (!options.force && auth.expiresAt - EXPIRY_MARGIN_MS > now) return auth.accessToken;

  let tokens: TokenResponse;
  try {
    tokens = await requestTokens({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }, fetchFn);
  } catch (error) {
    if (error instanceof TokenRequestError && error.code === 'invalid_grant') {
      // The refresh token was revoked or replaced; retrying can't help.
      await authStore.clear();
      throw new Error('Dropbox access was revoked or has expired. Reconnect Dropbox in Tabloid settings.');
    }
    throw error;
  }
  const next: DropboxAuth = {
    accessToken: tokens.access_token,
    expiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token ?? auth.refreshToken,
  };
  await authStore.set(next);
  return next.accessToken;
}
