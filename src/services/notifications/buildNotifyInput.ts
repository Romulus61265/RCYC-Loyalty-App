/** Maps the app's domain objects to the notification engine's inputs. */
import type {
  DaySchedule,
  ExperienceBooking,
  GuestNotification,
  GuestProfile,
  GuestServiceRequest,
  JourneyAlert,
  PersonalizedRecommendation,
  Voyage,
} from '@/domain';
import type { NotifyInput } from '../../../supabase/functions/_shared/notifications/types';

export interface NotifySources {
  profile: GuestProfile;
  voyage: Voyage;
  bookings: ExperienceBooking[];
  schedules: DaySchedule[];
  requests: GuestServiceRequest[];
  alerts: JourneyAlert[];
  recommendations: PersonalizedRecommendation[];
  stored: GuestNotification[];
}

export function buildNotifyInput(src: NotifySources): NotifyInput {
  const c = src.profile.preferences.communication;
  return {
    guest: {
      firstName: src.profile.guest.preferredName ?? src.profile.guest.firstName,
      pushChannel: c.channels.push,
      quietHours: c.quietHours,
      personalisedRecommendations: src.profile.preferences.privacy.personalisedRecommendations,
    },
    itinerary: src.voyage.itinerary.map((p) => ({ id: p.id, day: p.day, date: p.date, type: p.type, portName: p.portName, arrival: p.arrival, allAboard: p.allAboard })),
    bookings: src.bookings.map((b) => ({ id: b.id, title: b.title, category: b.category, venue: b.venue, start: b.start, end: b.end, status: b.status })),
    activities: src.schedules.flatMap((d) =>
      d.items
        .filter((i) => i.kind !== 'port')
        .map((i) => ({ id: i.id, title: i.title, category: i.category, location: i.location, start: i.start, previousStart: i.previousStart, changedAt: i.changedAt })),
    ),
    requests: src.requests.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      awaitingGuest: r.awaitingGuest,
      team: r.assignedTeam.label,
      person: r.assignedTeam.person,
      resolutionNotes: r.resolutionNotes,
      timeline: r.timeline,
    })),
    alerts: src.alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, body: a.body, createdAt: a.createdAt, expiresAt: a.expiresAt, route: a.action?.route, actionLabel: a.action?.label })),
    recommendations: src.recommendations.map((r) => ({
      experienceId: r.experienceId,
      recommendation: r.recommendation,
      category: r.category,
      destination: r.destination,
      voyageDate: r.voyageDate,
      reason: r.reason,
      actionable: !r.booked && r.action.kind !== 'open',
    })),
    stored: src.stored.map((n) => ({
      id: n.id,
      type: n.type,
      category: n.category,
      title: n.title,
      body: n.body,
      scheduledFor: n.scheduledFor,
      deliveredAt: n.deliveredAt,
      readAt: n.readAt,
      deepLink: n.deepLink,
      bypassQuietHours: n.bypassQuietHours,
      dedupeKey: n.dedupeKey,
    })),
  };
}
