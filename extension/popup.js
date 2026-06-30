// popup.js — popup lifecycle, extraction, backend lookup, and user actions.
// Each popup open is a fresh JS context — no state persists between opens.

const API = 'http://localhost:8000';

const state = {
  tabId:         null,
  url:           null,
  externalJobId: null,
  backendJob:    null,  // JobDetailResponse or null
};

// DOM refs
let elBadge, elWarning, elExtractMsg, elStatusMsg;
let elTitle, elCompany, elLocation, elDesc;
let btnRefresh, btnSave, btnApplied, btnAnalyze;

document.addEventListener('DOMContentLoaded', async () => {
  elBadge      = document.getElementById('badge');
  elWarning    = document.getElementById('warning');
  elExtractMsg = document.getElementById('extract-msg');
  elStatusMsg  = document.getElementById('status-msg');
  elTitle      = document.getElementById('f-title');
  elCompany    = document.getElementById('f-company');
  elLocation   = document.getElementById('f-location');
  elDesc       = document.getElementById('f-desc');
  btnRefresh   = document.getElementById('btn-refresh');
  btnSave      = document.getElementById('btn-save');
  btnApplied   = document.getElementById('btn-applied');
  btnAnalyze   = document.getElementById('btn-analyze');

  btnRefresh.addEventListener('click', onRefresh);
  btnSave.addEventListener('click', onSave);
  btnApplied.addEventListener('click', onApplied);
  btnAnalyze.addEventListener('click', onAnalyze);

  await init();
});

// ── Initialization ───────────────────────────────────────────────────────────

async function init() {
  console.log('[RoleRadar] Popup opened');

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    setExtractMsg('error', 'No active tab found.');
    setActionButtons(false);
    return;
  }

  state.tabId = tab.id;
  state.url   = tab.url;
  console.log('[RoleRadar] Active tab:', { id: tab.id, url: tab.url });

  if (!isJobPage(state.url)) {
    setBadge('—', '');
    setExtractMsg('error', 'Open a LinkedIn job listing to use RoleRadar.');
    setActionButtons(false);
    btnRefresh.disabled = true;
    return;
  }

  // Always extract fresh from the current DOM on every popup open.
  await extractFromTab();

  // Check if job is already in the backend.
  await lookupBackend();
  refreshBadge();
}

function isJobPage(url) {
  if (!url) return false;
  return (
    url.includes('linkedin.com/jobs/view/') ||
    url.includes('linkedin.com/jobs/search-results/')
  );
}

// ── Extraction ───────────────────────────────────────────────────────────────
// Called on popup open AND when the user clicks ↺ Refresh.
// Always sends a live message to the content script — no caching.

async function extractFromTab() {
  setExtractMsg('loading', 'Extracting job…');
  clearWarning();

  console.log('[RoleRadar] Sending extract message to tab', state.tabId);

  let data;
  try {
    data = await chrome.tabs.sendMessage(state.tabId, { action: 'extract' });
  } catch (err) {
    console.error('[RoleRadar] sendMessage failed:', err.message);

    const noConnection =
      err.message?.includes('Could not establish connection') ||
      err.message?.includes('Receiving end does not exist');

    if (noConnection) {
      showWarning('Content script not available — reload the LinkedIn tab, then reopen this popup.');
      setExtractMsg('error', 'Could not extract job — reload the LinkedIn tab.');
    } else {
      setExtractMsg('error', 'Could not extract job — ' + err.message);
    }
    return;
  }

  console.log('[RoleRadar] Extract response received:', {
    jobId:             data?.jobId,
    title:             data?.title?.slice(0, 50),
    company:           data?.company,
    locationLength:    data?.location?.length ?? 0,
    descriptionLength: data?.description?.length ?? 0,
    truncated:         data?.truncated,
  });

  if (!data) {
    setExtractMsg('error', 'Could not extract job — empty response from page.');
    return;
  }

  // Update state and form fields. Only overwrite a field if extraction found
  // something — preserves any manual corrections the user made.
  if (data.jobId)       state.externalJobId  = data.jobId;
  if (data.title)       elTitle.value        = data.title;
  if (data.company)     elCompany.value      = data.company;
  if (data.location)    elLocation.value     = data.location;
  if (data.description) elDesc.value         = data.description;

  if (data.truncated) {
    showWarning(
      'Description may be truncated. Expand the LinkedIn job description, then click ↺ Refresh.'
    );
    setExtractMsg('warning', 'Job extracted — description may be truncated');
  } else {
    setExtractMsg('ok', 'Job extracted');
  }
}

async function onRefresh() {
  if (!state.tabId) return;
  console.log('[RoleRadar] ↺ Refresh extraction requested');
  btnRefresh.disabled = true;
  await extractFromTab();
  btnRefresh.disabled = false;
}

// ── Backend communication ────────────────────────────────────────────────────

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
    // Backend always returns 200 with {found, job}
    state.backendJob = data.found ? data.job : null;
    console.log('[RoleRadar] Lookup result: found =', data.found, 'id =', data.job?.id ?? null);
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

// ── UI helpers ───────────────────────────────────────────────────────────────

function refreshBadge() {
  if (!state.backendJob) {
    setBadge('New', 'new');
    return;
  }
  const { status, latest_analysis } = state.backendJob;
  setBadge(
    latest_analysis ? `${cap(status)} · Analyzed` : cap(status),
    latest_analysis ? 'analyzed' : status
  );
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
  elWarning.textContent    = msg;
  elWarning.style.display  = 'block';
}

function clearWarning() {
  elWarning.textContent    = '';
  elWarning.style.display  = 'none';
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

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function fmtVerdict(v) {
  return v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : v;
}

// ── Button handlers ──────────────────────────────────────────────────────────

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
    // POST to get or create the job, then PATCH regardless of current status.
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
      throw new Error(err.detail || `Analysis failed (${res.status})`);
    }
    const analysis = await res.json();
    console.log('[RoleRadar] Analysis done:', {
      verdict: analysis.verdict,
      fit_score: analysis.fit_score,
    });

    await refreshJobFromBackend(job.id);
    refreshBadge();

    const score = typeof analysis.fit_score === 'number'
      ? ` · ${analysis.fit_score.toFixed(1)}/10`
      : '';
    setActionMsg('success', `${fmtVerdict(analysis.verdict)}${score}`);
  } catch (e) {
    setActionMsg('error', e.message);
  } finally {
    setActionButtons(true);
  }
}
