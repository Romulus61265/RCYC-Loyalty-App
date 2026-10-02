/** FICTIONAL alerts (in-app, need attention) and notifications (outbound history and schedule). */
import type { DevCommunicationData } from './types';
import { IDS } from './ids';

const G = IDS.guest;
const R = IDS.reservation;

export const communicationData: DevCommunicationData = {
  alerts: [
    {
      id: 'dev_alr_health', eventId: 'dev_evt_docs_due', severity: 'action',
      title: 'One small thing before you sail',
      body: 'Your health questionnaire is due by Thursday, 13 May. It takes about two minutes.',
      action: { label: 'Complete now', route: '/voyage' },
      createdAt: '2027-05-10T09:00:00-04:00', acknowledged: false,
    },
    {
      id: 'dev_alr_bridge', eventId: 'dev_evt_srq_bridge', severity: 'action',
      title: 'The Captain would be glad to welcome you',
      body: 'Choose 16:30 or 17:30 for your bridge visit on the sea day.',
      action: { label: 'Choose a time', route: '/concierge' },
      createdAt: '2027-05-10T14:30:00-04:00', acknowledged: false,
    },
    {
      id: 'dev_alr_flight', eventId: 'dev_evt_flight_tracked', severity: 'info',
      title: 'We’re tracking AA 7412 for you',
      body: 'Miami to Barcelona, Friday 14 May at 18:40.',
      handled: 'Marc, your driver, will adjust automatically if your arrival time changes.',
      createdAt: '2027-05-11T07:30:00-04:00', acknowledged: false,
    },
  ],

  notifications: [
    {
      id: 'dev_ntf_01', guestId: G, reservationId: R, channel: 'email', category: 'pre-voyage',
      title: 'Thirty days until Barcelona', body: 'Your voyage aboard Evrima begins on 15 May. A few thoughts to help you prepare.',
      deepLink: '/voyage', scheduledFor: '2027-04-15T09:00:00-04:00', deliveredAt: '2027-04-15T09:00:04-04:00', readAt: '2027-04-15T12:41:00-04:00',
      bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_02', guestId: G, reservationId: R, channel: 'push', category: 'reservation',
      title: 'Your Sagrada Família visit is confirmed', body: 'Saturday 15 May at 10:45, with architect-guide Núria.',
      deepLink: '/voyage', scheduledFor: '2027-04-28T10:15:00-04:00', deliveredAt: '2027-04-28T10:15:02-04:00', readAt: '2027-04-28T10:20:00-04:00',
      bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_03', guestId: G, reservationId: R, channel: 'push', category: 'concierge',
      title: 'Elena has an update for you', body: 'The couples ritual is reserved for the afternoon of the 20th.',
      deepLink: '/concierge', scheduledFor: '2027-05-03T11:00:00-04:00', deliveredAt: '2027-05-03T11:00:01-04:00', readAt: '2027-05-03T11:06:00-04:00',
      bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_04', guestId: G, reservationId: R, channel: 'email', category: 'pre-voyage',
      title: 'Your passports are verified', body: 'Thank you. Both passports are complete; nothing more is needed.',
      scheduledFor: '2027-05-06T08:30:00-04:00', deliveredAt: '2027-05-06T08:30:03-04:00', readAt: '2027-05-06T19:02:00-04:00',
      bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_05', guestId: G, reservationId: R, channel: 'push', category: 'pre-voyage',
      title: 'Your health questionnaire', body: 'Due by 13 May. About two minutes.',
      deepLink: '/voyage', scheduledFor: '2027-05-10T09:00:00-04:00', deliveredAt: '2027-05-10T09:00:02-04:00',
      bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_06', guestId: G, reservationId: R, channel: 'push', category: 'concierge',
      title: 'A time for the bridge', body: 'The Captain can welcome you at 16:30 or 17:30 on the sea day.',
      deepLink: '/concierge', scheduledFor: '2027-05-10T14:30:00-04:00', deliveredAt: '2027-05-10T14:30:01-04:00',
      bypassQuietHours: false,
    },
    // ── Scheduled (not yet delivered) ──
    {
      id: 'dev_ntf_07', guestId: G, reservationId: R, channel: 'push', category: 'travel',
      title: 'Check-in for AA 7412 is open', body: 'Miami to Barcelona tomorrow at 18:40.',
      scheduledFor: '2027-05-13T18:40:00-04:00', bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_08', guestId: G, reservationId: R, channel: 'sms', category: 'travel',
      title: 'Welcome to Barcelona', body: 'Marc is waiting at arrivals with your name. Your luggage goes straight to the yacht.',
      scheduledFor: '2027-05-15T09:15:00+02:00', bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_09', guestId: G, reservationId: R, channel: 'in-app', category: 'occasion',
      title: 'A note from Elena', body: 'With our warmest wishes on your twentieth. This evening is yours.',
      scheduledFor: '2027-05-20T08:30:00+02:00', bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_10', guestId: G, reservationId: R, channel: 'push', category: 'onboard',
      title: 'Your car to Fiumicino', body: 'Bags are collected at 09:15; your car leaves at 09:45. Breakfast is on your terrace.',
      deepLink: '/voyage', scheduledFor: '2027-05-22T07:15:00+02:00', bypassQuietHours: false,
    },
    {
      id: 'dev_ntf_11', guestId: G, reservationId: R, channel: 'email', category: 'post-voyage',
      title: 'Thank you for sailing with us', body: 'A few memories from your voyage, and a note from the Captain.',
      scheduledFor: '2027-05-29T10:00:00-04:00', bypassQuietHours: false,
    },
  ],
};
