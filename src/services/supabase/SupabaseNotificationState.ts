/**
 * Notification read state and push devices on Supabase, under RLS to the
 * signed-in guest. Tokens are written through register_push_device() and
 * never read back.
 */
import type { ID, PushDevice } from '@/domain';
import type { NotificationStateStore } from '@/services/notifications/state';
import { many, one, run, toServiceError, type SupabaseDeps } from './support';

interface DeviceRow {
  id: string;
  platform: PushDevice['platform'];
  name: string | null;
  enabled: boolean;
  registered_at: string;
}

const toDevice = (d: DeviceRow): PushDevice => ({ id: d.id, platform: d.platform, ...(d.name ? { name: d.name } : {}), registeredAt: d.registered_at, enabled: d.enabled });

export class SupabaseNotificationState implements NotificationStateStore {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  async readKeys(guestId: ID): Promise<Set<string>> {
    const rows = await many<{ notification_key: string }>(this.db.from('notification_receipts').select('notification_key').eq('guest_id', guestId).limit(5000));
    return new Set(rows.map((r) => r.notification_key));
  }

  async markRead(guestId: ID, keys: string[], at: Date): Promise<void> {
    const rows = keys.map((k) => ({ guest_id: guestId, notification_key: k, read_at: at.toISOString() }));
    // Already read stays read: ignore duplicates.
    await run(this.db.from('notification_receipts').upsert(rows, { onConflict: 'guest_id,notification_key', ignoreDuplicates: true }));
  }

  async listDevices(_guestId: ID): Promise<PushDevice[]> {
    const rows = await many<DeviceRow>(this.db.from('push_devices').select('id, platform, name, enabled, registered_at').order('registered_at'));
    return rows.map(toDevice);
  }

  async upsertDevice(_guestId: ID, reg: { token: string; platform: PushDevice['platform']; name?: string }): Promise<PushDevice> {
    const { data, error } = await this.db.rpc('register_push_device', { p_token: reg.token, p_platform: reg.platform, p_name: reg.name ?? null });
    if (error) throw toServiceError(error);
    return toDevice(await one<DeviceRow>(this.db.from('push_devices').select('id, platform, name, enabled, registered_at').eq('id', data as string).maybeSingle(), 'Device', String(data)));
  }

  async removeDevice(_guestId: ID, deviceId: ID): Promise<void> {
    await run(this.db.from('push_devices').delete().eq('id', deviceId));
  }
}
