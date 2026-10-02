/**
 * Stable identifiers for the development dataset.
 *
 * Every ID carries a `dev_` prefix so fixture records are recognisable in
 * logs, analytics and any accidental write to a real backend.
 */
export const IDS = {
  guest: 'dev_gst_alaurent',
  companion: 'dev_gst_claurent',
  reservation: 'dev_rsv_ev270515',
  voyage: 'dev_voy_ev270515',
  yacht: 'dev_yct_evrima',
  yachtIlma: 'dev_yct_ilma',
  suite: 'dev_ste_gs_0612',
  pastVoyages: {
    caribbean: 'dev_voy_ev231202',
    adriatic: 'dev_voy_ev240831',
    greekIsles: 'dev_voy_il250614',
  },
} as const;

/** Reserved example domain (RFC 2606) for any e-mail-like value. */
export const EXAMPLE_DOMAIN = 'example.com';
