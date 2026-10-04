/**
 * A counter that moves whenever the guest changes something through a
 * service (a booking, a request, a preference, a message). Screens that
 * refresh when they regain focus use it to tell "something may have
 * changed" from "the guest only looked at another tab".
 */
const READS = /^(get|list|check|count|unread|upcoming|now|subscribe|onSessionChange|openConversation|runs)/;

let version = 0;

export const dataVersion = () => version;

/** Called for every service call that succeeds; reads leave the version alone. */
export function noteServiceCall(method: string): void {
  if (!READS.test(method)) version += 1;
}

export const isReadMethod = (method: string) => READS.test(method);
