/**
 * Campaign identity and dates, in one place.
 *
 * The Gldani promotion runs on two days only, which is a different shape from
 * the Telavi sale it replaces: that one ran until an end date, this one is a
 * window. So the exported strings name a window rather than a deadline, and
 * nothing derives one from the other.
 *
 * Every form is spelled out rather than built by concatenation, because
 * Georgian inflects: "12–13 სექტემბერი" becomes "12–13 სექტემბერს" when it
 * answers "when", and gluing a suffix on with a hyphen is simply wrong. Change
 * the dates and change each line.
 */

/** The branch this campaign belongs to, as it appears mid-sentence. */
export const CAMPAIGN_BRANCH = "გლდანის ფილიალი";
/** Same, in the locative — "…მოქმედებს გლდანის ფილიალში". */
export const CAMPAIGN_BRANCH_IN = "გლდანის ფილიალში";

/** Nominative: a label, a heading, an answer to "which days". */
export const CAMPAIGN_DATES = "12–13 სექტემბერი";
/** Adverbial: answers "when" — "აქცია მოქმედებს 12–13 სექტემბერს". */
export const CAMPAIGN_DATES_ON = "12–13 სექტემბერს";
/** With the restriction stated, for the places that need it said out loud. */
export const CAMPAIGN_DATES_ONLY = "მხოლოდ 12–13 სექტემბერს";
