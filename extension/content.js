// content.js — injected into linkedin.com/jobs/*
// Reads the current DOM on demand (no caching). Safe to call multiple times.
//
// Double-injection guard: popup may inject programmatically even when the
// manifest already injected declaratively. Only one listener registers per tab.

// ── Selector lists (tried in order, first match wins) ───────────────────────

const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title h1',
  '.jobs-unified-top-card__job-title h1',
  'h1.t-24.t-bold.inline',
  'h1.t-24',
  'h1[data-test-job-title]',
  '.topcard__title',
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
  '.jobs-unified-top-card__primary-description .tvm__text',
  '.jobs-unified-top-card__bullet',
  '.job-details-jobs-unified-top-card__bullet',
  '.topcard__flavor--bullet',
  '.jobs-unified-top-card__workplace-type',
  '.artdeco-entity-lockup__caption',
];

const DESC_SELECTORS = [
  '#job-details',
  '.jobs-description-content__text',
  '.jobs-description__content .jobs-description-content__text',
  '.jobs-box__html-content',
  '.description__text--rich',
  '.description__text',
  '.jobs-description',
  '.scaffold-layout__detail .jobs-description-content',
];

const SHOW_MORE_SELECTORS = [
  '.jobs-description__footer-button',
  'button.jobs-description__footer-button',
  'button[aria-label*="Show more"]',
  'button[aria-label*="Tout afficher"]',
  'button[aria-label*="more"]',
];

// Panels that contain job details on search-results pages
const DETAIL_PANEL_SELECTORS = [
  '.jobs-search__job-details--container',
  '.scaffold-layout__detail',
  '.jobs-search-two-pane__detail-view',
  '.job-view-layout',
  '[data-test-id="job-detail-view"]',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isVisible(el) {
  try {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
  } catch { return false; }
}

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
  try {
    const p = new URL(url).searchParams.get('currentJobId');
    if (p && /^\d+$/.test(p)) return p;
  } catch {}
  const m = url.match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

// ── Improved extraction with broad fallbacks ─────────────────────────────────

function extractTitle() {
  // 1. Specific class-based selectors
  const fromSel = tryText(TITLE_SELECTORS);
  if (fromSel) return fromSel;

  // 2. Any visible h1 on the page
  for (const el of document.querySelectorAll('h1')) {
    if (!isVisible(el)) continue;
    const text = (el.innerText || '').trim();
    if (text && text.length < 200) {
      console.log('[RoleRadar:content] Title from visible h1:', text.slice(0, 60));
      return text;
    }
  }

  // 3. document.title — LinkedIn format: "Title - Company | LinkedIn"
  //    or "Title chez Company | LinkedIn"
  const dt = document.title;
  if (dt) {
    for (const sep of [' | ', ' – ', ' - ']) {
      const i = dt.indexOf(sep);
      if (i > 0) {
        const part = dt.slice(0, i).trim();
        // Strip trailing company from "Title chez Company"
        const chezMatch = part.match(/^(.+?) (?:chez|at|@) .+$/);
        return chezMatch ? chezMatch[1].trim() : part;
      }
    }
  }

  return null;
}

function extractCompany() {
  // 1. Specific selectors (company link in top card)
  const fromSel = tryText(COMPANY_SELECTORS);
  if (fromSel) return fromSel;

  // 2. Any visible link to a /company/ path near the top
  for (const el of document.querySelectorAll('a[href*="/company/"]')) {
    if (!isVisible(el)) continue;
    const text = (el.innerText || '').trim();
    if (text && text.length < 100 && !text.includes('\n')) {
      console.log('[RoleRadar:content] Company from /company/ link:', text);
      return text;
    }
  }

  // 3. Parse from document.title: "Title chez Company | LinkedIn"
  //    or "Title - Company | LinkedIn"
  const dt = document.title;
  if (dt) {
    const chezMatch = dt.match(/^.+? (?:chez|at|@) (.+?)(?:\s*[|–]|$)/);
    if (chezMatch) return chezMatch[1].trim();

    // "Title - Company | LinkedIn" → second segment before " | "
    const parts = dt.split(' | ');
    if (parts.length >= 2) {
      const seg0 = parts[0];
      const dashParts = seg0.split(' - ');
      if (dashParts.length >= 2) return dashParts[dashParts.length - 1].trim();
    }
  }

  return null;
}

function extractLocation() {
  // 1. Specific selectors
  const fromSel = tryText(LOCATION_SELECTORS);
  if (fromSel) return fromSel;

  // 2. Second .tvm__text element (first = company name, second = location on LinkedIn)
  const tvmEls = [...document.querySelectorAll('.tvm__text')].filter(isVisible);
  if (tvmEls.length >= 2) {
    const text = (tvmEls[1].innerText || '').trim();
    if (text) {
      console.log('[RoleRadar:content] Location from tvm__text[1]:', text);
      return text;
    }
  }

  return null;
}

function extractDescription() {
  // 1. Specific selectors — require meaningful length
  for (const sel of DESC_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.innerText || '').trim();
        if (text.length > 80) return text;
      }
    } catch {}
  }

  // 2. Any section whose heading contains "About the job" / "À propos…"
  const ABOUT_MARKERS = [
    "À propos de l'offre d'emploi",
    "À propos du poste",
    "À propos de l'offre",
    "About the job",
    "About this job",
    "Description du poste",
    "Job details",
  ];
  for (const marker of ABOUT_MARKERS) {
    for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,div,span')) {
      const ht = (heading.innerText || heading.textContent || '').trim();
      if (ht !== marker && !ht.startsWith(marker + '\n')) continue;

      // Try the parent container's full text
      const parentText = heading.parentElement?.innerText?.trim();
      if (parentText && parentText.length > 200) {
        console.log('[RoleRadar:content] Description from About section via parent');
        return parentText.slice(0, 10000);
      }
      // Try next siblings
      let sib = heading.nextElementSibling;
      while (sib) {
        const st = sib.innerText?.trim();
        if (st && st.length > 100) {
          console.log('[RoleRadar:content] Description from About section next-sibling');
          return st.slice(0, 10000);
        }
        sib = sib.nextElementSibling;
      }
    }
  }

  // 3. Largest text block inside the known detail panels
  let bestText = '', bestLen = 0;
  for (const panelSel of DETAIL_PANEL_SELECTORS) {
    const panel = document.querySelector(panelSel);
    if (!panel) continue;
    for (const el of panel.querySelectorAll('div,section,article,p')) {
      if (el.children.length > 6) continue; // skip layout wrappers
      const text = (el.innerText || '').trim();
      if (text.length > bestLen && text.length > 200 && text.length < 20000) {
        bestLen = text.length;
        bestText = text;
      }
    }
    if (bestText) break;
  }
  if (bestText) {
    console.log('[RoleRadar:content] Description from largest detail-panel block, len:', bestLen);
    return bestText;
  }

  return null;
}

function isTruncated() {
  for (const sel of SHOW_MORE_SELECTORS) {
    try {
      const btn = document.querySelector(sel);
      if (btn && isVisible(btn)) {
        console.log('[RoleRadar:content] Truncation button visible:', sel, btn.innerText.trim().slice(0, 40));
        return true;
      }
    } catch (e) {
      console.warn('[RoleRadar:content] Truncation selector error:', sel, e.message);
    }
  }
  return false;
}

// ── DOM reconnaissance payload ────────────────────────────────────────────────
// Returns a structured snapshot of the page for selector debugging.

function collectDomDebug() {
  function texts(sel) {
    return [...document.querySelectorAll(sel)]
      .filter(isVisible)
      .map(el => (el.innerText || '').trim())
      .filter(Boolean);
  }

  const KEYWORDS = [
    'À propos', "offre d'emploi", 'emploi', 'Postuler', 'Enregistrer',
    'Temps plein', 'Candidature', 'About the job', 'Apply', 'Save',
    'location', 'company',
  ];

  const candidates = [];
  const seenKeys = new Set();

  for (const kw of KEYWORDS) {
    if (candidates.length >= 50) break;
    for (const el of document.querySelectorAll('h1,h2,h3,h4,span,div,p,li,button,a')) {
      if (candidates.length >= 50) break;
      try {
        const own = (el.innerText || '').trim();
        if (!own.includes(kw) || own.length > 500 || el.children.length > 5) continue;
        const key = el.tagName + '|' + (el.className || '').slice(0, 50) + '|' + own.slice(0, 30);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        candidates.push({
          kw,
          tag: el.tagName,
          cls: (el.className || '').slice(0, 120),
          id: el.id || '',
          text: own.slice(0, 250),
        });
      } catch {}
    }
  }

  return {
    href:      window.location.href,
    docTitle:  document.title,
    bodyText:  (document.body.innerText || '').slice(0, 3000),
    h1s:       texts('h1'),
    h2s:       texts('h2').slice(0, 15),
    h3s:       texts('h3').slice(0, 15),
    buttons:   texts('button').slice(0, 25),
    links:     [...document.querySelectorAll('a[href]')]
                 .filter(el => (el.innerText || '').trim())
                 .slice(0, 30)
                 .map(el => ({
                   text: (el.innerText || '').trim().slice(0, 80),
                   href: (el.href  || '').slice(0, 150),
                 })),
    candidates,
  };
}

// ── Message listener (registered once per tab) ────────────────────────────────

if (!window.__roleradarInjected) {
  window.__roleradarInjected = true;
  console.log('[RoleRadar:content] Listener registered on', window.location.href);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // ── extract ──────────────────────────────────────────────────────────────
    if (msg.action === 'extract') {
      const url = window.location.href;
      console.log('[RoleRadar:content] Extract request, URL:', url);

      const result = {
        jobId:       extractJobId(url),
        title:       extractTitle(),
        company:     extractCompany(),
        location:    extractLocation(),
        description: extractDescription(),
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
      return true;
    }

    // ── dom_debug ─────────────────────────────────────────────────────────────
    if (msg.action === 'dom_debug') {
      console.log('[RoleRadar:content] DOM debug request');
      try {
        sendResponse({ ok: true, payload: collectDomDebug() });
      } catch (e) {
        console.error('[RoleRadar:content] dom_debug error:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }
  });

} else {
  console.log('[RoleRadar:content] Already injected — skipping listener re-registration');
}
