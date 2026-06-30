// popup.js — handles all popup logic: extraction, backend lookup, and actions.

const API = 'http://localhost:8000';

// Runtime state
const state = {
  tabId: null,
  url: null,
  externalJobId: null,
  backendJob: null,  // JobDetailResponse or null
};

// DOM refs (populated in DOMContentLoaded)
let elBadge, elWarning, elStatusMsg;
let elTitle, elCompany, elLocation, elDesc;
let btnSave, btnApplied, btnAnalyze;

document.addEventListener('DOMContentLoaded', async () => {
  elBadge    = document.getElementById('badge');
  elWarning  = document.getElementById('warning');
  elStatusMsg = document.getElementById('status-msg');
  elTitle    = document.getElementById('f-title');
  elCompany  = document.getElementById('f-company');
  elLocation = document.getElementById('f-location');
  elDesc     = document.getElementById('f-desc');
  btnSave    = document.getElementById('btn-save');
  btnApplied = document.getElementById('btn-applied');
  btnAnalyze = document.getElementById('btn-analyze');

  btnSave.addEventListener('click', onSave);
  btnApplied.addEventListener('click', onApplied);
  btnAnalyze.addEventListener('click', onAnalyze);

  await init();
});

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
  setMsg('loading', 'Loading…');

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    setMsg('error', 'No active tab found.');
    setButtons(false);
    return;
  }

  state.tabId = tab.id;
  state.url   = tab.url;

  if (!isJobPage(state.url)) {
    setBadge('—', '');
    setMsg('error', 'Open a LinkedIn job listing to use RoleRadar.');
    setButtons(false);
    return;
  }

  // 1. Extract job data from page via content script
  try {
    const data = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    if (data) {
      state.externalJobId  = data.jobId || null;
      if (data.title)       elTitle.value    = data.title;
      if (data.company)     elCompany.value  = data.company;
      if (data.location)    elLocation.value = data.location;
      if (data.description) elDesc.value     = data.description;
      if (data.truncated) {
        showWarning(
          'Description may be truncated. Expand the LinkedIn job description before analyzing.'
        );
      }
    }
  } catch {
    showWarning('Could not read page data — try reloading LinkedIn, then reopening the extension.');
  }

  // 2. Check if this job already exists in the backend
  await lookupBackend();
  refreshBadge();
  setMsg('', '');
}

function isJobPage(url) {
  if (!url) return false;
  return (
    url.includes('linkedin.com/jobs/view/') ||
    url.includes('linkedin.com/jobs/search-results/')
  );
}

// ── Backend communication ────────────────────────────────────────────────────

async function lookupBackend() {
  if (!state.url) return;
  try {
    const res = await fetch(
      `${API}/jobs/lookup?url=${encodeURIComponent(state.url)}`
    );
    if (res.ok) {
      state.backendJob = await res.json();
    }
    // 404 = job not saved yet — normal, not an error
  } catch {
    showWarning('Backend not reachable — start uvicorn on localhost:8000 first.');
  }
}

// POST /jobs — creates a new job or returns an existing one (dedup by URL / title+company).
async function ensureJob(status = 'saved') {
  const f = getFields();
  if (!f.title)   throw new Error('Title is required — fill in manually.');
  if (!f.company) throw new Error('Company is required — fill in manually.');

  const body = { source: 'linkedin', title: f.title, company: f.company, status };
  if (f.location)        body.location        = f.location;
  if (f.description)     body.description     = f.description;
  if (state.url)         body.url             = state.url;
  if (state.externalJobId) body.external_job_id = state.externalJobId;

  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `POST /jobs failed (${res.status})`);
  }
  return res.json();  // JobResponse (201 = new, 200 = duplicate)
}

async function patchStatus(jobId, status) {
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
    if (res.ok) state.backendJob = await res.json();
  } catch {}
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function refreshBadge() {
  if (!state.backendJob) {
    setBadge('New', 'new');
    return;
  }
  const { status, latest_analysis } = state.backendJob;
  if (latest_analysis) {
    setBadge(`${cap(status)} · Analyzed`, 'analyzed');
  } else {
    setBadge(cap(status), status);
  }
}

function setBadge(text, cls) {
  elBadge.textContent = text;
  elBadge.className   = 'badge' + (cls ? ` badge-${cls}` : '');
}

function showWarning(msg) {
  elWarning.textContent = msg;
  elWarning.style.display = 'block';
}

function setMsg(type, text) {
  elStatusMsg.textContent = text;
  elStatusMsg.className   = type ? `msg-${type}` : '';
}

function setButtons(enabled) {
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
  setButtons(false);
  setMsg('loading', 'Saving…');
  try {
    const job = await ensureJob('saved');
    state.backendJob = { ...(state.backendJob || {}), ...job };
    refreshBadge();
    setMsg('success', `Saved (ID: ${job.id})`);
  } catch (e) {
    setMsg('error', e.message);
  } finally {
    setButtons(true);
  }
}

async function onApplied() {
  setButtons(false);
  setMsg('loading', 'Marking as applied…');
  try {
    // Ensure the job exists in the backend — POST /jobs handles both new and duplicate.
    const job = state.backendJob || await ensureJob('saved');
    if (!state.backendJob) state.backendJob = job;

    // PATCH to applied regardless of current status (idempotent).
    await patchStatus(job.id, 'applied');
    state.backendJob = { ...state.backendJob, status: 'applied' };
    refreshBadge();
    setMsg('success', `Applied (ID: ${job.id})`);
  } catch (e) {
    setMsg('error', e.message);
  } finally {
    setButtons(true);
  }
}

async function onAnalyze() {
  setButtons(false);
  setMsg('loading', 'Analyzing…');
  try {
    // Ensure the job exists before running analysis.
    const job = state.backendJob || await ensureJob('saved');
    if (!state.backendJob) state.backendJob = job;

    const res = await fetch(`${API}/jobs/${job.id}/analyze`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Analysis failed (${res.status})`);
    }
    const analysis = await res.json();

    // Refresh so the badge shows "Analyzed"
    await refreshJobFromBackend(job.id);
    refreshBadge();

    const score = typeof analysis.fit_score === 'number'
      ? ` · ${analysis.fit_score.toFixed(1)}/10`
      : '';
    setMsg('success', `${fmtVerdict(analysis.verdict)}${score}`);
  } catch (e) {
    setMsg('error', e.message);
  } finally {
    setButtons(true);
  }
}
