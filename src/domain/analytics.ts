/**
 * Product analytics: what happened in the app, never who or what was said.
 *
 * Each event has a fixed set of properties: ids, short labels, small
 * numbers. No free text, no names, no contact details, no documents, no
 * payment, health or authentication data, and no guest or reservation id.
 */
export interface AnalyticsEventProps {
  screen_viewed: { screen: string };
  experience_viewed: { experience_id: string; category: string; surface?: string };
  experience_saved: { experience_id: string; category: string; saved: 'yes' | 'no' };
  experience_booked: { experience_id: string; category: string; party_size?: number; source?: string };
  concierge_opened: { entry: string };
  /** The kind of request, never its words. */
  concierge_request_submitted: { kind: 'message' | 'action' | 'handoff'; action?: string; team?: string };
  service_request_created: { category: string; priority: string; source: string };
  recommendation_viewed: { recommendation_id: string; surface: string; position?: number };
  recommendation_accepted: { recommendation_id: string; surface: string; action: string };
  /** Which group of preferences changed, never the values. */
  preference_updated: { group: string };
}

export type AnalyticsEventName = keyof AnalyticsEventProps;

/** What a provider receives. */
export interface AnalyticsEnvelope {
  event: AnalyticsEventName;
  props: Record<string, string | number>;
  /** To the minute: enough for product questions, less for re-identification. */
  at: string;
  /** Random for this app session; not tied to the guest. */
  session_id: string;
  app: { version: string; platform: string; mode: string };
  /** Properties dropped by the privacy filter (names only), for monitoring the instrumentation. */
  dropped?: string[];
}
