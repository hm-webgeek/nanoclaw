/**
 * NanoClaw Dashboard — port 3002
 * Self-contained HTTP server: serves the dashboard HTML and JSON API.
 * Opens its own read-only DB connection to avoid interfering with the main process.
 */

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

import {
  getPendingApprovals,
  getApproval,
  getRecentApprovals,
  getRecentQaRuns,
  resolveApproval,
  createTask,
  getAllRegisteredGroups,
} from './db.js';
import { logger } from './logger.js';

export const DASHBOARD_PORT = parseInt(
  process.env.DASHBOARD_PORT || '3002',
  10,
);

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function openDb(storePath: string): Database.Database | null {
  const dbPath = path.join(storePath, 'messages.db');
  if (!fs.existsSync(dbPath)) return null;
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

function getTasks(db: Database.Database) {
  try {
    return db
      .prepare(
        `SELECT id, group_folder, prompt, schedule_type, schedule_value,
                next_run, last_run, last_result, status, created_at
         FROM scheduled_tasks ORDER BY created_at DESC LIMIT 100`,
      )
      .all();
  } catch {
    return [];
  }
}

function getGroups(db: Database.Database) {
  try {
    return db
      .prepare(
        `SELECT jid, name, folder, added_at, is_main FROM registered_groups ORDER BY added_at DESC`,
      )
      .all();
  } catch {
    return [];
  }
}

function getRecentTaskLogs(db: Database.Database) {
  try {
    return db
      .prepare(
        `SELECT l.task_id, l.run_at, l.duration_ms, l.status, l.result, l.error,
                t.prompt
         FROM task_run_logs l
         JOIN scheduled_tasks t ON l.task_id = t.id
         ORDER BY l.run_at DESC LIMIT 20`,
      )
      .all();
  } catch {
    return [];
  }
}

async function checkService(
  url: string,
): Promise<{ online: boolean; data?: unknown }> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    const data = await res.json().catch(() => null);
    return { online: res.ok, data };
  } catch {
    return { online: false };
  }
}

function tailLog(logPath: string, lines = 120): string[] {
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const all = content.split('\n').filter(Boolean);
    return all.slice(-lines);
  } catch {
    return [];
  }
}

// Previous CPU sample for delta-based usage calculation
let prevCpuSample: os.CpuInfo[] | null = null;

function cpuDeltaPct(prev: os.CpuInfo[], curr: os.CpuInfo[]): number {
  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < Math.min(prev.length, curr.length); i++) {
    const p = prev[i].times;
    const c = curr[i].times;
    idleDelta += c.idle - p.idle;
    totalDelta +=
      c.idle +
      c.user +
      c.sys +
      c.nice +
      c.irq -
      (p.idle + p.user + p.sys + p.nice + p.irq);
  }
  return totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
}

function systemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // CPU load: delta between this call and the previous sample
  const cpuPct = prevCpuSample ? cpuDeltaPct(prevCpuSample, cpus) : 0;
  prevCpuSample = cpus;

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? 'Unknown',
    cpuCount: cpus.length,
    cpuPct,
    totalMem,
    usedMem,
    freeMem,
    memPct: Math.round((usedMem / totalMem) * 100),
    uptime: os.uptime(),
    nodeUptime: Math.floor(process.uptime()),
    loadAvg: os.loadavg(),
  };
}

// ---------------------------------------------------------------------------
// API handler
// ---------------------------------------------------------------------------

async function handleApi(
  storePath: string,
  logsPath: string,
  res: http.ServerResponse,
): Promise<void> {
  const db = openDb(storePath);

  const [ollamaResult, comfyResult, a1111Result] = await Promise.all([
    checkService('http://localhost:11434/api/tags'),
    checkService('http://localhost:8188/system_stats'),
    checkService('http://localhost:7860/sdapi/v1/options'),
  ]);

  const ollamaModels =
    ollamaResult.online && ollamaResult.data
      ? (
          (ollamaResult.data as { models?: { name: string }[] }).models ?? []
        ).map((m) => m.name)
      : [];

  const payload = {
    ts: new Date().toISOString(),
    system: systemStats(),
    tasks: db ? getTasks(db) : [],
    groups: db ? getGroups(db) : [],
    recentRuns: db ? getRecentTaskLogs(db) : [],
    ollama: {
      online: ollamaResult.online,
      models: ollamaModels,
    },
    comfyui: {
      online: comfyResult.online,
      data: comfyResult.data ?? null,
    },
    a1111: {
      online: a1111Result.online,
      model: a1111Result.online
        ? ((a1111Result.data as { sd_model_checkpoint?: string })
            ?.sd_model_checkpoint ?? null)
        : null,
    },
    logs: tailLog(path.join(logsPath, 'nanoclaw.log')),
  };

  if (db) db.close();

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Dashboard HTML
// ---------------------------------------------------------------------------

const HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>NanoClaw Dashboard</title>
<link rel="icon" type="image/png" href="data:image/png;base64,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" />
<style>
:root {
  --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9; --border: #e2e8f0;
  --text: #1e293b; --text2: #64748b; --text3: #94a3b8;
  --accent: #6366f1; --accent2: #8b5cf6;
  --green: #16a34a; --red: #dc2626; --yellow: #d97706; --blue: #2563eb;
  --green-bg: #dcfce7; --red-bg: #fee2e2; --yellow-bg: #fef3c7;
  --mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
}
[data-theme="dark"] {
  --bg: #0b1120; --surface: #131d30; --surface2: #1a2744;
  --border: #1e3058; --text: #e2e8f0; --text2: #94a3b8; --text3: #64748b;
  --accent: #818cf8; --accent2: #a78bfa;
  --green: #4ade80; --red: #f87171; --yellow: #fbbf24; --blue: #60a5fa;
  --green-bg: #052e16; --red-bg: #1c0a0a; --yellow-bg: #1c1300;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }

/* Layout */
.layout { display: flex; height: 100vh; }
.sidebar { width: 220px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow-y: auto; }
.main { flex: 1; overflow-y: auto; padding: 24px; }

/* Sidebar */
.sidebar-logo { padding: 20px 16px 12px; border-bottom: 1px solid var(--border); }
.sidebar-logo h1 { font-size: 15px; font-weight: 700; color: var(--text);
  display: flex; align-items: center; gap: 8px; }
.sidebar-logo .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.sidebar-logo p { font-size: 11px; color: var(--text2); margin-top: 3px; padding-left: 16px; }
.nav { padding: 12px 8px; flex: 1; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
  cursor: pointer; color: var(--text2); font-size: 13px; font-weight: 500; transition: all 0.15s;
  border: none; background: none; width: 100%; text-align: left; }
.nav-item:hover { background: var(--surface2); color: var(--text); }
.nav-item.active { background: var(--surface2); color: var(--accent); }
.nav-item .icon { font-size: 16px; width: 20px; text-align: center; }
.sidebar-footer { padding: 12px; border-top: 1px solid var(--border); }

/* Header */
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.page-header h2 { font-size: 20px; font-weight: 700; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text2); cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.15s; }
.btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.refresh-indicator { font-size: 11px; color: var(--text3); }

/* Status bar */
.status-bar { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.status-pill { display: flex; align-items: center; gap: 6px; padding: 5px 10px;
  border-radius: 20px; border: 1px solid var(--border); background: var(--surface); font-size: 12px; }
.status-pill .led { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.led-on { background: var(--green); box-shadow: 0 0 4px var(--green); }
.led-off { background: var(--red); }
.led-warn { background: var(--yellow); }

/* Cards grid */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); margin-bottom: 8px; }
.card-value { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1; }
.card-sub { font-size: 12px; color: var(--text2); margin-top: 6px; }
.progress { height: 4px; border-radius: 2px; background: var(--surface2); margin-top: 10px; overflow: hidden; }
.progress-bar { height: 100%; border-radius: 2px; background: var(--accent); transition: width 0.4s; }
.progress-bar.warn { background: var(--yellow); }
.progress-bar.danger { background: var(--red); }

/* Section */
.section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
.section-header { padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: 13px; font-weight: 600; color: var(--text); }
.section-count { font-size: 11px; color: var(--text3); background: var(--surface2); padding: 2px 7px; border-radius: 10px; }

/* Nav badge */
.nav-badge { margin-left: auto; background: var(--accent); color: #fff; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px; min-width: 18px; text-align: center; }

/* Status badges */
.badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.badge-pending { background: rgba(234,179,8,0.15); color: #eab308; }
.badge-approved { background: rgba(34,197,94,0.15); color: #22c55e; }
.badge-rejected { background: rgba(239,68,68,0.15); color: #ef4444; }
.badge-running { background: rgba(99,102,241,0.15); color: #818cf8; }
.badge-passed { background: rgba(34,197,94,0.15); color: #22c55e; }
.badge-failed { background: rgba(239,68,68,0.15); color: #ef4444; }
.badge-partial { background: rgba(234,179,8,0.15); color: #eab308; }

/* Approval cards */
.approval-card { border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; background: var(--surface2); }
.approval-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.approval-card-title { font-size: 14px; font-weight: 600; flex: 1; }
.approval-meta { font-size: 11px; color: var(--text3); margin-bottom: 10px; }
.approval-summary { font-size: 12px; color: var(--text2); background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; white-space: pre-wrap; font-family: var(--mono); max-height: 200px; overflow-y: auto; }
.approval-actions { display: flex; gap: 8px; align-items: center; }
.btn-approve { padding: 6px 14px; border-radius: 6px; border: none; background: rgba(34,197,94,0.2); color: #22c55e;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.btn-approve:hover { background: rgba(34,197,94,0.35); }
.btn-reject { padding: 6px 14px; border-radius: 6px; border: none; background: rgba(239,68,68,0.15); color: #ef4444;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.btn-reject:hover { background: rgba(239,68,68,0.3); }
.feedback-input { flex: 1; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 12px; }
.resolved-section { margin-top: 24px; }
.resolved-section h4 { font-size: 12px; font-weight: 600; color: var(--text3); text-transform: uppercase;
  letter-spacing: 0.05em; margin-bottom: 12px; }

/* QA issue counts */
.qa-counts { display: flex; gap: 16px; margin: 10px 0; }
.qa-count { text-align: center; }
.qa-count-num { font-size: 22px; font-weight: 700; }
.qa-count-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; }
.count-found { color: #f97316; }
.count-fixed { color: #22c55e; }
.count-pending { color: #eab308; }

/* Table */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text3); padding: 10px 20px; border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: 10px 20px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--surface2); }
.prompt-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text2); font-size: 12px; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-green { background: var(--green-bg); color: var(--green); }
.badge-red { background: var(--red-bg); color: var(--red); }
.badge-yellow { background: var(--yellow-bg); color: var(--yellow); }
.badge-blue { background: #dbeafe; color: var(--blue); }
[data-theme="dark"] .badge-blue { background: #0c1a35; }

/* Model list */
.model-list { padding: 16px 20px; display: flex; flex-wrap: wrap; gap: 8px; }
.model-chip { padding: 4px 12px; border-radius: 6px; background: var(--surface2); color: var(--text2);
  font-size: 12px; font-family: var(--mono); border: 1px solid var(--border); }

/* Log viewer */
.log-viewer { font-family: var(--mono); font-size: 11.5px; line-height: 1.7; color: var(--text2);
  padding: 16px 20px; max-height: 400px; overflow-y: auto; background: var(--bg); }
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-error { color: var(--red); }
.log-warn { color: var(--yellow); }
.log-info { color: var(--text2); }

/* Page visibility */
.page { display: none; }
.page.active { display: block; }

/* Empty state */
.empty { padding: 40px 20px; text-align: center; color: var(--text3); font-size: 13px; }

/* Theme toggle */
.theme-btn { font-size: 18px; background: none; border: none; cursor: pointer; color: var(--text2); padding: 4px 8px; border-radius: 6px; }
.theme-btn:hover { background: var(--surface2); }

/* Uptime */
.uptime-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
.uptime-cell { background: var(--surface); padding: 12px 20px; }
.uptime-label { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; }
.uptime-val { font-size: 14px; font-weight: 600; color: var(--text); margin-top: 4px; }
</style>
</head>
<body>
<div class="layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-logo">
      <h1><span class="dot"></span> NanoClaw</h1>
      <p id="hostname">Dashboard</p>
    </div>
    <nav class="nav">
      <button class="nav-item active" data-page="overview" onclick="showPage('overview',this)">
        <span class="icon">⬡</span> Overview
      </button>
      <button class="nav-item" data-page="tasks" onclick="showPage('tasks',this)">
        <span class="icon">⏰</span> Scheduled Tasks
      </button>
      <button class="nav-item" data-page="groups" onclick="showPage('groups',this)">
        <span class="icon">◈</span> Groups
      </button>
      <button class="nav-item" data-page="models" onclick="showPage('models',this)">
        <span class="icon">◎</span> Local Models
      </button>
      <button class="nav-item" data-page="approvals" onclick="showPage('approvals',this)">
        <span class="icon">✓</span> Approvals
        <span class="nav-badge" id="nav-approvals-badge" style="display:none"></span>
      </button>
      <button class="nav-item" data-page="qa" onclick="showPage('qa',this)">
        <span class="icon">◉</span> QA
      </button>
      <button class="nav-item" data-page="logs" onclick="showPage('logs',this)">
        <span class="icon">≡</span> Logs
      </button>
    </nav>
    <div class="sidebar-footer">
      <div style="font-size:11px; color:var(--text3); text-align:center" id="last-update">—</div>
    </div>
  </aside>

  <!-- Main -->
  <main class="main">
    <div class="page-header">
      <h2 id="page-title">Overview</h2>
      <div class="header-actions">
        <span class="refresh-indicator" id="next-refresh"></span>
        <button class="btn" onclick="fetchData()">↻ Refresh</button>
        <button class="theme-btn" onclick="toggleTheme()" title="Toggle theme">◑</button>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar" id="status-bar">
      <div class="status-pill"><span class="led led-warn" id="led-nanoclaw"></span> NanoClaw</div>
      <div class="status-pill"><span class="led led-off" id="led-ollama"></span> Ollama</div>
      <div class="status-pill"><span class="led led-off" id="led-comfyui"></span> ComfyUI</div>
      <div class="status-pill"><span class="led led-off" id="led-a1111"></span> A1111 API</div>
    </div>

    <!-- Overview page -->
    <div class="page active" id="page-overview">
      <div class="cards" id="sys-cards">
        <div class="card">
          <div class="card-label">CPU Usage</div>
          <div class="card-value" id="cpu-pct">—</div>
          <div class="card-sub" id="cpu-sub"></div>
          <div class="progress"><div class="progress-bar" id="cpu-bar" style="width:0%"></div></div>
        </div>
        <div class="card">
          <div class="card-label">Memory</div>
          <div class="card-value" id="mem-pct">—</div>
          <div class="card-sub" id="mem-sub"></div>
          <div class="progress"><div class="progress-bar" id="mem-bar" style="width:0%"></div></div>
        </div>
        <div class="card">
          <div class="card-label">Scheduled Tasks</div>
          <div class="card-value" id="task-count">—</div>
          <div class="card-sub" id="task-sub"></div>
        </div>
        <div class="card">
          <div class="card-label">Groups</div>
          <div class="card-value" id="group-count">—</div>
          <div class="card-sub" id="group-sub"></div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <span class="section-title">System Info</span>
        </div>
        <div class="uptime-grid" id="sys-info-grid">
          <div class="uptime-cell"><div class="uptime-label">Platform</div><div class="uptime-val" id="si-platform">—</div></div>
          <div class="uptime-cell"><div class="uptime-label">CPU</div><div class="uptime-val" id="si-cpu">—</div></div>
          <div class="uptime-cell"><div class="uptime-label">System Uptime</div><div class="uptime-val" id="si-uptime">—</div></div>
          <div class="uptime-cell"><div class="uptime-label">NanoClaw Uptime</div><div class="uptime-val" id="si-node-uptime">—</div></div>
          <div class="uptime-cell"><div class="uptime-label">Load Avg (1m)</div><div class="uptime-val" id="si-load">—</div></div>
          <div class="uptime-cell"><div class="uptime-label">Ollama Models</div><div class="uptime-val" id="si-models">—</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <span class="section-title">Recent Task Runs</span>
          <span class="section-count" id="runs-count">0</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>Ran At</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody id="runs-tbody"><tr><td colspan="4" class="empty">No runs yet</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tasks page -->
    <div class="page" id="page-tasks">
      <div class="section">
        <div class="section-header">
          <span class="section-title">Scheduled Tasks</span>
          <span class="section-count" id="tasks-count">0</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Group</th><th>Schedule</th><th>Next Run</th><th>Last Run</th><th>Status</th><th>Prompt</th></tr></thead>
            <tbody id="tasks-tbody"><tr><td colspan="7" class="empty">No tasks</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Groups page -->
    <div class="page" id="page-groups">
      <div class="section">
        <div class="section-header">
          <span class="section-title">Registered Groups</span>
          <span class="section-count" id="groups-count">0</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Folder</th><th>Type</th><th>Added</th></tr></thead>
            <tbody id="groups-tbody"><tr><td colspan="4" class="empty">No groups registered</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Models page -->
    <div class="page" id="page-models">
      <div class="section">
        <div class="section-header">
          <span class="section-title">Ollama Models</span>
          <span class="section-count" id="models-count">0</span>
        </div>
        <div id="models-content"><div class="empty">Checking Ollama...</div></div>
      </div>
      <div class="section" style="margin-top:16px">
        <div class="section-header">
          <span class="section-title">Image Generation</span>
        </div>
        <div style="padding:16px 20px; display:flex; flex-direction:column; gap:12px">
          <div style="display:flex; align-items:center; justify-content:space-between">
            <div>
              <div style="font-weight:600; font-size:13px">ComfyUI</div>
              <div style="font-size:12px; color:var(--text2); margin-top:2px">localhost:8188</div>
            </div>
            <span class="badge" id="comfyui-badge">Offline</span>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between">
            <div>
              <div style="font-weight:600; font-size:13px">A1111 API</div>
              <div style="font-size:12px; color:var(--text2); margin-top:2px" id="a1111-model-label">localhost:7860</div>
            </div>
            <span class="badge" id="a1111-badge">Offline</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Approvals page -->
    <div class="page" id="page-approvals">
      <div class="section">
        <div class="section-header">
          <span class="section-title">Pending Approvals</span>
          <span class="section-count" id="approvals-pending-count">0</span>
        </div>
        <div style="padding:16px" id="approvals-pending-list">
          <div class="empty">No pending approvals</div>
        </div>
      </div>
      <div class="section resolved-section">
        <div class="section-header">
          <span class="section-title">Recently Resolved</span>
          <span class="section-count" id="approvals-resolved-count">0</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Skill</th><th>Project</th><th>Status</th><th>Resolved</th></tr></thead>
            <tbody id="approvals-resolved-tbody"><tr><td colspan="5" class="empty">No resolved approvals</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- QA page -->
    <div class="page" id="page-qa">
      <div class="section">
        <div class="section-header">
          <span class="section-title">QA Runs</span>
          <span class="section-count" id="qa-count">0</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Project</th><th>Run At</th><th>Status</th><th>Found</th><th>Fixed</th><th>Pending</th><th>Summary</th></tr></thead>
            <tbody id="qa-tbody"><tr><td colspan="7" class="empty">No QA runs yet</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Logs page -->
    <div class="page" id="page-logs">
      <div class="section">
        <div class="section-header">
          <span class="section-title">nanoclaw.log</span>
          <span class="section-count" id="log-lines-count">0 lines</span>
        </div>
        <div class="log-viewer" id="log-viewer"><div class="empty">Loading logs...</div></div>
      </div>
    </div>
  </main>
</div>

<script>
let data = null;
let refreshTimer = null;
let countdown = 15;

const PAGES = { overview: 'Overview', tasks: 'Scheduled Tasks', groups: 'Groups', models: 'Local Models', approvals: 'Approvals', qa: 'QA', logs: 'Logs' };

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('page-title').textContent = PAGES[id] || id;
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  localStorage.setItem('nc-theme', next);
}

function fmtBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
  return b + ' B';
}

function fmtDuration(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm ' + (sec % 60) + 's';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', timeZoneName:'short'});
}

function led(id, on) {
  const el = document.getElementById('led-' + id);
  if (!el) return;
  el.className = 'led ' + (on ? 'led-on' : 'led-off');
}

function badge(status) {
  if (!status) return '<span class="badge badge-yellow">Unknown</span>';
  const s = String(status).toLowerCase();
  if (s === 'active') return '<span class="badge badge-green">Active</span>';
  if (s === 'completed') return '<span class="badge badge-blue">Done</span>';
  if (s === 'paused') return '<span class="badge badge-yellow">Paused</span>';
  if (s === 'failed') return '<span class="badge badge-red">Failed</span>';
  if (s === 'success') return '<span class="badge badge-green">Success</span>';
  if (s === 'error') return '<span class="badge badge-red">Error</span>';
  return '<span class="badge badge-yellow">' + status + '</span>';
}

function renderData(d) {
  if (!d) return;

  // Status LEDs
  led('nanoclaw', true);
  led('ollama', d.ollama.online);
  led('comfyui', d.comfyui.online);
  led('a1111', d.a1111.online);

  // Hostname
  document.getElementById('hostname').textContent = d.system.hostname;

  // Overview cards
  const cpuP = d.system.cpuPct;
  document.getElementById('cpu-pct').textContent = cpuP + '%';
  document.getElementById('cpu-sub').textContent = d.system.cpuCount + ' cores';
  const cpuBar = document.getElementById('cpu-bar');
  cpuBar.style.width = cpuP + '%';
  cpuBar.className = 'progress-bar' + (cpuP > 90 ? ' danger' : cpuP > 70 ? ' warn' : '');

  const memP = d.system.memPct;
  document.getElementById('mem-pct').textContent = memP + '%';
  document.getElementById('mem-sub').textContent = fmtBytes(d.system.usedMem) + ' / ' + fmtBytes(d.system.totalMem);
  const memBar = document.getElementById('mem-bar');
  memBar.style.width = memP + '%';
  memBar.className = 'progress-bar' + (memP > 90 ? ' danger' : memP > 75 ? ' warn' : '');

  const active = d.tasks.filter(t => t.status === 'active').length;
  document.getElementById('task-count').textContent = d.tasks.length;
  document.getElementById('task-sub').textContent = active + ' active';

  document.getElementById('group-count').textContent = d.groups.length;
  const mainG = d.groups.find(g => g.is_main);
  document.getElementById('group-sub').textContent = mainG ? 'Main: ' + mainG.folder : '';

  // Sys info
  document.getElementById('si-platform').textContent = d.system.platform + ' ' + d.system.arch;
  document.getElementById('si-cpu').textContent = d.system.cpuModel.split('@')[0].trim();
  document.getElementById('si-uptime').textContent = fmtDuration(d.system.uptime);
  document.getElementById('si-node-uptime').textContent = fmtDuration(d.system.nodeUptime);
  document.getElementById('si-load').textContent = d.system.loadAvg[0].toFixed(2);
  document.getElementById('si-models').textContent = d.ollama.models.length + ' installed';

  // Recent runs
  const runsBody = document.getElementById('runs-tbody');
  document.getElementById('runs-count').textContent = d.recentRuns.length;
  if (d.recentRuns.length === 0) {
    runsBody.innerHTML = '<tr><td colspan="4" class="empty">No runs yet</td></tr>';
  } else {
    runsBody.innerHTML = d.recentRuns.map(r => \`<tr>
      <td style="font-size:11px;font-family:var(--mono);color:var(--text3)">\${r.task_id.slice(0,8)}</td>
      <td>\${fmtDate(r.run_at)}</td>
      <td>\${r.duration_ms ? (r.duration_ms/1000).toFixed(1)+'s' : '—'}</td>
      <td>\${badge(r.status)}</td>
    </tr>\`).join('');
  }

  // Tasks page
  const tasksBody = document.getElementById('tasks-tbody');
  document.getElementById('tasks-count').textContent = d.tasks.length;
  if (d.tasks.length === 0) {
    tasksBody.innerHTML = '<tr><td colspan="7" class="empty">No tasks</td></tr>';
  } else {
    tasksBody.innerHTML = d.tasks.map(t => \`<tr>
      <td style="font-size:11px;font-family:var(--mono);color:var(--text3)">\${t.id.slice(0,8)}</td>
      <td>\${t.group_folder}</td>
      <td style="font-size:12px">\${t.schedule_type}: \${t.schedule_value}</td>
      <td style="font-size:12px">\${fmtDate(t.next_run)}</td>
      <td style="font-size:12px">\${fmtDate(t.last_run)}</td>
      <td>\${badge(t.status)}</td>
      <td class="prompt-cell">\${t.prompt}</td>
    </tr>\`).join('');
  }

  // Groups page
  const groupsBody = document.getElementById('groups-tbody');
  document.getElementById('groups-count').textContent = d.groups.length;
  if (d.groups.length === 0) {
    groupsBody.innerHTML = '<tr><td colspan="4" class="empty">No groups registered</td></tr>';
  } else {
    groupsBody.innerHTML = d.groups.map(g => \`<tr>
      <td style="font-weight:600">\${g.name}</td>
      <td style="font-family:var(--mono);font-size:12px">\${g.folder}</td>
      <td>\${g.is_main ? '<span class="badge badge-blue">Main</span>' : '<span class="badge badge-yellow">Group</span>'}</td>
      <td style="font-size:12px;color:var(--text2)">\${fmtDate(g.added_at)}</td>
    </tr>\`).join('');
  }

  // Models page
  const mcount = d.ollama.models.length;
  document.getElementById('models-count').textContent = mcount;
  const mc = document.getElementById('models-content');
  if (!d.ollama.online) {
    mc.innerHTML = '<div class="empty">Ollama is offline (localhost:11434)</div>';
  } else if (mcount === 0) {
    mc.innerHTML = '<div class="empty">No models installed. Try: ollama pull qwen2.5:14b</div>';
  } else {
    mc.innerHTML = '<div class="model-list">' + d.ollama.models.map(m => '<span class="model-chip">' + m + '</span>').join('') + '</div>';
  }

  const cbadge = document.getElementById('comfyui-badge');
  cbadge.textContent = d.comfyui.online ? 'Online' : 'Offline';
  cbadge.className = 'badge ' + (d.comfyui.online ? 'badge-green' : 'badge-red');

  const abadge = document.getElementById('a1111-badge');
  abadge.textContent = d.a1111.online ? 'Online' : 'Offline';
  abadge.className = 'badge ' + (d.a1111.online ? 'badge-green' : 'badge-red');
  if (d.a1111.model) {
    document.getElementById('a1111-model-label').textContent = d.a1111.model;
  }

  // Logs page
  const logViewer = document.getElementById('log-viewer');
  document.getElementById('log-lines-count').textContent = d.logs.length + ' lines';
  if (d.logs.length === 0) {
    logViewer.innerHTML = '<div class="empty">No log entries</div>';
  } else {
    const atBottom = logViewer.scrollHeight - logViewer.clientHeight <= logViewer.scrollTop + 20;
    logViewer.innerHTML = d.logs.map(line => {
      const cls = line.includes('"level":50') || line.includes('"level":60') ? 'log-error'
        : line.includes('"level":40') ? 'log-warn' : 'log-info';
      return '<div class="log-line ' + cls + '">' + line.replace(/</g,'&lt;') + '</div>';
    }).join('');
    if (atBottom) logViewer.scrollTop = logViewer.scrollHeight;
  }

  // Footer
  document.getElementById('last-update').textContent = 'Updated ' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function statusBadge(s) {
  return \`<span class="badge badge-\${s}">\${s}</span>\`;
}

async function fetchApprovals() {
  try {
    const res = await fetch('/api/approvals');
    const d = await res.json();

    const pending = d.pending || [];
    const resolved = d.resolved || [];

    // Update nav badge
    const badge = document.getElementById('nav-approvals-badge');
    if (pending.length > 0) { badge.textContent = pending.length; badge.style.display = ''; }
    else { badge.style.display = 'none'; }

    document.getElementById('approvals-pending-count').textContent = pending.length;
    const pendingList = document.getElementById('approvals-pending-list');
    if (pending.length === 0) {
      pendingList.innerHTML = '<div class="empty">No pending approvals</div>';
    } else {
      pendingList.innerHTML = pending.map(a => \`
        <div class="approval-card" id="approval-\${a.id}">
          <div class="approval-card-header">
            <span class="approval-card-title">\${a.title}</span>
            \${statusBadge(a.status)}
          </div>
          <div class="approval-meta">
            <strong>\${a.skill}</strong> · \${a.stage} · Project: \${a.project} · Group: \${a.group_folder}
            · Requested: \${fmtDate(a.requested_at)}
          </div>
          \${a.summary ? \`<div class="approval-summary">\${esc(a.summary)}</div>\` : ''}
          <div class="approval-actions">
            <button class="btn-approve" onclick="resolveApproval('\${a.id}','approved')">✓ Approve</button>
            <input class="feedback-input" id="feedback-\${a.id}" placeholder="Feedback (optional, for reject)">
            <button class="btn-reject" onclick="resolveApproval('\${a.id}','rejected')">✗ Request Changes</button>
          </div>
        </div>
      \`).join('');
    }

    document.getElementById('approvals-resolved-count').textContent = resolved.length;
    const tbody = document.getElementById('approvals-resolved-tbody');
    if (resolved.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No resolved approvals</td></tr>';
    } else {
      tbody.innerHTML = resolved.map(a => \`<tr>
        <td style="font-weight:600">\${a.title}</td>
        <td>\${a.skill}</td>
        <td style="font-family:var(--mono);font-size:12px">\${a.project}</td>
        <td>\${statusBadge(a.status)}\${a.feedback ? \` <span style="font-size:11px;color:var(--text3)">\${esc(a.feedback)}</span>\` : ''}</td>
        <td style="color:var(--text3);font-size:12px">\${fmtDate(a.resolved_at)}</td>
      </tr>\`).join('');
    }
  } catch(e) {
    console.error('Failed to fetch approvals', e);
  }
}

async function resolveApproval(id, status) {
  const feedback = document.getElementById('feedback-' + id)?.value || '';
  try {
    await fetch('/api/approvals/' + id + '/' + status, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    fetchApprovals();
  } catch(e) {
    console.error('Failed to resolve approval', e);
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchQaRuns() {
  try {
    const res = await fetch('/api/qa-runs');
    const d = await res.json();
    const runs = d.runs || [];
    document.getElementById('qa-count').textContent = runs.length;
    const tbody = document.getElementById('qa-tbody');
    if (runs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No QA runs yet</td></tr>';
    } else {
      tbody.innerHTML = runs.map(r => \`<tr>
        <td style="font-weight:600">\${r.project}</td>
        <td style="color:var(--text3);font-size:12px">\${fmtDate(r.run_at)}</td>
        <td>\${statusBadge(r.status)}</td>
        <td><span class="count-found" style="font-weight:600">\${r.issues_found}</span></td>
        <td><span class="count-fixed" style="font-weight:600">\${r.issues_fixed}</span></td>
        <td><span class="count-pending" style="font-weight:600">\${r.issues_pending}</span></td>
        <td style="font-size:12px;color:var(--text2)">\${r.summary ? esc(r.summary.slice(0,120)) : '—'}</td>
      </tr>\`).join('');
    }
  } catch(e) {
    console.error('Failed to fetch QA runs', e);
  }
}

async function fetchData() {
  try {
    const res = await fetch('/api/status');
    data = await res.json();
    renderData(data);
  } catch (e) {
    console.error('Fetch failed', e);
  }
  resetCountdown();
}

function resetCountdown() {
  clearInterval(refreshTimer);
  countdown = 15;
  refreshTimer = setInterval(() => {
    countdown--;
    document.getElementById('next-refresh').textContent = 'Refresh in ' + countdown + 's';
    if (countdown <= 0) fetchData();
  }, 1000);
}

// Init
const savedTheme = localStorage.getItem('nc-theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
fetchData();
fetchApprovals();
fetchQaRuns();
setInterval(fetchApprovals, 15000);
setInterval(fetchQaRuns, 30000);
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function handleApprovalsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  storePath: string,
): void {
  res.setHeader('Content-Type', 'application/json');

  // GET /api/approvals
  if (req.method === 'GET') {
    const pending = getPendingApprovals();
    const all = getRecentApprovals(30);
    const resolved = all.filter((a) => a.status !== 'pending');

    res.writeHead(200);
    res.end(JSON.stringify({ pending, resolved }));
    return;
  }

  // POST /api/approvals/:id/approve  or  /api/approvals/:id/rejected
  const match = url.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
  if (req.method === 'POST' && match) {
    const [, id, action] = match;
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let feedback: string | undefined;
      try {
        feedback = JSON.parse(body).feedback || undefined;
      } catch {
        /* no body */
      }
      const status = action === 'approve' ? 'approved' : 'rejected';
      resolveApproval(id, status, feedback);
      logger.info({ id, action }, 'Approval resolved via dashboard');

      // On rejection: write an IPC message so Andy notifies the orchestration
      if (status === 'rejected') {
        try {
          const approval = getApproval(id);
          if (approval?.group_folder && approval?.chat_jid) {
            const ipcDir = path.join(
              storePath,
              '..',
              'ipc',
              approval.group_folder,
              'messages',
            );
            fs.mkdirSync(ipcDir, { recursive: true });
            const msgFile = path.join(
              ipcDir,
              `rejection-${id}-${Date.now()}.json`,
            );
            const text = `❌ *${approval.title}* was not approved.\n\nFeedback: ${feedback || '(no feedback provided)'}\n\nPlease revise and resubmit.`;
            fs.writeFileSync(
              msgFile,
              JSON.stringify({
                type: 'message',
                chatJid: approval.chat_jid,
                text,
              }),
            );
            logger.info(
              { id, group: approval.group_folder },
              'Rejection feedback IPC message written',
            );
          }
        } catch (err) {
          logger.error({ err, id }, 'Failed to write rejection IPC message');
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildProjectBrief(lead: Record<string, unknown>): string {
  const name = String(lead.businessName ?? '');
  const address = String(lead.address ?? '');
  const city = address.split(',').slice(-2, -1)[0]?.trim() ?? '';

  const lines = [
    `# Project Brief — ${name}`,
    '',
    `## Business`,
    `- **Name:** ${name}`,
    `- **Category:** ${lead.category ?? 'Not specified'}`,
    `- **Address:** ${address}`,
    `- **Rating:** ${lead.rating ?? 'N/A'}`,
    '',
    `## Contact`,
    `- **Phone:** ${lead.phone ?? lead.phoneAlt ?? 'Not provided'}`,
    `- **Email:** ${lead.email ?? lead.emailAlt ?? 'Not provided'}`,
    `- **Website:** ${lead.websiteUrl ?? 'None — no-website business'}`,
    `- **LinkedIn:** ${lead.linkedin ?? 'N/A'}`,
    `- **Facebook:** ${lead.facebook ?? 'N/A'}`,
    `- **Instagram:** ${lead.instagram ?? 'N/A'}`,
    '',
    `## Target Audience`,
    `Local customers in ${city || 'the area'} searching for ${lead.category ?? 'this service'}.`,
    '',
    `## Website Goals`,
    '- Generate leads and enquiries',
    '- Establish credibility and trust',
    '- Rank locally for relevant search terms',
    '',
    `## Pages Needed`,
    '- Homepage (hero, services overview, CTA)',
    '- Services page (detailed service descriptions)',
    '- About page (business story, team, trust signals)',
    '- Contact page (form, phone, address, map)',
    '',
    `## Notes`,
    lead.notes ? String(lead.notes) : 'No additional notes.',
    '',
    `## Source`,
    `Lead ID: ${lead.id} (webgeek-lead-gen)`,
    `Quality: ${lead.quality ?? 'unknown'}`,
  ];
  return lines.join('\n');
}

function buildUsp(lead: Record<string, unknown>): string {
  const name = String(lead.businessName ?? '');
  const category = String(lead.category ?? 'this service');
  const address = String(lead.address ?? '');
  const city = address.split(',').slice(-2, -1)[0]?.trim() ?? 'the local area';

  return [
    `# USPs — ${name}`,
    '',
    '## Unique Selling Points',
    '',
    `1. Local ${category} business based in ${city} — easy to reach, knows the area`,
    `2. ${lead.rating ? `Rated ${lead.rating}/5 — proven track record with real customers` : 'Established local presence'}`,
    `3. Direct contact with the business — no call centres or middlemen`,
    `4. Specialist in ${category} — focused expertise, not a generalist`,
    `5. Fast response for local customers in ${city}`,
    '',
    '> Note: Verify and expand these USPs with the business owner before finalising copy.',
  ].join('\n');
}

async function handlePipelineWebsite(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  storePath: string,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', resolve);
  });

  let lead: Record<string, unknown>;
  try {
    lead = JSON.parse(body);
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!lead.businessName) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'businessName is required' }));
    return;
  }

  // Generate project slug
  const address = String(lead.address ?? '');
  const city = address.split(',').slice(-2, -1)[0]?.trim() ?? '';
  const slug = slugify(`${lead.businessName}${city ? '-' + city : ''}`);

  // Scaffold project directories
  const projectBase = path.join(
    path.dirname(storePath),
    '..',
    'Documents',
    'Public',
    slug,
  );
  const dirs = [
    'brand', 'wireframe', 'seo/content',
    'creative/copy', 'creative/banners', 'site', 'qa',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectBase, dir), { recursive: true });
  }

  // Write project brief and USPs
  fs.writeFileSync(path.join(projectBase, 'project-brief.md'), buildProjectBrief(lead));
  fs.writeFileSync(path.join(projectBase, 'usp.md'), buildUsp(lead));

  // Ensure IPC dirs exist for main group
  const groups = getAllRegisteredGroups();
  const mainEntry = Object.entries(groups).find(([, g]) => g.isMain);
  if (!mainEntry) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Main group not found' }));
    return;
  }
  const [mainJid, mainGroup] = mainEntry;

  const ipcBase = path.join(path.dirname(storePath), 'ipc', mainGroup.folder);
  fs.mkdirSync(path.join(ipcBase, 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(ipcBase, 'qa'), { recursive: true });

  // Create a once-task to trigger the orchestration agent
  const taskId = `website-gen-${slug}-${Date.now()}`;
  const prompt = [
    `Read .claude/skills/website-generation/SKILL.md and run the website generation pipeline.`,
    ``,
    `Project: ${slug}`,
    `The project brief and USPs are already written at /workspace/extra/miniclaw/${slug}/.`,
    `Skip Phase 1 (requirements-agent) — brief is ready. Start from Phase 2 (branding-agent).`,
    ``,
    `Lead ID for callback: ${lead.id ?? 'unknown'}`,
    `Webgeek callback URL: http://host.docker.internal:3000/api/leads/${lead.id}/update-generated-site`,
  ].join('\n');

  createTask({
    id: taskId,
    group_folder: mainGroup.folder,
    chat_jid: mainJid,
    prompt,
    schedule_type: 'once',
    schedule_value: new Date().toISOString(),
    context_mode: 'group',
    next_run: new Date().toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
  });

  logger.info({ slug, taskId, leadId: lead.id }, 'Website generation pipeline triggered');

  res.writeHead(200);
  res.end(JSON.stringify({ ok: true, project: slug, taskId, dashboardUrl: `http://localhost:${DASHBOARD_PORT}` }));
}

function handleQaRunsApi(res: http.ServerResponse): void {
  res.setHeader('Content-Type', 'application/json');
  const runs = getRecentQaRuns(50);
  res.writeHead(200);
  res.end(JSON.stringify({ runs }));
}

export function startDashboard(
  storePath: string,
  logsPath: string,
): http.Server {
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0];

    if (url === '/api/status') {
      handleApi(storePath, logsPath, res).catch((err) => {
        logger.error({ err }, 'Dashboard API error');
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(err) }));
      });
      return;
    }

    if (url === '/api/qa-runs') {
      handleQaRunsApi(res);
      return;
    }

    if (url === '/api/pipeline/website') {
      handlePipelineWebsite(req, res, storePath).catch((err) => {
        logger.error({ err }, 'Pipeline website API error');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal error' }));
      });
      return;
    }

    if (url?.startsWith('/api/approvals')) {
      handleApprovalsApi(req, res, url, storePath);
      return;
    }

    if (url === '/' || url === '/dashboard' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(DASHBOARD_PORT, '0.0.0.0', () => {
    logger.info({ port: DASHBOARD_PORT }, 'Dashboard started');
  });

  server.on('error', (err) => {
    logger.error({ err }, 'Dashboard server error');
  });

  return server;
}
