/**
 * Passwordless e-mail sign-in with Supabase Auth.
 *
 *  • Accounts are never created from the app (`shouldCreateUser: false`,
 *    and self-signup is disabled server-side). Guests are invited from their
 *    reservation; a database trigger links the confirmed account to the guest.
 *  • The response to "send me a code" is the same whether or not the address
 *    is known, so the screen cannot be used to discover who is a guest.
 *  • Tokens live in the device keychain (supabaseAuthStorage), refresh
 *    automatically and expire after 15 minutes (supabase/config.toml).
 *  • Marriott Bonvoy sign-in (OIDC + PKCE) needs the identity provider to be
 *    configured in Supabase Auth; until then it reports `unavailable`.
 */
import type { Session } from '@supabase/supabase-js';
import type { ID } from '@/domain';
import type { AppRole, AuthService, AuthSession, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { logger } from '@/core/logging';
import type { Db } from './support';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6}$/;
const log = logger.child('auth');

/** Supabase Auth errors that only mean "this address has no account". */
const UNKNOWN_ACCOUNT = /signups? not allowed|user not found|otp_disabled/i;

export class SupabaseAuthService implements AuthService {
  /** challengeId → e-mail, kept in memory only for the few minutes a code is valid. */
  private challenges = new Map<string, { email: string; at: number }>();
  private seq = 0;

  constructor(private readonly db: Db) {}

  /** The guest record and roles behind a Supabase session; null when the account is not linked to a guest. */
  private async toSession(session: Session | null): Promise<AuthSession | null> {
    if (!session) return null;
    const db = this.db();
    const userId = session.user.id;
    const [guest, roles, aal] = await Promise.all([
      db.from('guests').select('id').eq('auth_user_id', userId).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', userId),
      db.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (guest.error || roles.error) throw new ServiceError('unavailable', (guest.error ?? roles.error)!.message, true);
    const guestId = (guest.data as { id: string } | null)?.id;
    if (!guestId) return null;
    const roleList = ((roles.data ?? []) as { role: AppRole }[]).map((r) => r.role);
    return {
      userId,
      guestId,
      roles: roleList.length ? roleList : ['guest'],
      expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
      mfaVerified: aal.data?.currentLevel === 'aal2',
    };
  }

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.db().auth.getSession();
    if (error) throw new ServiceError('unavailable', error.message, true);
    return this.toSession(data.session);
  }

  async signInWithOtp(email: string): Promise<{ challengeId: ID }> {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address) || address.length > 254) throw new ServiceError('validation', 'Please enter a valid e-mail address');
    const { error } = await this.db().auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
    if (error) {
      if (error.status === 429) throw new ServiceError('unavailable', 'Too many requests', true);
      // Unknown addresses look exactly like known ones to the caller.
      if (!UNKNOWN_ACCOUNT.test(error.message)) throw new ServiceError('unavailable', error.message, true);
      log.info('sign-in code requested for an address without an account');
    }
    this.seq += 1;
    const challengeId = `otp_${Date.now().toString(36)}_${this.seq}`;
    this.challenges.set(challengeId, { email: address, at: Date.now() });
    return { challengeId };
  }

  async verifyOtp(challengeId: ID, code: string): Promise<AuthSession> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || Date.now() - challenge.at > 10 * 60_000) throw new ServiceError('validation', 'This code has expired. Please ask for a new one.');
    if (!CODE.test(code.trim())) throw new ServiceError('validation', 'The code is six digits');
    const { data, error } = await this.db().auth.verifyOtp({ email: challenge.email, token: code.trim(), type: 'email' });
    if (error || !data.session) throw new ServiceError('validation', 'That code didn’t work. Please check it, or ask for a new one.');
    this.challenges.delete(challengeId);
    const session = await this.toSession(data.session);
    if (!session) {
      // Signed in, but not a guest of any reservation: do not keep the session.
      await this.db().auth.signOut();
      throw new ServiceError('forbidden', 'This account is not linked to a reservation');
    }
    return session;
  }

  async signInWithBonvoy(): Promise<AuthSession> {
    throw new ServiceError('unavailable', 'Marriott Bonvoy sign-in is not connected in this environment');
  }

  async signOut(): Promise<void> {
    this.challenges.clear();
    // Revokes the refresh token server-side and clears the keychain entry.
    const { error } = await this.db().auth.signOut();
    if (error) {
      // Still clear local state, so a failed network call cannot keep a session alive on the device.
      await this.db().auth.signOut({ scope: 'local' });
    }
  }

  onSessionChange(listener: (session: AuthSession | null) => void): Unsubscribe {
    const { data } = this.db().auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      // Supabase advises against awaiting its own calls inside this callback.
      setTimeout(() => {
        this.toSession(session).then(listener, (e: unknown) => {
          log.warn('could not resolve session', { reason: e instanceof Error ? e.message : 'unknown' });
          listener(null);
        });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }
}
