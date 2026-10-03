/**
 * Read state and push devices: the only notification state that is stored
 * per guest (everything else is derived). Mock: memory. Supabase:
 * notification_receipts and push_devices, both under RLS to the guest.
 */
import type { ID, PushDevice } from '@/domain';

export interface NotificationStateStore {
  readKeys(guestId: ID): Promise<Set<string>>;
  markRead(guestId: ID, keys: string[], at: Date): Promise<void>;
  listDevices(guestId: ID): Promise<PushDevice[]>;
  upsertDevice(guestId: ID, reg: { token: string; platform: PushDevice['platform']; name?: string }, at: Date): Promise<PushDevice>;
  removeDevice(guestId: ID, deviceId: ID): Promise<void>;
}

export class MemoryNotificationState implements NotificationStateStore {
  private reads = new Map<ID, Set<string>>();

  /** `initial`: keys each guest has already read (the demo dataset's history). */
  constructor(initial: Record<ID, string[]> = {}) {
    for (const [guest, keys] of Object.entries(initial)) this.reads.set(guest, new Set(keys));
  }
  private devices = new Map<ID, (PushDevice & { token: string })[]>();
  private seq = 0;

  async readKeys(guestId: ID) {
    return new Set(this.reads.get(guestId) ?? []);
  }
  async markRead(guestId: ID, keys: string[]) {
    const set = this.reads.get(guestId) ?? new Set<string>();
    keys.forEach((k) => set.add(k));
    this.reads.set(guestId, set);
  }
  async listDevices(guestId: ID) {
    // The token never leaves the store.
    return (this.devices.get(guestId) ?? []).map(({ token: _t, ...d }) => d);
  }
  async upsertDevice(guestId: ID, reg: { token: string; platform: PushDevice['platform']; name?: string }, at: Date) {
    const list = this.devices.get(guestId) ?? [];
    const existing = list.find((d) => d.token === reg.token);
    const device = existing ?? { id: `dev_push_${++this.seq}`, token: reg.token, platform: reg.platform, registeredAt: at.toISOString(), enabled: true };
    Object.assign(device, { platform: reg.platform, enabled: true, ...(reg.name ? { name: reg.name } : {}) });
    if (!existing) list.push(device);
    this.devices.set(guestId, list);
    const { token: _t, ...out } = device;
    return out;
  }
  async removeDevice(guestId: ID, deviceId: ID) {
    this.devices.set(guestId, (this.devices.get(guestId) ?? []).filter((d) => d.id !== deviceId));
  }
}
