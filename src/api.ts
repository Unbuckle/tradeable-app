import * as SecureStore from 'expo-secure-store';
import type { components } from './api-schema';

export type Schemas = components['schemas'];
export type Printing = Schemas['CatalogPrintingDetail'];
export type Sku = Schemas['CatalogSku'];
export type CollectionItem = Schemas['CollectionItem'];
export type Account = Schemas['Account'];

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://nexus-dev-run-web-679212846149.europe-north2.run.app'
).replace(/\/$/, '');

/** An RFC 7807 problem from the API; `code` is the `ERR_*` value. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const ACCESS = 'tradeable.access';
const REFRESH = 'tradeable.refresh';

// shortcut: the API only hands out tokens as cookies (ADR-125), so we read them from Set-Cookie;
// switch to a token body once nexustcg has a native-client login (see docs/api-gaps.md).
function tokenFromCookies(headers: Headers, name: string): string | null {
  const match = new RegExp(`(?:^|[\\s,])${name}=([^;,\\s]+)`).exec(headers.get('set-cookie') ?? '');
  return match ? match[1] : null;
}

async function storeTokens(response: Response): Promise<void> {
  const access = tokenFromCookies(response.headers, 'nx_at');
  const refresh = tokenFromCookies(response.headers, 'nx_rt');
  if (!access || !refresh) throw new ApiError(response.status, 'ERR_NO_TOKENS', 'The server sent no session tokens');
  await SecureStore.setItemAsync(ACCESS, access);
  await SecureStore.setItemAsync(REFRESH, refresh);
}

async function problem(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  return new ApiError(response.status, body?.code ?? 'ERR_HTTP', body?.detail ?? body?.title ?? `HTTP ${response.status}`);
}

/** Signs in; with two-step sign-in on, the first try fails with ERR_MFA_REQUIRED and the caller asks for `code`. */
export async function signIn(email: string, password: string, code?: string): Promise<Account> {
  const response = await fetch(`${API_URL}/api/v1/identity/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(code ? { 'x-mfa-code': code } : {}) },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw await problem(response);
  await storeTokens(response);
  return (await response.json()).account;
}

export async function signOut(): Promise<void> {
  const refresh = await SecureStore.getItemAsync(REFRESH);
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
  if (refresh) {
    await fetch(`${API_URL}/api/v1/identity/sessions/current`, {
      method: 'DELETE',
      headers: { cookie: `nx_rt=${refresh}` },
    }).catch(() => undefined);
  }
}

async function refreshTokens(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH);
  if (!refresh) return false;
  const response = await fetch(`${API_URL}/api/v1/identity/sessions/refresh`, {
    method: 'POST',
    headers: { cookie: `nx_rt=${refresh}` },
  });
  if (!response.ok) return false;
  await storeTokens(response);
  return true;
}

/** Calls `/api/v1/...` with the stored access token, refreshing it once when it has expired. */
export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await SecureStore.getItemAsync(ACCESS);
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401 && !retried && (await refreshTokens())) return api(path, init, true);
  if (!response.ok) throw await problem(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}
