// ============================================================
// KEYWORD CONFIGURATION
// Edit this file to add/remove search keywords.
// ============================================================

// Core service keywords - what the business does
export const SERVICE_KEYWORDS = [
  'garage door repair',
  'broken spring',
  'garage door stuck',
  'garage door not opening',
  'garage door won\'t open',
  'garage door won\'t close',
  'garage opener not working',
  'garage opener repair',
  'garage opener installation',
  'garage door install',
  'garage door installation',
  'replace garage door opener',
  'garage cable replacement',
  'garage cable broke',
  'garage roller replacement',
  'garage door off track',
  'garage torsion spring',
  'garage extension spring',
  'overhead door repair',
  'garage motor stopped',
  'emergency garage door',
  'garage door spring broke',
  'garage spring snapped',
  'garage door sensor',
  'keypad not working garage',
  'garage door panel',
  'garage door dented',
];

// Homeowner-intent phrases - urgency and help-seeking language
export const INTENT_KEYWORDS = [
  'need garage door help',
  'need garage door repair',
  'looking for garage door',
  'who can fix garage door',
  'anyone fix garage door',
  'garage door help',
  'need someone to fix garage',
  'garage door estimate',
  'car trapped in garage',
  'can\'t get car out garage',
  'urgent garage repair',
  'same day garage repair',
  'garage door asap',
  'garage door emergency',
  'garage door recommendation',
  'good garage door company',
  'recommend garage door',
];

// All keywords combined for search
export const ALL_SEARCH_KEYWORDS = [
  ...SERVICE_KEYWORDS,
  ...INTENT_KEYWORDS,
];

// High-value terms - presence scores higher
export const HIGH_INTENT_TERMS = [
  'need help',
  'looking for someone',
  'repair needed',
  'broken',
  'snapped',
  'stopped working',
  'not opening',
  'stuck',
  'asap',
  'urgent',
  'emergency',
  'estimate needed',
  'install for me',
  'who can fix',
  'can anyone fix',
  'trapped',
  'won\'t open',
  'won\'t close',
  'off track',
  'spring broke',
  'cable broke',
  'recommend',
  'looking for',
  'need someone',
  'help me',
];

// Business/ad language - presence scores lower
export const BUSINESS_AD_TERMS = [
  'same day service',
  'call now',
  'free estimate',
  'licensed and insured',
  'licensed & insured',
  'we repair all brands',
  'all brands',
  '24/7 service',
  '24 hour service',
  'serving the area',
  'family owned',
  'locally owned',
  'years of experience',
  'fully insured',
  'bonded and insured',
  'best price guaranteed',
  'lowest price',
  'satisfaction guaranteed',
  'upfront pricing',
  'no hidden fees',
  'certified technician',
  'professional technician',
  'garage door company',
  'garage door contractor',
  'we service',
  'we install',
  'we replace',
  'contact us today',
  'visit our website',
  'our technicians',
  'our team',
];

// Compact keyword sets for Craigslist queries (keep short)
export const CRAIGSLIST_QUERIES = [
  'garage door repair',
  'garage door stuck',
  'broken spring garage',
  'garage opener repair',
  'garage door installation',
  'garage door off track',
  'garage cable broke',
  'need garage door help',
  'garage door emergency',
];
