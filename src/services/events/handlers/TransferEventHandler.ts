/** TRANSFER_DELAYED → TransferService re-times the pick-up with the operator. */
import type { InternalEvent } from '@/domain';
import type { EventHandler, HandlerResult, TransferService } from '@/services/contracts';

export class TransferEventHandler implements EventHandler<'TRANSFER_DELAYED'> {
  readonly name = 'TransferEventHandler';
  readonly handles = ['TRANSFER_DELAYED'] as const;

  constructor(private readonly transfers: TransferService) {}

  async handle(event: InternalEvent<'TRANSFER_DELAYED'>): Promise<HandlerResult> {
    const p = event.payload;
    const outcome = await this.transfers.retime(p.booking_id, { start: p.new_start, ...(p.new_end ? { end: p.new_end } : {}), reason: p.reason });
    return outcome === 'confirmed' ? { outcome: 'done', detail: `Pick-up now ${p.new_start.slice(11, 16)}` } : { outcome: 'requested', detail: 'Asked of the operator' };
  }
}
