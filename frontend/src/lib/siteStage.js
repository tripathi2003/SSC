/** Public marketing copy — stage + changelog (Q.1). Update when shipping milestones. */

export const SITE_STAGE_ID = 'private_development';

import { getAppVersion } from './appVersion';

export function getPublicAppVersion() {
  return getAppVersion();
}

/** @typedef {{ id: string, date: string, titleKey: string, bodyKey: string }} SiteUpdateEntry */

/** @type {SiteUpdateEntry[]} */
export const PUBLIC_SITE_UPDATES = [
  {
    id: '2026-07-02-v1020-messaging',
    date: '2026-07-02',
    titleKey: 'siteUpdateV1020MessagingTitle',
    bodyKey: 'siteUpdateV1020MessagingBody',
  },
  {
    id: '2026-06-30-builds-android-help',
    date: '2026-06-30',
    titleKey: 'siteUpdateBuildsAndroidHelpTitle',
    bodyKey: 'siteUpdateBuildsAndroidHelpBody',
  },
  {
    id: '2026-06-29-public-beta',
    date: '2026-06-29',
    titleKey: 'siteUpdatePublicBetaTitle',
    bodyKey: 'siteUpdatePublicBetaBody',
  },
  {
    id: '2026-06-29-trust-ops',
    date: '2026-06-29',
    titleKey: 'siteUpdateTrustOpsTitle',
    bodyKey: 'siteUpdateTrustOpsBody',
  },
  {
    id: '2026-06-29-distribution',
    date: '2026-06-29',
    titleKey: 'siteUpdateDistributionTitle',
    bodyKey: 'siteUpdateDistributionBody',
  },
  {
    id: '2026-06-29-installed-only',
    date: '2026-06-29',
    titleKey: 'siteUpdateInstalledOnlyTitle',
    bodyKey: 'siteUpdateInstalledOnlyBody',
  },
  {
    id: '2026-06-28-auto-update',
    date: '2026-06-28',
    titleKey: 'siteUpdateAutoUpdateTitle',
    bodyKey: 'siteUpdateAutoUpdateBody',
  },
  {
    id: '2026-06-28-desktop-translate',
    date: '2026-06-28',
    titleKey: 'siteUpdateDesktopTranslateTitle',
    bodyKey: 'siteUpdateDesktopTranslateBody',
  },
  {
    id: '2026-06-28-roadmap-q',
    date: '2026-06-28',
    titleKey: 'siteUpdateRoadmapTitle',
    bodyKey: 'siteUpdateRoadmapBody',
  },
  {
    id: '2026-06-27-api-domain',
    date: '2026-06-27',
    titleKey: 'siteUpdateApiDomainTitle',
    bodyKey: 'siteUpdateApiDomainBody',
  },
  {
    id: '2026-06-26-turnstile',
    date: '2026-06-26',
    titleKey: 'siteUpdateTurnstileTitle',
    bodyKey: 'siteUpdateTurnstileBody',
  },
];