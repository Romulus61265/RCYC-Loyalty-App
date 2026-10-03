/**
 * TransferService in the mock: a stand-in for the transfer operator, which
 * confirms every re-timing at once. No transfer-supplier integration exists;
 * a real adapter would return 'requested' until the operator confirms.
 */
import type { ID, ISODateTime } from '@/domain';
import type { TransferService } from '@/services/contracts';
import type { MockExperienceService } from './MockExperienceService';

export class MockTransferService implements TransferService {
  constructor(private readonly experience: MockExperienceService) {}

  async retime(bookingId: ID, change: { start: ISODateTime; end?: ISODateTime; reason: string }): Promise<'confirmed'> {
    await this.experience.applyOperatorChange(bookingId, { start: change.start, ...(change.end ? { end: change.end } : {}), note: change.reason });
    return 'confirmed';
  }
}
