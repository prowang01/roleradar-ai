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

const DETAIL_PANEL_SELECTORS = [
  '.jobs-search__job-details--container',
  '.scaffold-layout__detail',
  '.jobs-search-two-pane__detail-view',
  '.job-view-layout',
  '[data-test-id="job-detail-view"]',
];

// Strict start markers — only genuine "About the job" headings.
const DESC_START_MARKERS = [
  "À propos de l’offre d’emploi",  // typographic apostrophes (U+2019)
  "À propos de l’offre d’emploi",             // straight apostrophes
  "About the job",
  "About this job",
];

// LinkedIn-generated noise sections that follow the job description.
// Matched as line-prefixes (a line that STARTS WITH the marker triggers the cut),
// so "Des recherches d’emploi plus rapides avec Premium" is caught by the shorter marker.
// Generic author-written headings (Benefits, What we offer, Perks) are intentionally absent.
const DESC_END_MARKERS = [
  // French — LinkedIn Premium upsell
  "Des recherches d’emploi plus rapides",   // typographic apostrophe
  "Des recherches d’emploi plus rapides",   // straight apostrophe
  "Découvrez comment vous vous positionnez",
  "Découvrez comment vous vous positionnez",
  "Accédez à des informations exclusives",
  "Accédez à des informations exclusives",
  "Accéder aux données de recrutement",
  "Niveau de formation des candidats",
  "Essayer Premium",
  // French — LinkedIn-generated sections
  "À propos de l’entreprise",
  "À propos de l’entreprise",
  "Personnes que vous pouvez contacter",
  "Rencontrez l’équipe",
  "Rencontrez l’équipe",
  "Rencontrez l’equipe",
  "Voir plus d’offres",
  "Voir plus d’offres",
  "En savoir plus sur l’entreprise",
  "En savoir plus sur l’entreprise",
  // French — LinkedIn-generated benefits block (never author-written)
  "Avantages trouvés dans l’offre d’emploi",
  "Avantages trouvés dans l’offre d’emploi",
  // English — LinkedIn Premium upsell
  "Faster job searches",
  "See how you compare",
  "Try Premium",
  // English — LinkedIn-generated sections
  "About the company",
  "People you can contact",
  "Meet the hiring team",
  "More jobs",
  "Learn more about the company",
];

// Premium insight card markers — blocks starting with these are the premium card,
// not the job description. Used in the fallback to skip them entirely.
const PREMIUM_BLOCK_MARKERS = [
  "Accéder aux données de recrutement",
  "Niveau de formation des candidats",
  "Essayer Premium",
];

// Standalone UI fragments to strip from extracted description text.
const DESC_NOISE_LINES_RE = /^(plus|voir plus|show more|tout afficher|see more|afficher moins|show less)$/i;

// Trailing LinkedIn UI fragments appended after truncated text.
const DESC_TRAILING_PLUS_RE = /\s*(\.\.\.\s*plus|plus\s*\.\.\.|\bplus|\.\.\.)\s*$/i;

// Noise lines to skip when scanning bodyText for location
const LOCATION_NOISE_RE = /^(Postuler|Apply now|Apply|Enregistrer|Save|Suivre|Follow|Se connecter|Connect|Message|Partager|Share|Signaler|Report|Promoted|Sponsorisé|\d+ candidat|\d+ applicant|Easy Apply|Candidature simplifiée)$/i;

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

// ── Job ID ────────────────────────────────────────────────────────────────────

function extractJobId(url) {
  // 1. currentJobId query param
  try {
    const p = new URL(url).searchParams.get('currentJobId');
    if (p && /^\d+$/.test(p)) return p;
  } catch {}
  // 2. /jobs/view/{id} in the current URL
  const m = url.match(/\/jobs\/view\/(\d+)/);
  if (m) return m[1];
  // 3. First link whose href contains /jobs/view/{id}
  for (const el of document.querySelectorAll('a[href*="/jobs/view/"]')) {
    const hm = (el.href || '').match(/\/jobs\/view\/(\d+)/);
    if (hm) return hm[1];
  }
  return null;
}

// ── Title ─────────────────────────────────────────────────────────────────────
// Returns { value: string|null, source: string|null }

function extractTitle(jobId) {
  // 1. Specific class-based selectors
  const fromSel = tryText(TITLE_SELECTORS);
  if (fromSel) return { value: fromSel, source: 'selector' };

  // 2. Any visible h1
  for (const el of document.querySelectorAll('h1')) {
    if (!isVisible(el)) continue;
    const text = (el.innerText || '').trim();
    if (text && text.length < 200) {
      console.log('[RoleRadar:content] Title from visible h1:', text.slice(0, 60));
      return { value: text, source: 'h1' };
    }
  }

  // 3. Job link text matching /jobs/view/{jobId}
  const jobLinkSel = jobId ? `a[href*="/jobs/view/${jobId}"]` : 'a[href*="/jobs/view/"]';
  for (const el of document.querySelectorAll(jobLinkSel)) {
    const text = (el.innerText || '').trim();
    if (text && text.length < 200 && !text.includes('\n')) {
      console.log('[RoleRadar:content] Title from job link:', text.slice(0, 60));
      return { value: text, source: 'job-link' };
    }
  }

  // 4. docTitle: "Title | Company | LinkedIn" → first segment before " | "
  const dt = document.title;
  if (dt) {
    const pipeIdx = dt.indexOf(' | ');
    if (pipeIdx > 0) {
      const part = dt.slice(0, pipeIdx).trim();
      if (part && part !== 'LinkedIn') {
        console.log('[RoleRadar:content] Title from docTitle:', part.slice(0, 60));
        return { value: part, source: 'docTitle' };
      }
    }
    for (const sep of [' – ', ' - ']) {
      const i = dt.indexOf(sep);
      if (i > 0) {
        const part = dt.slice(0, i).trim();
        if (part && part !== 'LinkedIn') return { value: part, source: 'docTitle' };
      }
    }
  }

  // 5. bodyText "Sélectionné, Title" pattern
  const bodyText = document.body?.innerText || '';
  const selMatch = bodyText.match(/S(?:é|e)lectionn(?:é|e)[,\s]+(.+)/);
  if (selMatch) {
    const text = selMatch[1].trim().split('\n')[0].trim();
    if (text && text.length < 200) {
      console.log('[RoleRadar:content] Title from bodyText selected block:', text.slice(0, 60));
      return { value: text, source: 'bodyText' };
    }
  }

  return { value: null, source: null };
}

// ── Company ───────────────────────────────────────────────────────────────────
// Returns { value: string|null, source: string|null }

function extractCompany(title) {
  // 1. Specific selectors
  const fromSel = tryText(COMPANY_SELECTORS);
  if (fromSel) return { value: fromSel, source: 'selector' };

  // 2. First visible /company/ link with short, single-line text
  for (const el of document.querySelectorAll('a[href*="/company/"]')) {
    if (!isVisible(el)) continue;
    const text = (el.innerText || '').trim();
    if (text && text.length < 100 && !text.includes('\n')) {
      console.log('[RoleRadar:content] Company from /company/ link:', text);
      return { value: text, source: 'company-link' };
    }
  }

  // 3. docTitle: "Title | Company | LinkedIn" → second segment
  const dt = document.title;
  if (dt) {
    const parts = dt.split(' | ');
    if (parts.length >= 2) {
      const company = parts[1].trim();
      if (company && company !== 'LinkedIn') {
        console.log('[RoleRadar:content] Company from docTitle second segment:', company);
        return { value: company, source: 'docTitle' };
      }
    }
    // "Title chez Company | LinkedIn" format
    const chezMatch = dt.match(/^.+? (?:chez|at|@) (.+?)(?:\s*[|–\-]|$)/);
    if (chezMatch) {
      const company = chezMatch[1].trim();
      if (company && company !== 'LinkedIn') {
        console.log('[RoleRadar:content] Company from docTitle chez:', company);
        return { value: company, source: 'docTitle-chez' };
      }
    }
  }

  // 4. bodyText: first non-empty line after the title
  if (title) {
    const bodyText = document.body?.innerText || '';
    const titleIdx = bodyText.indexOf(title);
    if (titleIdx >= 0) {
      const after = bodyText.slice(titleIdx + title.length);
      const lines = after.split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (t && t.length < 100 && t !== title && !LOCATION_NOISE_RE.test(t)) {
          console.log('[RoleRadar:content] Company from bodyText after title:', t);
          return { value: t, source: 'bodyText' };
        }
      }
    }
  }

  return { value: null, source: null };
}

// ── Location ──────────────────────────────────────────────────────────────────
// Returns { value: string|null, source: string|null }

function extractLocation(title, company) {
  // 1. Specific selectors
  const fromSel = tryText(LOCATION_SELECTORS);
  if (fromSel) return { value: fromSel, source: 'selector' };

  // 2. Second visible .tvm__text element (first = company, second = location on LinkedIn)
  const tvmEls = [...document.querySelectorAll('.tvm__text')].filter(isVisible);
  if (tvmEls.length >= 2) {
    const text = (tvmEls[1].innerText || '').trim();
    if (text) {
      console.log('[RoleRadar:content] Location from tvm__text[1]:', text);
      return { value: text, source: 'tvm' };
    }
  }

  // 3. bodyText: first non-noise line after title then company
  if (title && company) {
    const bodyText = document.body?.innerText || '';
    const titleIdx = bodyText.indexOf(title);
    if (titleIdx >= 0) {
      const afterTitle = bodyText.slice(titleIdx + title.length);
      const compIdx = afterTitle.indexOf(company);
      if (compIdx >= 0) {
        const afterComp = afterTitle.slice(compIdx + company.length);
        const lines = afterComp.split('\n');
        for (const line of lines) {
          const t = line.trim();
          if (t && t.length > 1 && t.length < 100 && !LOCATION_NOISE_RE.test(t) && t !== title && t !== company) {
            console.log('[RoleRadar:content] Location from bodyText after company:', t);
            return { value: t, source: 'bodyText' };
          }
        }
      }
    }
  }

  return { value: null, source: null };
}

// ── Description ───────────────────────────────────────────────────────────────
// Returns { value, source, startMarker, endMarker, rawLength, cleanLength }
// All fields may be null when nothing is found.

function cleanDescription(raw) {
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')                 // collapse excess blank lines
    .replace(/^[ \t]+|[ \t]+$/gm, '')            // trim each line's leading/trailing spaces
    .replace(DESC_NOISE_LINES_RE, '')             // nuke standalone UI fragments (single line)
    .split('\n')
    .filter((line, i, arr) => {                  // remove redundant noise lines
      if (!DESC_NOISE_LINES_RE.test(line.trim())) return true;
      return false;
    })
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  text = text.replace(DESC_TRAILING_PLUS_RE, '').trim();
  return text;
}

// Escape special regex characters in a literal string.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cut text at the first end marker whose text appears at the START of a line.
// "Starts with" semantics: "Des recherches d'emploi plus rapides avec Premium" is caught
// by the marker "Des recherches d'emploi plus rapides".
// Mid-sentence occurrences are ignored because the marker must begin at a line boundary.
function sliceByEndMarkers(text) {
  let endIdx = text.length;
  let foundEnd = null;
  for (const marker of DESC_END_MARKERS) {
    const re = new RegExp('(?:^|\\n)[ \\t]*' + escapeRegex(marker), 'i');
    const m = re.exec(text);
    if (m && m.index < endIdx) {
      endIdx = m.index;
      foundEnd = marker;
    }
  }
  return { sliced: text.slice(0, endIdx), endMarker: foundEnd };
}

function extractDescription() {
  // 1. Specific DOM selectors — apply end-marker slicing so DOM results are also clean
  for (const sel of DESC_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = (el.innerText || '').trim();
      if (raw.length <= 80) continue;
      const { sliced, endMarker } = sliceByEndMarkers(raw);
      const clean = cleanDescription(sliced);
      if (clean.length > 50) {
        console.log('[RoleRadar:content] Description from selector:', sel, 'len:', clean.length);
        return { value: clean.slice(0, 10000), source: 'selector',
                 startMarker: sel, endMarker, rawLength: raw.length, cleanLength: clean.length };
      }
    } catch {}
  }

  // 2. DOM: element whose text exactly matches a start marker
  for (const marker of DESC_START_MARKERS) {
    for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,div,span')) {
      const ht = (heading.innerText || heading.textContent || '').trim();
      if (ht !== marker && !ht.startsWith(marker + '\n')) continue;

      // Try parent container first
      const parentRaw = heading.parentElement?.innerText?.trim() || '';
      if (parentRaw.length > 200) {
        const stripped = parentRaw.startsWith(marker)
          ? parentRaw.slice(marker.length).trimStart() : parentRaw;
        const { sliced, endMarker } = sliceByEndMarkers(stripped);
        const clean = cleanDescription(sliced);
        if (clean.length > 80) {
          console.log('[RoleRadar:content] Description from DOM section (parent), marker:', marker);
          return { value: clean.slice(0, 10000), source: 'dom-section',
                   startMarker: marker, endMarker, rawLength: stripped.length, cleanLength: clean.length };
        }
      }

      // Try next siblings
      let sib = heading.nextElementSibling;
      while (sib) {
        const sibRaw = sib.innerText?.trim() || '';
        if (sibRaw.length > 100) {
          const { sliced, endMarker } = sliceByEndMarkers(sibRaw);
          const clean = cleanDescription(sliced);
          if (clean.length > 50) {
            console.log('[RoleRadar:content] Description from DOM section (sibling), marker:', marker);
            return { value: clean.slice(0, 10000), source: 'dom-sibling',
                     startMarker: marker, endMarker, rawLength: sibRaw.length, cleanLength: clean.length };
          }
        }
        sib = sib.nextElementSibling;
      }
    }
  }

  // 3. bodyText: slice between start and end markers
  const bodyText = document.body?.innerText || '';
  let startIdx = -1;
  let startMarkerLen = 0;
  let foundStart = null;
  for (const marker of DESC_START_MARKERS) {
    const idx = bodyText.indexOf(marker);
    if (idx >= 0 && (startIdx < 0 || idx < startIdx)) {
      startIdx = idx;
      startMarkerLen = marker.length;
      foundStart = marker;
    }
  }
  if (startIdx >= 0) {
    const afterStart = bodyText.slice(startIdx + startMarkerLen).trimStart();
    const { sliced, endMarker } = sliceByEndMarkers(afterStart);
    const clean = cleanDescription(sliced);
    if (clean.length > 50) {
      console.log('[RoleRadar:content] Description from bodyText section, start:', foundStart,
                  'end:', endMarker, 'cleanLen:', clean.length);
      return { value: clean.slice(0, 10000), source: 'bodyText-section',
               startMarker: foundStart, endMarker, rawLength: sliced.length, cleanLength: clean.length };
    }
  }

  // 4. Largest text block inside known detail panels (last resort)
  let bestText = '', bestLen = 0;
  for (const panelSel of DETAIL_PANEL_SELECTORS) {
    const panel = document.querySelector(panelSel);
    if (!panel) continue;
    for (const el of panel.querySelectorAll('div,section,article,p')) {
      if (el.children.length > 6) continue;
      const text = (el.innerText || '').trim();
      if (text.length > bestLen && text.length > 200 && text.length < 20000) {
        if (PREMIUM_BLOCK_MARKERS.some(m => text.startsWith(m))) continue;
        bestLen = text.length;
        bestText = text;
      }
    }
    if (bestText) break;
  }
  if (bestText) {
    const { sliced, endMarker } = sliceByEndMarkers(bestText);
    const clean = cleanDescription(sliced);
    if (clean.length > 50) {
      console.log('[RoleRadar:content] Description from panel-largest, cleanLen:', clean.length);
      return { value: clean.slice(0, 10000), source: 'panel-largest',
               startMarker: null, endMarker, rawLength: bestText.length, cleanLength: clean.length };
    }
  }

  return { value: null, source: null, startMarker: null, endMarker: null, rawLength: null, cleanLength: null };
}

// ── Truncation check ──────────────────────────────────────────────────────────

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

      const jobId       = extractJobId(url);
      const titleRes    = extractTitle(jobId);
      const companyRes  = extractCompany(titleRes.value);
      const locationRes = extractLocation(titleRes.value, companyRes.value);
      const descRes     = extractDescription();

      const result = {
        jobId,
        title:                   titleRes.value,
        titleSource:             titleRes.source,
        company:                 companyRes.value,
        companySource:           companyRes.source,
        location:                locationRes.value,
        locationSource:          locationRes.source,
        description:             descRes.value,
        descriptionSource:       descRes.source,
        descriptionStartMarker:  descRes.startMarker,
        descriptionEndMarker:    descRes.endMarker,
        descriptionRawLength:    descRes.rawLength,
        descriptionCleanLength:  descRes.cleanLength,
        truncated:               isTruncated(),
      };

      console.log('[RoleRadar:content] Extract result:', {
        jobId,
        title:                  result.title?.slice(0, 50),
        titleSource:            result.titleSource,
        company:                result.company,
        companySource:          result.companySource,
        locationSource:         result.locationSource,
        descriptionSource:      result.descriptionSource,
        descriptionStartMarker: result.descriptionStartMarker,
        descriptionEndMarker:   result.descriptionEndMarker,
        descriptionRawLength:   result.descriptionRawLength,
        descriptionCleanLength: result.descriptionCleanLength,
        truncated:              result.truncated,
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
