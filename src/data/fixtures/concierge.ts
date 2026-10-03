/** FICTIONAL concierge state for the Laurent party, as of the dataset's reference "now". */
import type { DevConciergeData } from './types';
import { IDS } from './ids';

const R = IDS.reservation;
const G = IDS.guest;

export const conciergeData: DevConciergeData = {
  ambassador: { name: 'Elena Moreau', title: 'Suite Ambassador' },

  team: {
    shoreside: { name: 'Marco Bellini', title: 'Shoreside Concierge' },
    aboard: { name: 'Sofia Lindqvist', title: 'Guest Services' },
    medical: { name: 'Dr. Anna Vos', title: 'Medical Centre' },
  },

  suggestedQuestions: [
    'What is planned for tomorrow?',
    'Move my dinner reservation.',
    'What private experiences are available in Monte Carlo?',
    'Arrange transportation.',
    'What benefits do I have?',
    'Help me celebrate my anniversary.',
  ],

  requests: [
    {
      id: 'dev_srq_anniv_dinner', reservationId: R, type: 'occasion', category: 'concierge', guestId: G,
      acknowledgedAt: '2027-04-26T15:31:00-04:00', startedAt: '2027-04-27T09:00:00-04:00',
      occasionStep: 'anniversary:dev_occ_anniv_20:private-dining',
      summary: 'Anniversary dinner on a private terrace, 20 May',
      details: '20th anniversary. Menu with the chef; a 2007 red to mark the wedding year. Keep it discreet.',
      status: 'in_progress', priority: 'priority',
      assignedTeam: 'suite-ambassador', assignedTo: 'Elena Moreau, Suite Ambassador',
      createdAt: '2027-04-26T15:20:00-04:00', updatedAt: '2027-05-07T11:05:00-04:00',
      nextUpdateBy: '2027-05-13T17:00:00-04:00', bookingId: 'dev_bkg_anniversary',
    },
    {
      id: 'dev_srq_wine_2007', reservationId: R, type: 'general', category: 'dining', guestId: G,
      acknowledgedAt: '2027-04-26T15:40:00-04:00', startedAt: '2027-04-27T10:00:00-04:00', resolvedAt: '2027-05-04T09:40:00-04:00',
      resolutionNotes: 'Secured: a 2007 Barolo Riserva, to be decanted at the table on 20 May.',
      occasionStep: 'anniversary:dev_occ_anniv_20:wine',
      summary: 'Source a 2007 Barolo for the anniversary',
      details: 'The head sommelier has secured a 2007 Barolo Riserva, to be decanted at the table.',
      status: 'confirmed', priority: 'routine',
      assignedTeam: 'guest-services', assignedTo: 'Luca Ferraro, Head Sommelier',
      createdAt: '2027-04-26T15:24:00-04:00', updatedAt: '2027-05-04T09:40:00-04:00',
    },
    {
      id: 'dev_srq_bridge', reservationId: R, type: 'excursion', category: 'excursion', guestId: G,
      acknowledgedAt: '2027-05-02T11:00:00-04:00', startedAt: '2027-05-10T14:30:00-04:00',
      summary: 'Bridge visit on the sea day, 17 May',
      details: 'The Captain can welcome you at 16:30 or 17:30. Please choose a time.',
      status: 'awaiting_guest', priority: 'routine',
      assignedTeam: 'guest-services', assignedTo: 'Guest Services',
      createdAt: '2027-05-02T10:12:00-04:00', updatedAt: '2027-05-10T14:30:00-04:00',
      experienceId: 'dev_exp_bridge',
    },
    {
      id: 'dev_srq_bedding', reservationId: R, type: 'suite', category: 'suite', guestId: G,
      acknowledgedAt: '2027-04-20T09:30:00-04:00', startedAt: '2027-04-20T09:30:00-04:00', resolvedAt: '2027-04-21T10:00:00-04:00', closedAt: '2027-04-21T10:00:00-04:00',
      resolutionNotes: 'Feather-free pillows and duvet are noted for Grand Suite 612, and will be in place before you arrive.',
      summary: 'Feather-free pillows and duvet in Grand Suite 612',
      status: 'completed', priority: 'routine',
      assignedTeam: 'suite-ambassador', assignedTo: 'Elena Moreau, Suite Ambassador',
      createdAt: '2027-04-20T08:55:00-04:00', updatedAt: '2027-04-21T10:00:00-04:00',
    },
    {
      id: 'dev_srq_heli', reservationId: R, type: 'transport', category: 'transportation', guestId: G,
      summary: 'Helicopter to Nice and lunch in Saint-Paul-de-Vence, 19 May',
      details: 'Requested as an alternative afternoon plan. Awaiting the charter operator’s confirmation.',
      status: 'received', priority: 'routine',
      assignedTeam: 'destination-services',
      createdAt: '2027-05-10T19:45:00-04:00', updatedAt: '2027-05-10T19:45:00-04:00',
      nextUpdateBy: '2027-05-12T12:00:00-04:00', experienceId: 'dev_exp_helicopter',
    },
    {
      id: 'dev_srq_spa_second', reservationId: R, type: 'general', category: 'spa', guestId: G,
      summary: 'A second deep-tissue massage, morning of 21 May',
      status: 'received', priority: 'routine',
      assignedTeam: 'guest-services', assignedTo: 'The Spa team',
      createdAt: '2027-05-09T08:10:00-04:00', updatedAt: '2027-05-09T16:20:00-04:00', acknowledgedAt: '2027-05-09T16:20:00-04:00',
      nextUpdateBy: '2027-05-12T12:00:00-04:00',
    },
    {
      id: 'dev_srq_transfer_early', reservationId: R, type: 'transport', category: 'transportation', guestId: G,
      summary: 'An earlier arrival transfer from El Prat',
      details: 'Flight moved to the 09:05 arrival. Then moved back, so the original transfer stands.',
      status: 'cancelled', priority: 'routine',
      assignedTeam: 'destination-services', assignedTo: 'Destination Services',
      createdAt: '2027-04-30T12:00:00-04:00', updatedAt: '2027-05-01T09:15:00-04:00', acknowledgedAt: '2027-04-30T13:05:00-04:00', closedAt: '2027-05-01T09:15:00-04:00',
      resolutionNotes: 'Withdrawn by you: your original 10:00 transfer stands.',
    },
  ],

  history: [
    {
      id: 'dev_msg_h1', author: 'guest', createdAt: '2027-04-26T15:02:00-04:00',
      body: 'Our 20th anniversary falls during the voyage. Could you arrange something special in Monaco?',
    },
    {
      id: 'dev_msg_h2', author: 'ai', createdAt: '2027-04-26T15:02:20-04:00', intent: 'occasion.plan',
      body: 'Congratulations, Mr. Laurent. Your anniversary on 20 May falls on your second day in Monte Carlo. I’ve asked Elena, your Suite Ambassador, to plan it with you personally.',
    },
    {
      id: 'dev_msg_h3', author: 'human', authorName: 'Elena, Suite Ambassador', createdAt: '2027-04-26T15:18:00-04:00',
      body: 'Good afternoon, Alexander. I would love to help. A private terrace dinner, a menu with the chef, and a red from 2007, perhaps? I will keep it entirely between us.',
    },
    {
      id: 'dev_msg_h4', author: 'guest', createdAt: '2027-04-26T15:20:00-04:00',
      body: 'Perfect. A Barolo if possible. And a couples spa that afternoon.',
    },
    {
      id: 'dev_msg_h5', author: 'human', authorName: 'Elena, Suite Ambassador', createdAt: '2027-04-26T15:31:00-04:00',
      body: 'Done: the couples terrace ritual at 16:00 is reserved, and Luca, our head sommelier, is sourcing the Barolo. I will share the menu with you before you sail.',
    },
  ],
};
