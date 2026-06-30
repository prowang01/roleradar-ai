// content.js — injected into linkedin.com/jobs/*
// Reads the current DOM on demand (no caching). Safe to call multiple times.
//
// Double-injection guard: the popup may inject this file programmatically
// (fallback) even when the manifest already injected it declaratively.
// All side-effectful code (the message listener) is wrapped in the guard so
// only one listener is ever registered per tab, regardless of injection count.

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

// Selectors for the "Show more" / "Tout afficher" expand button
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
    } catch (e) {
      console.warn('[RoleRadar:content] Bad selector:', sel, e.message);
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

  // 2. /jobs/view/{id} path segment
  const match = url.match(/\/jobs\/view\/(\d+)/);
  if (match) return match[1];

  return null;
}

function isTruncated() {
  for (const sel of SHOW_MORE_SELECTORS) {
    try {
      const btn = document.querySelector(sel);
      if (btn) {
        // Use getComputedStyle — more reliable than offsetParent for visibility
        const style = window.getComputedStyle(btn);
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          btn.offsetHeight > 0;
        if (visible) {
          console.log(
            '[RoleRadar:content] Truncation button visible:',
            sel,
            btn.innerText.trim().slice(0, 40)
          );
          return true;
        }
      }
    } catch (e) {
      console.warn('[RoleRadar:content] Truncation selector error:', sel, e.message);
    }
  }
  return false;
}

// Register listener only once per tab (declarative injection + programmatic
// fallback both run this file; window is the shared page context).
if (!window.__roleradarInjected) {
  window.__roleradarInjected = true;
  console.log('[RoleRadar:content] Listener registered on', window.location.href);

  // Respond to extract requests from the popup.
  // Every call reads the current DOM at that moment — no caching.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action !== 'extract') return;

    const url = window.location.href;
    console.log('[RoleRadar:content] Extract request received, URL:', url);

    const result = {
      jobId:       extractJobId(url),
      title:       tryText(TITLE_SELECTORS),
      company:     tryText(COMPANY_SELECTORS),
      location:    tryText(LOCATION_SELECTORS),
      description: tryText(DESC_SELECTORS),
      truncated:   isTruncated(),
    };

    console.log('[RoleRadar:content] Extract result:', {
      jobId:             result.jobId,
      title:             result.title?.slice(0, 50),
      company:           result.company,
      locationLength:    result.location?.length ?? 0,
      descriptionLength: result.description?.length ?? 0,
      truncated:         result.truncated,
    });

    sendResponse(result);
    return true; // Keep message channel open
  });
} else {
  console.log('[RoleRadar:content] Already injected — skipping listener re-registration');
}
