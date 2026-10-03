/**
 * The mock's one store of service requests, shared by the concierge (which
 * raises requests from conversations) and the Requests screens, so a request
 * appears everywhere the moment it exists.
 */
import type { ID, ServiceRequest } from '@/domain';
import { data } from './support';

export class MockRequestStore {
  readonly items: ServiceRequest[] = data.concierge.requests.map((r) => ({ ...r }));
  private listeners = new Set<(r: ServiceRequest) => void>();

  find(id: ID): ServiceRequest | undefined {
    return this.items.find((r) => r.id === id);
  }

  add(r: ServiceRequest): ServiceRequest {
    this.items.unshift(r);
    this.emit(r);
    return r;
  }

  update(id: ID, change: Partial<ServiceRequest>): ServiceRequest | undefined {
    const r = this.find(id);
    if (!r) return undefined;
    Object.assign(r, change);
    this.emit(r);
    return r;
  }

  onChange(listener: (r: ServiceRequest) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(r: ServiceRequest) {
    this.listeners.forEach((l) => l({ ...r }));
  }
}
