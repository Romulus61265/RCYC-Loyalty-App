import { ServiceError, type DemoService } from './contracts';

/** No demonstration: Supabase mode, and mock mode without DEMO_MODE. */
export const inactiveDemo: DemoService = {
  mode: null,
  script: () => [],
  status: async () => ({ inboundDelayed: false }),
  simulateInboundDelay: async () => {
    throw new ServiceError('unavailable', 'Not in a demonstration');
  },
  reset: async () => undefined,
};
