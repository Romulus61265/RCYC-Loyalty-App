/**
 * Client-side role checks — for *presentation only* (hiding controls).
 * Every permission is enforced again server-side by RLS policies and
 * Edge Function guards; the client is never trusted.
 */
import type { AppRole, AuthSession } from '@/services/contracts';

export type Permission =
  | 'profile:read'
  | 'profile:write'
  | 'booking:request'
  | 'booking:modify'
  | 'concierge:chat'
  | 'concierge:escalate'
  | 'service-request:create'
  | 'documents:submit'
  | 'crew:view-guest-context'
  | 'crew:resolve-request';

const grants: Record<AppRole, Permission[]> = {
  guest: ['profile:read', 'profile:write', 'booking:request', 'booking:modify', 'concierge:chat', 'concierge:escalate', 'service-request:create', 'documents:submit'],
  travel_companion: ['profile:read', 'booking:request', 'concierge:chat', 'concierge:escalate', 'service-request:create', 'documents:submit'],
  suite_ambassador: ['crew:view-guest-context', 'crew:resolve-request', 'concierge:chat'],
  concierge_agent: ['crew:view-guest-context', 'crew:resolve-request', 'concierge:chat'],
  shore_ops: ['crew:view-guest-context', 'crew:resolve-request'],
  admin: [],
};

export function can(session: AuthSession | null, permission: Permission): boolean {
  if (!session) return false;
  return session.roles.some((role) => grants[role].includes(permission));
}
