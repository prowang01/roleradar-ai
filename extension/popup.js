// popup.js — popup lifecycle, extraction, backend lookup, and user actions.
// Each popup open is a fresh JS context — no state persists between opens.

const API = 'http://localhost:8000';

// ── Runtime state ────────────────────────────────────────────────────────────

const state = {
  tabId:         null,
  url:           null,
  externalJobId: null,
  backendJob:    null,
};

// Debug info object — updated at every key step and rendered to the panel.
const debugInfo = {
  activeTabUrl:           null,
  isJobPage:              null,
  contentScriptAvailable: null,
  injectionAttempted:     false,
  injectionSucceeded:     null,
  extractSucceeded:       null,
  jobId:                  null,
  title:                  null,
  titleSource:            null,
  company:                null,
  companySource:          null,
  location:               null,
  locationSource:         null,
  descriptionLength:      null,
  descriptionSource:      null,
  descriptionStartMarker: null,
  descriptionEndMarker:   null,
  descriptionRawLength:   null,
  descriptionCleanLength: null,
  descriptionNoise:       null,
  isTruncated:            null,
  lastError:              null,
};

// ── Verdict display config ────────────────────────────────────────────────────

const VERDICT_LABELS = {
  strong_apply:     'Strong Apply',
  apply:            'Apply',
  apply_as_stretch: 'Stretch Apply',
  apply_only_if:    'Apply If',
  maybe:            'Maybe',
  skip:             'Skip',
  hard_skip:        'Hard Skip',
};

const VERDICT_COLORS = {
  strong_apply:     { bg: '#dcfce7', color: '#166534' },
  apply:            { bg: '#dbeafe', color: '#1e40af' },
  apply_as_stretch: { bg: '#eef2ff', color: '#4338ca' },
  apply_only_if:    { bg: '#fef3c7', color: '#92400e' },
  maybe:            { bg: '#f1f5f9', color: '#374151' },
  skip:             { bg: '#fee2e2', color: '#991b1b' },
  hard_skip:        { bg: '#ffe4e6', color: '#9f1239' },
};

// ── DOM refs ─────────────────────────────────────────────────────────────────

let elBadge, elWarning, elExtractMsg, elStatusMsg, elDebugRows;
let elTitle, elCompany, elLocation, elDesc;
let btnRefresh, btnSave, btnApplied, btnAnalyze, btnDebugExtract;
let btnCopyDom, elDomDebugStatus, elDomDebugOut;
let elAnalysisCard, elAcVerdictBadge, elAcScore, elAcAction, elAcSummary;
let elDebugWrapper, btnToggleDebug, btnOpenDashboard, btnViewDetails;

document.addEventListener('DOMContentLoaded', async () => {
  elBadge          = document.getElementById('badge');
  elWarning        = document.getElementById('warning');
  elExtractMsg     = document.getElementById('extract-msg');
  elStatusMsg      = document.getElementById('status-msg');
  elDebugRows      = document.getElementById('debug-rows');
  elTitle          = document.getElementById('f-title');
  elCompany        = document.getElementById('f-company');
  elLocation       = document.getElementById('f-location');
  elDesc           = document.getElementById('f-desc');
  btnRefresh       = document.getElementById('btn-refresh');
  btnSave          = document.getElementById('btn-save');
  btnApplied       = document.getElementById('btn-applied');
  btnAnalyze       = document.getElementById('btn-analyze');
  btnDebugExtract  = document.getElementById('btn-debug-extract');
  btnCopyDom       = document.getElementById('btn-copy-dom');
  elDomDebugStatus = document.getElementById('dom-debug-status');
  elDomDebugOut    = document.getElementById('dom-debug-out');

  elAnalysisCard   = document.getElementById('analysis-card');
  elAcVerdictBadge = document.getElementById('ac-verdict-badge');
  elAcScore        = document.getElementById('ac-score');
  elAcAction       = document.getElementById('ac-action');
  elAcSummary      = document.getElementById('ac-summary');
  elDebugWrapper   = document.getElementById('debug-wrapper');
  btnToggleDebug   = document.getElementById('btn-toggle-debug');
  btnOpenDashboard = document.getElementById('btn-open-dashboard');
  btnViewDetails   = document.getElementById('btn-view-details');

  btnRefresh.addEventListener('click', onRefresh);
  btnSave.addEventListener('click', onSave);
  btnApplied.addEventListener('click', onApplied);
  btnAnalyze.addEventListener('click', onAnalyze);
  btnDebugExtract.addEventListener('click', onDebugExtract);
  btnCopyDom.addEventListener('click', onCopyDom);
  btnToggleDebug.addEventListener('click', onToggleDebug);
  btnOpenDashboard.addEventListener('click', onOpenDashboard);
  btnViewDetails.addEventListener('click', onViewDetails);

  renderDebugPanel(); // show initial —/— state
  await init();
});

// ── Initialization ────────────────────────────────────────────────────────────

async function init() {
  console.log('[RoleRadar] Popup opened');

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    debugInfo.lastError = 'No active tab found';
    renderDebugPanel();
    setExtractMsg('error', 'No active tab found.');
    setActionButtons(false);
    return;
  }

  state.tabId = tab.id;
  state.url   = tab.url;
  debugInfo.activeTabUrl = tab.url;
  debugInfo.isJobPage    = isJobPage(tab.url);
  renderDebugPanel();

  console.log('[RoleRadar] Active tab:', { id: tab.id, url: tab.url });
  console.log('[RoleRadar] isJobPage:', debugInfo.isJobPage);

  if (!debugInfo.isJobPage) {
    setBadge('—', '');
    setExtractMsg('error', 'Open a LinkedIn job listing to use RoleRadar.');
    setActionButtons(false);
    btnRefresh.disabled      = true;
    btnDebugExtract.disabled = true;
    return;
  }

  await extractFromTab();
  await lookupBackend();
  refreshBadge();
}

function isJobPage(url) {
  if (!url) return false;
  return url.includes('linkedin.com/jobs/');
}

// ── Debug toggle ──────────────────────────────────────────────────────────────

function onToggleDebug() {
  const isOpen = elDebugWrapper.style.display !== 'none';
  elDebugWrapper.style.display = isOpen ? 'none' : 'block';
  btnToggleDebug.textContent   = isOpen ? 'Show debug ▾' : 'Hide debug ▴';
}

// ── Extraction ────────────────────────────────────────────────────────────────
// Always reads the live DOM — no caching. Called on popup open, ↺ Refresh, and
// Debug Extract. Updates debugInfo at every intermediate step.

async function extractFromTab() {
  // Guard: only attempt extraction on LinkedIn job pages.
  if (!state.url || !state.url.includes('linkedin.com/jobs/')) {
    setExtractMsg('error', 'Open a LinkedIn job page to use RoleRadar.');
    setActionButtons(false);
    return;
  }

  setExtractMsg('loading', 'Extracting job…');
  clearWarning();

  // Reset extraction fields so stale values aren't shown during the new run.
  debugInfo.contentScriptAvailable = null;
  debugInfo.injectionAttempted     = false;
  debugInfo.injectionSucceeded     = null;
  debugInfo.extractSucceeded       = null;
  debugInfo.titleSource            = null;
  debugInfo.companySource          = null;
  debugInfo.locationSource         = null;
  debugInfo.descriptionSource      = null;
  debugInfo.descriptionStartMarker = null;
  debugInfo.descriptionEndMarker   = null;
  debugInfo.descriptionRawLength   = null;
  debugInfo.descriptionCleanLength = null;
  debugInfo.descriptionNoise       = null;
  debugInfo.lastError              = null;
  renderDebugPanel();

  console.log('[RoleRadar] Sending extract message to tab', state.tabId, 'URL:', state.url);

  let data;
  let usedInjection = false;

  // ── Attempt 1: send message to existing content script ──────────────────
  try {
    data = await chrome.tabs.sendMessage(state.tabId, { action: 'extract' });
    debugInfo.contentScriptAvailable = true;
    renderDebugPanel();
    console.log('[RoleRadar] Content script was already available (declarative injection)');
  } catch (firstErr) {
    debugInfo.contentScriptAvailable = false;
    renderDebugPanel();

    const isNoReceiver =
      firstErr.message?.includes('Could not establish connection') ||
      firstErr.message?.includes('Receiving end does not exist');

    if (!isNoReceiver) {
      // Unexpected error — not a missing-script problem.
      debugInfo.extractSucceeded = false;
      debugInfo.lastError = firstErr.message;
      renderDebugPanel();
      console.warn('[RoleRadar] sendMessage unexpected error:', firstErr.message);
      setExtractMsg('error', 'sendMessage error: ' + firstErr.message);
      return;
    }

    // Expected: content script not yet running. Try programmatic injection.
    console.log('[RoleRadar] Content script not ready — injecting programmatically');
    debugInfo.injectionAttempted = true;
    renderDebugPanel();

    // ── Attempt 2a: inject content.js ────────────────────────────────────
    try {
      await chrome.scripting.executeScript({
        target: { tabId: state.tabId },
        files: ['content.js'],
      });
      usedInjection = true;
      debugInfo.injectionSucceeded = true;
      renderDebugPanel();
      console.log('[RoleRadar] Injection successful — retrying sendMessage');
    } catch (injectErr) {
      debugInfo.injectionSucceeded = false;
      debugInfo.extractSucceeded   = false;
      debugInfo.lastError          = injectErr.message;
      renderDebugPanel();
      console.warn('[RoleRadar] Injection failed:', injectErr.message);
      showWarning('Content script not available. Reload the LinkedIn job tab and try again.');
      setExtractMsg('error', 'Content script not available — reload the tab.');
      return;
    }

    // ── Attempt 2b: retry sendMessage after injection ─────────────────────
    try {
      data = await chrome.tabs.sendMessage(state.tabId, { action: 'extract' });
    } catch (retryErr) {
      debugInfo.extractSucceeded = false;
      debugInfo.lastError        = retryErr.message;
      renderDebugPanel();
      console.warn('[RoleRadar] sendMessage retry failed after injection:', retryErr.message);
      showWarning('Content script not available. Reload the LinkedIn job tab and try again.');
      setExtractMsg('error', 'Content script not responding — reload the tab.');
      return;
    }
  }

  // ── Handle response ───────────────────────────────────────────────────────
  const tag = usedInjection ? ' (after injection)' : '';
  console.log('[RoleRadar] Extract response received' + tag + ':', {
    jobId:             data?.jobId,
    title:             data?.title?.slice(0, 50),
    company:           data?.company,
    locationLength:    data?.location?.length ?? 0,
    descriptionLength: data?.description?.length ?? 0,
    truncated:         data?.truncated,
  });

  if (!data) {
    debugInfo.extractSucceeded = false;
    debugInfo.lastError = 'sendMessage returned null/undefined';
    renderDebugPanel();
    setExtractMsg('error', 'Could not extract job — empty response from page.');
    return;
  }

  debugInfo.extractSucceeded  = true;
  debugInfo.jobId             = data.jobId    ?? null;
  debugInfo.title             = data.title    ?? null;
  debugInfo.titleSource       = data.titleSource       ?? null;
  debugInfo.company           = data.company  ?? null;
  debugInfo.companySource     = data.companySource     ?? null;
  debugInfo.location          = data.location ?? null;
  debugInfo.locationSource    = data.locationSource    ?? null;
  debugInfo.descriptionLength      = data.description?.length ?? 0;
  debugInfo.descriptionSource      = data.descriptionSource      ?? null;
  debugInfo.descriptionStartMarker = data.descriptionStartMarker ?? null;
  debugInfo.descriptionEndMarker   = data.descriptionEndMarker   ?? null;
  debugInfo.descriptionRawLength   = data.descriptionRawLength   ?? null;
  debugInfo.descriptionCleanLength = data.descriptionCleanLength ?? null;
  debugInfo.isTruncated            = data.truncated ?? null;

  const NOISE_INDICATORS = [
    'Premium', 'Personnes que vous pouvez contacter',
    "À propos de l'entreprise",
  ];
  debugInfo.descriptionNoise = data.description
    ? NOISE_INDICATORS.some(n => data.description.includes(n))
    : null;

  const allEmpty    = !data.title && !data.company && !data.location && !data.description;
  const hasIdentity = !!(data.title || data.company);
  const hasDesc     = !!data.description;

  if (allEmpty) {
    debugInfo.lastError = 'Content script works, but LinkedIn DOM selectors found no job data.';
  } else if (hasIdentity && !hasDesc) {
    debugInfo.lastError = 'Description not found — expand "Show more" on LinkedIn then click ↺ Refresh.';
  } else if (debugInfo.descriptionNoise) {
    debugInfo.lastError = 'Warning: description may include LinkedIn noise (check descriptionEndMarker).';
  } else {
    debugInfo.lastError = null;
  }
  renderDebugPanel();

  // Only overwrite a field when extraction found something — preserves manual edits.
  if (data.jobId)       state.externalJobId = data.jobId;
  if (data.title)       elTitle.value       = data.title;
  if (data.company)     elCompany.value     = data.company;
  if (data.location)    elLocation.value    = data.location;
  if (data.description) elDesc.value        = data.description;

  if (allEmpty) {
    setExtractMsg('warning', 'Content script works, but no job data found. Click "Copy DOM" to debug.');
    return;
  }

  if (hasIdentity && !hasDesc) {
    showWarning('Description not found. Expand "Show more" / "Tout afficher" on LinkedIn, then click ↺ Refresh.');
    setExtractMsg('warning', 'Partial — title & company found, description missing');
    return;
  }

  if (data.truncated) {
    showWarning('Description may be truncated. Expand "Show more" on LinkedIn, then click ↺ Refresh.');
    setExtractMsg('warning', 'Job extracted — description may be truncated');
  } else {
    setExtractMsg('ok', 'Job extracted');
  }
}

// ── Refresh / Debug Extract ───────────────────────────────────────────────────

async function onRefresh() {
  if (!state.tabId) return;
  console.log('[RoleRadar] ↺ Refresh requested');
  btnRefresh.disabled = true;
  await extractFromTab();
  btnRefresh.disabled = false;
}

async function onDebugExtract() {
  if (!state.tabId) {
    debugInfo.lastError = 'No tab ID — reopen the popup';
    renderDebugPanel();
    return;
  }
  console.log('[RoleRadar] Debug Extract button clicked');
  btnDebugExtract.disabled = true;
  await extractFromTab();
  btnDebugExtract.disabled = false;
}

// ── Copy DOM Debug ────────────────────────────────────────────────────────────
// Sends dom_debug to the content script and puts the JSON payload in the
// textarea so the user can inspect or copy it for selector debugging.

async function onCopyDom() {
  if (!state.tabId) {
    elDomDebugStatus.textContent = 'No tab';
    return;
  }
  console.log('[RoleRadar] Copy DOM Debug clicked');
  btnCopyDom.disabled = true;
  elDomDebugStatus.textContent = 'Collecting…';
  elDomDebugOut.value = '';

  try {
    const resp = await chrome.tabs.sendMessage(state.tabId, { action: 'dom_debug' });
    if (!resp) {
      elDomDebugStatus.textContent = 'No response';
      elDomDebugOut.value = 'Content script returned nothing.';
      return;
    }
    if (!resp.ok) {
      elDomDebugStatus.textContent = 'Error';
      elDomDebugOut.value = 'Error from content script: ' + (resp.error || 'unknown');
      return;
    }

    const json = JSON.stringify(resp.payload, null, 2);
    elDomDebugOut.value = json;
    elDomDebugOut.select(); // select for easy manual copy

    // Attempt clipboard write (works during user-gesture in popup context)
    try {
      await navigator.clipboard.writeText(json);
      elDomDebugStatus.textContent = 'Copied to clipboard ✓';
    } catch {
      elDomDebugStatus.textContent = 'Select all + copy manually';
    }
    console.log('[RoleRadar] DOM debug payload length:', json.length);
  } catch (err) {
    console.error('[RoleRadar] dom_debug message failed:', err.message);
    elDomDebugStatus.textContent = 'Failed';
    elDomDebugOut.value = 'sendMessage error: ' + err.message;
  } finally {
    btnCopyDom.disabled = false;
  }
}

// ── Backend communication ─────────────────────────────────────────────────────

async function lookupBackend() {
  if (!state.url) return;
  try {
    const res = await fetch(
      `${API}/jobs/lookup?url=${encodeURIComponent(state.url)}`
    );
    if (!res.ok) {
      console.warn('[RoleRadar] Lookup returned unexpected status:', res.status);
      return;
    }
    const data = await res.json();
    state.backendJob = data.found ? data.job : null;
    console.log('[RoleRadar] Lookup result: found =', data.found, 'id =', data.job?.id ?? null);

    // Show existing analysis immediately if the job was already analyzed
    if (state.backendJob?.latest_analysis) {
      renderAnalysisSummary(state.backendJob.latest_analysis);
    }
  } catch (err) {
    console.warn('[RoleRadar] Lookup failed (backend offline?):', err.message);
    showWarning('Backend not reachable — start uvicorn on localhost:8000 first.');
  }
}

// POST /jobs — returns existing job on duplicate (200) or new job (201).
async function ensureJob(status = 'saved') {
  const f = getFields();
  if (!f.title)   throw new Error('Title is required — fill it in manually.');
  if (!f.company) throw new Error('Company is required — fill it in manually.');

  const body = { source: 'linkedin', title: f.title, company: f.company, status };
  if (f.location)          body.location        = f.location;
  if (f.description)       body.description     = f.description;
  if (state.url)           body.url             = state.url;
  if (state.externalJobId) body.external_job_id = state.externalJobId;

  console.log('[RoleRadar] POST /jobs', { title: f.title, company: f.company, status });

  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `POST /jobs failed (${res.status})`);
  }
  const job = await res.json();
  console.log('[RoleRadar] POST /jobs response: id =', job.id, 'status =', job.status);
  return job;
}

async function patchStatus(jobId, status) {
  console.log('[RoleRadar] PATCH /jobs/' + jobId, { status });
  const res = await fetch(`${API}/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH /jobs/${jobId} failed (${res.status})`);
}

async function refreshJobFromBackend(jobId) {
  try {
    const res = await fetch(`${API}/jobs/${jobId}`);
    if (res.ok) {
      state.backendJob = await res.json();
      console.log('[RoleRadar] Refreshed job from backend:', jobId);
    }
  } catch {}
}

// ── Analysis card ─────────────────────────────────────────────────────────────

function renderAnalysisSummary(analysis) {
  if (!analysis) {
    elAnalysisCard.style.display = 'none';
    return;
  }

  const label  = VERDICT_LABELS[analysis.verdict] || fmtVerdict(analysis.verdict);
  const colors = VERDICT_COLORS[analysis.verdict] || { bg: '#f1f5f9', color: '#374151' };

  elAcVerdictBadge.textContent      = label;
  elAcVerdictBadge.style.background = colors.bg;
  elAcVerdictBadge.style.color      = colors.color;

  const scoreNum = typeof analysis.fit_score === 'number'
    ? analysis.fit_score.toFixed(1) : '—';
  elAcScore.innerHTML = `${scoreNum}<span class="ac-score-denom">/10</span>`;

  if (analysis.recommended_action) {
    elAcAction.textContent   = analysis.recommended_action;
    elAcAction.style.display = 'block';
  } else {
    elAcAction.style.display = 'none';
  }

  if (analysis.why) {
    elAcSummary.textContent   = analysis.why;
    elAcSummary.style.display = 'block';
  } else {
    elAcSummary.style.display = 'none';
  }

  elAnalysisCard.style.display = 'block';
}

// ── Debug panel ───────────────────────────────────────────────────────────────

function renderDebugPanel() {
  if (!elDebugRows) return;

  const rows = [
    ['activeTabUrl',           debugInfo.activeTabUrl],
    ['isJobPage',              debugInfo.isJobPage],
    ['contentScriptAvailable', debugInfo.contentScriptAvailable],
    ['injectionAttempted',     debugInfo.injectionAttempted],
    ['injectionSucceeded',     debugInfo.injectionSucceeded],
    ['extractSucceeded',       debugInfo.extractSucceeded],
    ['jobId',                  debugInfo.jobId],
    ['title',                  debugInfo.title],
    ['titleSource',            debugInfo.titleSource],
    ['company',                debugInfo.company],
    ['companySource',          debugInfo.companySource],
    ['location',               debugInfo.location],
    ['locationSource',         debugInfo.locationSource],
    ['descriptionLength',      debugInfo.descriptionLength],
    ['descriptionSource',      debugInfo.descriptionSource],
    ['descriptionStartMarker', debugInfo.descriptionStartMarker],
    ['descriptionEndMarker',   debugInfo.descriptionEndMarker],
    ['descriptionRawLength',   debugInfo.descriptionRawLength],
    ['descriptionCleanLength', debugInfo.descriptionCleanLength],
    ['descriptionNoise',       debugInfo.descriptionNoise],
    ['isTruncated',            debugInfo.isTruncated],
    ['lastError',              debugInfo.lastError],
  ];

  elDebugRows.innerHTML = rows.map(([key, val]) => {
    const cls  = dvClass(key, val);
    const text = dvText(val);
    return `<div class="debug-row"><span class="debug-key">${key}</span><span class="${cls}">${esc(text)}</span></div>`;
  }).join('');
}

function dvClass(key, val) {
  if (key === 'lastError' && val !== null && val !== undefined) return 'debug-val dv-error';
  if (val === null || val === undefined) return 'debug-val dv-null';
  if (val === true)  return 'debug-val dv-true';
  if (val === false) return 'debug-val dv-false';
  return 'debug-val';
}

function dvText(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return String(val);
  const s = String(val);
  return s.length > 62 ? s.slice(0, 59) + '…' : s;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function refreshBadge() {
  if (!state.backendJob) { setBadge('New', 'new'); return; }
  // Applied is the strongest status — show it cleanly without "Analyzed" suffix.
  // Analysis is shown in the analysis card, not the badge.
  setBadge(cap(state.backendJob.status), state.backendJob.status);
}

function setBadge(text, cls) {
  elBadge.textContent = text;
  elBadge.className   = 'badge' + (cls ? ` badge-${cls}` : '');
}

function setExtractMsg(type, text) {
  elExtractMsg.textContent = text;
  elExtractMsg.className   = type || '';
}

function showWarning(msg) {
  elWarning.textContent   = msg;
  elWarning.style.display = 'block';
}

function clearWarning() {
  elWarning.textContent   = '';
  elWarning.style.display = 'none';
}

function setActionMsg(type, text) {
  elStatusMsg.textContent = text;
  elStatusMsg.className   = type || '';
}

function setActionButtons(enabled) {
  btnSave.disabled    = !enabled;
  btnApplied.disabled = !enabled;
  btnAnalyze.disabled = !enabled;
}

function getFields() {
  return {
    title:       elTitle.value.trim(),
    company:     elCompany.value.trim(),
    location:    elLocation.value.trim(),
    description: elDesc.value.trim(),
  };
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function fmtVerdict(v) {
  return v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : v;
}

// ── Navigation handlers ───────────────────────────────────────────────────────

function onOpenDashboard() {
  chrome.tabs.create({ url: 'http://localhost:5173' });
}

function onViewDetails() {
  const jobId = state.backendJob?.id
  const url = jobId
    ? `http://localhost:5173/?jobId=${jobId}`
    : 'http://localhost:5173'
  chrome.tabs.create({ url })
}

// ── Action button handlers ────────────────────────────────────────────────────

async function onSave() {
  setActionButtons(false);
  setActionMsg('loading', 'Saving…');
  try {
    const job = await ensureJob('saved');
    state.backendJob = { ...(state.backendJob || {}), ...job };
    refreshBadge();
    setActionMsg('success', `Saved (ID: ${job.id})`);
  } catch (e) {
    setActionMsg('error', e.message);
  } finally {
    setActionButtons(true);
  }
}

async function onApplied() {
  setActionButtons(false);
  setActionMsg('loading', 'Marking as applied…');
  try {
    const job = state.backendJob || await ensureJob('saved');
    if (!state.backendJob) state.backendJob = job;
    await patchStatus(job.id, 'applied');
    state.backendJob = { ...state.backendJob, status: 'applied' };
    refreshBadge();
    setActionMsg('success', `Applied (ID: ${job.id})`);
  } catch (e) {
    setActionMsg('error', e.message);
  } finally {
    setActionButtons(true);
  }
}

async function onAnalyze() {
  setActionButtons(false);
  setActionMsg('loading', 'Analyzing…');
  try {
    const job = state.backendJob || await ensureJob('saved');
    if (!state.backendJob) state.backendJob = job;

    const res = await fetch(`${API}/jobs/${job.id}/analyze`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err.detail || '';
      if (res.status === 400) {
        const isNoKey = detail.includes('OPENAI_API_KEY') || detail.includes('AI_PROVIDER') || detail.includes('missing');
        throw new Error(isNoKey
          ? 'AI provider not configured — add OPENAI_API_KEY to .env and restart the backend.'
          : detail || 'Analysis request rejected (400)');
      }
      throw new Error(detail || `Analysis failed (${res.status})`);
    }

    const analysis = await res.json();
    console.log('[RoleRadar] Analysis done:', { verdict: analysis.verdict, fit_score: analysis.fit_score });

    state.backendJob = { ...(state.backendJob || {}), latest_analysis: analysis };
    refreshBadge();
    renderAnalysisSummary(analysis);
    setActionMsg('', ''); // clear "Analyzing..." — result is in the card
  } catch (e) {
    setActionMsg('error', e.message);
  } finally {
    setActionButtons(true);
  }
}
