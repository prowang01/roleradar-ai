// content.js — runs on linkedin.com/jobs/view/* and /jobs/search-results/*
// Extracts job fields on demand when the popup sends an "extract" message.

const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title h1',
  '.jobs-unified-top-card__job-title h1',
  'h1.t-24.t-bold.inline',
  'h1.t-24',
  'h1[data-test-job-title]',
  '.topcard__title',
  'h1',
];

const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name a',
  '.job-details-jobs-unified-top-card__primary-description-container a[href*="/company/"]',
  '.topcard__org-name-link',
  'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
  '.jobs-unified-top-card__subtitle-primary-grouping a',
];

const LOCATION_SELECTORS = [
  '.job-details-jobs-unified-top-card__primary-description-container .tvm__text.tvm__text--positive',
  '.job-details-jobs-unified-top-card__primary-description-container .tvm__text:first-child',
  '.jobs-unified-top-card__bullet',
  '.job-details-jobs-unified-top-card__bullet',
  '.topcard__flavor--bullet',
  '.jobs-unified-top-card__workplace-type',
];

const DESC_SELECTORS = [
  '.jobs-description-content__text',
  '#job-details',
  '.jobs-description__content .jobs-description-content__text',
  '.jobs-box__html-content',
  '.description__text--rich',
  '.description__text',
  '.jobs-description',
];

const SHOW_MORE_SELECTORS = [
  '.jobs-description__footer-button',
  'button.jobs-description__footer-button',
  'button[aria-label*="Show more"]',
  'button[aria-label*="Tout afficher"]',
  'button[aria-label*="more"]',
];

function tryText(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text) return text;
      }
    } catch {
      // invalid selector — skip
    }
  }
  return null;
}

function extractJobId(url) {
  // 1. currentJobId query param (search-results pages)
  try {
    const fromParam = new URL(url).searchParams.get('currentJobId');
    if (fromParam && /^\d+$/.test(fromParam)) return fromParam;
  } catch {}

  // 2. /jobs/view/{id} path
  const match = url.match(/\/jobs\/view\/(\d+)/);
  if (match) return match[1];

  return null;
}

function isTruncated() {
  for (const sel of SHOW_MORE_SELECTORS) {
    try {
      const btn = document.querySelector(sel);
      // offsetParent is null when the element is hidden via display:none
      if (btn && btn.offsetParent !== null) return true;
    } catch {}
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'extract') return;

  const url = window.location.href;
  sendResponse({
    jobId: extractJobId(url),
    title: tryText(TITLE_SELECTORS),
    company: tryText(COMPANY_SELECTORS),
    location: tryText(LOCATION_SELECTORS),
    description: tryText(DESC_SELECTORS),
    truncated: isTruncated(),
  });
});
