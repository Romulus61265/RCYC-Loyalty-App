/**
 * Backend-for-frontend (BFF) HTTP client.
 *
 * All enterprise integrations (Marriott Bonvoy, reservations PMS, shipboard
 * PMS, CRM, AI platform) are reached *only* through the BFF — Supabase Edge
 * Functions / API gateway. The device never holds partner credentials; it
 * presents the guest's short-lived access token, nothing else.
 */
import { env } from '@/config/env';
import { ServiceError, type ServiceErrorCode } from '@/services/contracts';

export type TokenProvider = () => Promise<string | null>;

export class ApiClient {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly baseUrl = env.apiBaseUrl,
  ) {}

  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) throw new ServiceError('unavailable', 'API base URL is not configured');
    const token = await this.getToken();
    if (!token) throw new ServiceError('unauthenticated', 'No active session');

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Client': 'guest-app',
        'X-Request-Id': `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) throw new ServiceError(mapStatus(res.status), `Request failed: ${res.status}`, res.status >= 500);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
}

function mapStatus(status: number): ServiceErrorCode {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}
