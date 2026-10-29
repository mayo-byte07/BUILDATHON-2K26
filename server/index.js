import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Keeps secrets out of source control while allowing a simple local .env setup.
// Environment variables supplied by the host always take precedence.
function loadLocalEnv() {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadLocalEnv();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const now = () => new Date().toISOString();
const demoMode = 'DEMO / SAMPLE DATA ONLY';
let mode = demoMode;
const settlements = [
  { id: 'ST-001', name: 'Rajpur Riverside', district: 'Pilot District', population: 1840, risk: 91, hazard: 'Flood exposure', hazard_type: 'flood', lat: 29.945, lng: 78.135, reason: 'Low-lying settlement near river corridor; limited all-weather access.', priority: 'Critical', source: 'Illustrative sample dataset', updated_at: now() },
  { id: 'ST-002', name: 'Khera East', district: 'Pilot District', population: 1260, risk: 78, hazard: 'Flood exposure', hazard_type: 'flood', lat: 29.958, lng: 78.164, reason: 'Low elevation and constrained road access in heavy rainfall.', priority: 'High', source: 'Illustrative sample dataset', updated_at: now() },
  { id: 'ST-003', name: 'Shiv Colony', district: 'Pilot District', population: 940, risk: 66, hazard: 'Drainage stress', hazard_type: 'flood', lat: 29.925, lng: 78.176, reason: 'Nearby drainage bottleneck; exposure requires field verification.', priority: 'High', source: 'Illustrative sample dataset', updated_at: now() },
  { id: 'ST-004', name: 'Naya Gaon', district: 'Pilot District', population: 720, risk: 43, hazard: 'Moderate exposure', hazard_type: 'landslide', lat: 29.972, lng: 78.112, reason: 'Some exposure indicators; comparatively better road connectivity.', priority: 'Moderate', source: 'Illustrative sample dataset', updated_at: now() },
  { id: 'ST-005', name: 'Market Ward 3', district: 'Pilot District', population: 1510, risk: 28, hazard: 'Lower baseline exposure', hazard_type: 'flood', lat: 29.934, lng: 78.105, reason: 'Lower score in the illustrative baseline layer; not a safety guarantee.', priority: 'Monitor', source: 'Illustrative sample dataset', updated_at: now() }
];

const sites = [
  { id: 'RS-01', name: 'Community Ground North', lat: 29.982, lng: 78.151, land: 650, housing: 420, water: 280, sanitation: 340, occupancy: 60, legal: 'Pending verification', hazard: 'Pass (demo layer)', access: 'Good', healthcare: '2.1 km', status: 'Conditional', district: 'Pilot District', source: 'Illustrative sample dataset' },
  { id: 'RS-02', name: 'School Complex West', lat: 29.916, lng: 78.091, land: 360, housing: 300, water: 220, sanitation: 240, occupancy: 40, legal: 'Verified for demo', hazard: 'Pass (demo layer)', access: 'Good', healthcare: '0.8 km', status: 'Suitable for review', district: 'Pilot District', source: 'Illustrative sample dataset' },
  { id: 'RS-03', name: 'Industrial Plot South', lat: 29.902, lng: 78.189, land: 900, housing: 700, water: 180, sanitation: 450, occupancy: 20, legal: 'Pending verification', hazard: 'Needs review', access: 'Limited', healthcare: '5.4 km', status: 'Needs review', district: 'Pilot District', source: 'Illustrative sample dataset' },
  { id: 'RS-04', name: 'Hillview Open Area', lat: 29.989, lng: 78.087, land: 500, housing: 350, water: 360, sanitation: 310, occupancy: 25, legal: 'Pending verification', hazard: 'Needs review', access: 'Moderate', healthcare: '3.8 km', status: 'Conditional', district: 'Pilot District', source: 'Illustrative sample dataset' }
];
const hazards = [
  { id: 'HZ-FLD-DEMO', type: 'flood', name: 'Baseline flood exposure layer', status: 'demo', permanence: 'baseline', source: 'Illustrative sample dataset', issued_at: null, fetched_at: now(), caveat: 'Not an official forecast or warning.' },
  { id: 'HZ-LND-DEMO', type: 'landslide', name: 'Terrain / landslide screening layer', status: 'demo', permanence: 'baseline', source: 'Illustrative sample dataset', issued_at: null, fetched_at: now(), caveat: 'Not a validated geological hazard map.' }
];
const assessments = new Map();
const relocationPlans = new Map();
const reports = new Map();

const sourceConfig = {
  settlements: { name: 'Settlement records', url: process.env.LIVE_SETTLEMENTS_URL, token: process.env.LIVE_SETTLEMENTS_API_KEY },
  sites: { name: 'Shelter / candidate-site inventory', url: process.env.LIVE_SITES_URL, token: process.env.LIVE_SITES_API_KEY },
  hazards: { name: 'Hazard feed', url: process.env.LIVE_HAZARDS_URL, token: process.env.LIVE_HAZARDS_API_KEY },
  earthquakes: { name: 'Earthquake feed', url: process.env.LIVE_EARTHQUAKES_URL, token: process.env.LIVE_EARTHQUAKES_API_KEY },
  weather: { name: 'Weather / rainfall feed', url: process.env.LIVE_WEATHER_URL, token: process.env.LIVE_WEATHER_API_KEY }
};
const sourceStatus = Object.fromEntries(Object.entries(sourceConfig).map(([id, config]) => [id, {
  id, name: config.name, status: config.url ? 'configured' : 'not_configured', last_fetched_at: null, error: null, source_reference: config.url || 'Add a URL in .env'
}]));
const refreshMinutes = Math.max(1, Number(process.env.LIVE_REFRESH_MINUTES || 5));
const liveHazardRecords = { hazards: [], earthquakes: [] };
let weatherSnapshot = null;

function recordList(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.data || payload?.results || payload?.features || payload?.items || payload?.events || payload?.records || payload?.elements || [];
}
function numeric(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function getValue(row, names, fallback) { for (const name of names) if (row?.[name] !== undefined && row[name] !== null) return row[name]; return fallback; }
function normalizeSettlement(row, index) {
  const properties = row.properties || row;
  const coordinates = row.geometry?.coordinates || [];
  const risk = Math.max(0, Math.min(100, numeric(getValue(properties, ['risk', 'risk_score', 'score'], 0))));
  return { id: String(getValue(properties, ['id', 'settlement_id', 'code'], `LIVE-ST-${index + 1}`)), name: String(getValue(properties, ['name', 'settlement_name'], `Unnamed settlement ${index + 1}`)), district: String(getValue(properties, ['district', 'district_name'], 'Unspecified')), population: Math.max(0, numeric(getValue(properties, ['population', 'estimated_population'], 0))), risk, hazard: String(getValue(properties, ['hazard', 'hazard_name'], 'Live data')), hazard_type: String(getValue(properties, ['hazard_type', 'type'], 'unknown')).toLowerCase(), lat: numeric(getValue(properties, ['lat', 'latitude'], coordinates[1])), lng: numeric(getValue(properties, ['lng', 'lon', 'longitude'], coordinates[0])), reason: String(getValue(properties, ['reason', 'notes'], 'Provided by connected data source.')), priority: risk >= 80 ? 'Critical' : risk >= 60 ? 'High' : risk >= 40 ? 'Moderate' : 'Monitor', source: 'Connected live settlement feed', updated_at: now() };
}
function normalizeSite(row, index) {
  const properties = row.properties || row;
  const coordinates = row.geometry?.coordinates || [];
  return { id: String(getValue(properties, ['id', 'site_id', 'code'], `LIVE-RS-${index + 1}`)), name: String(getValue(properties, ['name', 'site_name'], `Unnamed site ${index + 1}`)), lat: numeric(getValue(properties, ['lat', 'latitude'], coordinates[1])), lng: numeric(getValue(properties, ['lng', 'lon', 'longitude'], coordinates[0])), land: Math.max(0, numeric(getValue(properties, ['land', 'land_capacity', 'capacity'], 0))), housing: Math.max(0, numeric(getValue(properties, ['housing', 'housing_capacity', 'capacity'], 0))), water: Math.max(0, numeric(getValue(properties, ['water', 'water_capacity', 'capacity'], 0))), sanitation: Math.max(0, numeric(getValue(properties, ['sanitation', 'sanitation_capacity', 'capacity'], 0))), occupancy: Math.max(0, numeric(getValue(properties, ['occupancy', 'occupied'], 0))), legal: String(getValue(properties, ['legal', 'legal_status'], 'Unknown — verify')), hazard: String(getValue(properties, ['hazard', 'hazard_status'], 'Unknown — verify')), access: String(getValue(properties, ['access', 'access_status'], 'Unknown')), healthcare: String(getValue(properties, ['healthcare', 'healthcare_distance'], 'Unknown')), status: String(getValue(properties, ['status'], 'Needs verification')), district: String(getValue(properties, ['district', 'district_name'], 'Unspecified')), source: 'Connected live site feed' };
}
async function refreshSource(id) {
  const config = sourceConfig[id];
  const status = sourceStatus[id];
  if (!config?.url) return status;
  status.status = 'refreshing';
  try {
    const headers = { accept: 'application/json' };
    if (config.token) headers.authorization = `Bearer ${config.token}`;
    const response = await fetch(config.url, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Provider responded ${response.status}`);
    const payload = await response.json();
    if (id === 'weather') {
      weatherSnapshot = { current: payload.current || null, hourly: payload.hourly || null, fetched_at: now(), source: config.url };
      status.status = 'live'; status.last_fetched_at = weatherSnapshot.fetched_at; status.error = null;
      return status;
    }
    const records = recordList(payload);
    if (!Array.isArray(records)) throw new Error('Expected an array, data, results, items, events, records, elements, or GeoJSON features array.');
    if (id === 'settlements' && records.length) { settlements.splice(0, settlements.length, ...records.map(normalizeSettlement)); mode = 'LIVE DATA — VERIFY WITH PROVIDER'; }
    if (id === 'sites' && records.length) { sites.splice(0, sites.length, ...records.map(normalizeSite)); mode = 'LIVE DATA — VERIFY WITH PROVIDER'; }
    if ((id === 'hazards' || id === 'earthquakes') && records.length) {
      liveHazardRecords[id] = records.map((row, index) => { const item = row.properties || row; return { id: String(item.id || row.id || `LIVE-${id.toUpperCase()}-${index + 1}`), type: String(item.type || item.hazard_type || item.categories?.[0]?.id || item.categories?.[0]?.title || (id === 'earthquakes' ? 'earthquake' : 'unknown')), name: String(item.name || item.title || 'Live hazard item'), status: String(item.status || (item.closed ? 'closed' : 'active')), permanence: 'provider', source: `Connected live ${id} feed`, issued_at: item.issued_at || item.timestamp || item.date || item.time || null, fetched_at: now(), caveat: 'Provider data must be validated by competent authorities.' }; });
      hazards.splice(0, hazards.length, ...Object.values(liveHazardRecords).flat()); mode = 'LIVE DATA — VERIFY WITH PROVIDER';
    }
    status.status = records.length ? 'live' : 'empty'; status.last_fetched_at = now(); status.error = null;
  } catch (error) { status.status = 'error'; status.error = error.message; }
  return status;
}
async function refreshAllSources() { await Promise.all(Object.keys(sourceConfig).map(refreshSource)); }

async function geminiAnswer(question) {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const context = { dashboard: summary(), settlements: [...settlements].sort((a, b) => b.risk - a.risk).slice(0, 5), sites: sites.map(siteRecord), hazards: hazards.slice(0, 20), weather: weatherSnapshot?.current || null };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: 'You are AASHRAY, a disaster-planning decision-support assistant. Use only the supplied dashboard data. Never describe information as an official warning, evacuation order, safety approval, or prediction. Clearly state uncertainty and recommend verification with competent local authorities.' }] }, contents: [{ role: 'user', parts: [{ text: `Dashboard data:\n${JSON.stringify(context)}\n\nQuestion: ${question}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 500 } })
  });
  if (!response.ok) throw new Error(`Gemini responded ${response.status}`);
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned no usable text.');
  return text;
}

function capacity(site) {
  const limits = [['land', site.land], ['housing', site.housing], ['water', site.water], ['sanitation', site.sanitation]];
  const effective = Math.min(...limits.map(([, value]) => value));
  const bottleneck = limits.slice().sort((a, b) => a[1] - b[1])[0][0];
  return { effective, available: Math.max(0, effective - site.occupancy), bottleneck };
}
function siteRecord(site) { return { ...site, ...capacity(site) }; }
function envelope(data, meta = {}) { return { data, meta: { mode, generated_at: now(), ...meta } }; }
function fail(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) }, meta: { generated_at: now() } });
}
function numberParam(value, fallback, min, max) {
  const n = value === undefined ? fallback : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function riskReasons(s) {
  const reasons = [];
  if (s.risk >= 80) reasons.push('High illustrative baseline risk score');
  if (s.hazard.toLowerCase().includes('flood')) reasons.push('Flood-exposure indicator in sample layer');
  if (s.reason.toLowerCase().includes('access')) reasons.push('Road-access limitation mentioned in sample record');
  return reasons.length ? reasons : ['Lower relative score in this illustrative dataset'];
}
function summary() {
  const totalPopulation = settlements.reduce((sum, s) => sum + s.population, 0);
  const highRisk = settlements.filter(s => s.risk >= 80).length;
  const totalCapacity = sites.reduce((sum, s) => sum + siteRecord(s).available, 0);
  return { district_id: 'PILOT-01', district_name: 'Pilot District', hazard_type: 'all', total_settlements: settlements.length, at_risk_settlements: settlements.filter(s => s.risk >= 60).length, high_priority_settlements: highRisk, estimated_population: totalPopulation, candidate_sites: sites.length, indicative_available_capacity: totalCapacity, data_mode: mode, notes: ['All records are illustrative sample data.', 'No official live feed is connected.'] };
}

// Legacy routes retained for the current frontend.
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'AASHRAY demo API', mode: 'sample-data', api_version: 'v1', timestamp: now() }));
app.get('/api/settlements', (_req, res) => res.json(settlements));
app.get('/api/sites', (_req, res) => res.json(sites.map(siteRecord)));
app.post('/api/allocate', (req, res) => {
  const requested = Number(req.body?.people);
  if (!Number.isInteger(requested) || requested < 0 || requested > 1000000) return fail(res, 400, 'VALIDATION_ERROR', 'people must be an integer between 0 and 1,000,000.');
  let remaining = requested;
  const eligible = sites.map(siteRecord).filter(s => s.hazard.toLowerCase().startsWith('pass') && s.legal.toLowerCase().startsWith('verified')).sort((a, b) => b.available - a.available);
  const allocations = eligible.map(s => { const people = Math.min(remaining, s.available); remaining -= people; return { siteId: s.id, site: s.name, people, available: s.available }; }).filter(x => x.people > 0);
  res.json({ requested, allocated: requested - remaining, unallocated: remaining, allocations, note: 'Allocation only considers demo sites marked hazard-pass and legally verified in this sample dataset. Real deployments require authority validation.' });
});
app.post('/api/copilot', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return fail(res, 400, 'VALIDATION_ERROR', 'question is required.');
  try {
    const answer = await geminiAnswer(question);
    res.json({ answer: answer || copilotAnswer(question), mode: answer ? 'Gemini (server-side key)' : 'rule-based demo assistant', disclaimer: 'Decision support only. Verify all data and decisions with qualified authorities.' });
  } catch (error) {
    console.warn(`Gemini unavailable; using rule-based fallback: ${error.message}`);
    res.json({ answer: copilotAnswer(question), mode: 'rule-based fallback', disclaimer: 'Gemini was unavailable. Verify all data and decisions with qualified authorities.' });
  }
});
app.get('/api/report', (_req, res) => {
  const payload = buildReport();
  res.setHeader('Content-Disposition', 'attachment; filename="aashray-action-report.json"');
  res.json(payload);
});

function copilotAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('priority') || q.includes('risk') || q.includes('settlement')) {
    const top = [...settlements].sort((a, b) => b.risk - a.risk).slice(0, 3);
    return `Highest illustrative risk scores: ${top.map(s => `${s.name} (${s.risk}/100; ${s.population.toLocaleString()} estimated people)`).join(', ')}. Reasons include the sample flood-exposure layer and recorded access constraints. These are prototype indicators, not official warnings or evacuation orders.`;
  }
  if (q.includes('capacity') || q.includes('allocate') || q.includes('relocat') || q.includes('people')) {
    const eligible = sites.map(siteRecord).filter(s => s.hazard.toLowerCase().startsWith('pass') && s.legal.toLowerCase().startsWith('verified'));
    return `The demo has ${eligible.reduce((sum, s) => sum + s.available, 0).toLocaleString()} indicative available places at sites that pass the demo hazard check and are marked legally verified. ${eligible.map(s => `${s.name}: ${s.available} available; water is the limiting capacity at ${s.water}`).join('; ')}. These are sample values, not verified real-world capacity.`;
  }
  if (q.includes('water') || q.includes('resource') || q.includes('gap')) return sites.map(s => { const c = capacity(s); return `${s.name}: effective capacity ${c.effective}, available ${c.available}; limiting resource: ${c.bottleneck}.`; }).join(' ');
  if (q.includes('report') || q.includes('summary')) return `Pilot summary: ${settlements.length} sample settlements, ${settlements.reduce((sum, s) => sum + s.population, 0).toLocaleString()} estimated people and ${sites.length} candidate relocation sites. Highest score: ${[...settlements].sort((a, b) => b.risk - a.risk)[0].name}. All records are illustrative demo data.`;
  return 'I can summarize risk priorities, explain site capacity limits, check resource gaps, or create a pilot summary from the current sample records. Try “Who needs priority?”, “How many people can we allocate?”, or “Show water resource gaps”.';
}
function buildReport({ assessment_id = null, plan_id = null } = {}) {
  return { report_id: randomUUID(), product: 'AASHRAY', generated_at: now(), mode, assessment_id, plan_id, dashboard: summary(), settlements, sites: sites.map(siteRecord), hazards, disclaimer: 'Not an official hazard declaration, evacuation order, or live prediction. Verify data, legal status, safety, and capacities with competent authorities.' };
}

// Versioned REST API contract (v1). All responses use a consistent data/meta envelope.
app.get('/api/v1/dashboard/summary', (req, res) => {
  const data = summary();
  if (req.query.hazard_type) data.hazard_type = String(req.query.hazard_type);
  if (req.query.district_id) data.district_id = String(req.query.district_id);
  res.json(envelope(data));
});
app.get('/api/v1/hazards', (req, res) => {
  const list = hazards.filter(h => (!req.query.type || h.type === String(req.query.type)) && (!req.query.status || h.status === String(req.query.status)));
  res.json(envelope(list, { count: list.length }));
});
app.get('/api/v1/weather', (_req, res) => res.json(envelope(weatherSnapshot, { connected: Boolean(weatherSnapshot), caveat: 'Weather observations and forecasts are informational and not official warnings.' })));
app.get('/api/v1/hazards/map', (req, res) => {
  const features = [
    ...settlements.map(s => ({ type: 'Feature', id: s.id, geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { feature_type: 'settlement', name: s.name, risk: s.risk, population: s.population, hazard_type: s.hazard_type, source: s.source } })),
    ...sites.map(s => ({ type: 'Feature', id: s.id, geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { feature_type: 'candidate_site', name: s.name, ...siteRecord(s), source: s.source } }))
  ];
  res.json(envelope({ type: 'FeatureCollection', features }, { format: 'GeoJSON', feature_count: features.length, caveat: 'Sample points only; no verified hazard polygons are included.' }));
});
app.get('/api/v1/settlements', (req, res) => {
  const page = numberParam(req.query.page, 1, 1, 100000);
  const pageSize = numberParam(req.query.page_size, 10, 1, 100);
  if (!page || !pageSize) return fail(res, 400, 'VALIDATION_ERROR', 'page must be >= 1 and page_size must be between 1 and 100.');
  const q = String(req.query.q || '').toLowerCase();
  const minPriority = req.query.min_priority ? Number(req.query.min_priority) : null;
  let rows = settlements.filter(s => (!req.query.district_id || s.district === req.query.district_id || req.query.district_id === 'PILOT-01') && (!req.query.hazard_type || s.hazard_type === req.query.hazard_type) && (minPriority === null || s.risk >= minPriority) && (!q || `${s.name} ${s.hazard} ${s.id}`.toLowerCase().includes(q)));
  rows = rows.sort((a, b) => b.risk - a.risk);
  const total = rows.length;
  res.json(envelope(rows.slice((page - 1) * pageSize, page * pageSize), { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) }));
});
app.get('/api/v1/settlements/:id', (req, res) => {
  const s = settlements.find(x => x.id === req.params.id);
  if (!s) return fail(res, 404, 'NOT_FOUND', `Settlement ${req.params.id} was not found.`);
  res.json(envelope({ ...s, risk_reasons: riskReasons(s), boundary_reference: null, caveat: 'Boundary geometry is not supplied in this demo.' }));
});
app.post('/api/v1/assessments/run', (req, res) => {
  const { settlement_ids, district_id, hazard_type = 'flood', scenario_id = 'BASELINE-DEMO' } = req.body || {};
  if (!Array.isArray(settlement_ids) && !district_id) return fail(res, 400, 'VALIDATION_ERROR', 'Provide settlement_ids as an array or district_id.');
  if (settlement_ids !== undefined && (!Array.isArray(settlement_ids) || settlement_ids.some(id => typeof id !== 'string'))) return fail(res, 400, 'VALIDATION_ERROR', 'settlement_ids must be an array of string IDs.');
  const selected = settlements.filter(s => (!settlement_ids || settlement_ids.includes(s.id)) && (!district_id || district_id === 'PILOT-01' || s.district === district_id) && (!hazard_type || s.hazard_type === hazard_type || hazard_type === 'all'));
  if (!selected.length) return fail(res, 404, 'NO_MATCHING_SETTLEMENTS', 'No settlements matched the assessment request.');
  const id = `ASM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const record = { id, status: 'completed', scenario_id, hazard_type, created_at: now(), scores: selected.map(s => ({ settlement_id: s.id, score: s.risk, priority: s.priority, reasons: riskReasons(s), source: s.source })), model_version: 'illustrative-rules-v1', caveats: ['Scores and weights are illustrative, not validated.', 'No official live hazard feed is connected.'] };
  assessments.set(id, record);
  res.status(201).json(envelope(record));
});
app.get('/api/v1/assessments/:id', (req, res) => {
  const item = assessments.get(req.params.id);
  if (!item) return fail(res, 404, 'NOT_FOUND', `Assessment ${req.params.id} was not found.`);
  res.json(envelope(item));
});
app.get('/api/v1/sites', (req, res) => {
  let list = sites.map(siteRecord).filter(s => (!req.query.district_id || req.query.district_id === 'PILOT-01' || s.district === req.query.district_id) && (!req.query.status || s.status.toLowerCase().includes(String(req.query.status).toLowerCase())) && (!req.query.min_capacity || s.available >= Number(req.query.min_capacity)));
  res.json(envelope(list, { count: list.length }));
});
app.post('/api/v1/sites/:id/assess', (req, res) => {
  const s = sites.find(x => x.id === req.params.id);
  if (!s) return fail(res, 404, 'NOT_FOUND', `Candidate site ${req.params.id} was not found.`);
  const c = capacity(s);
  const checks = [
    { criterion: 'hazard_screening', result: s.hazard.startsWith('Pass') ? 'pass' : 'unknown', evidence: s.hazard },
    { criterion: 'legal_status', result: s.legal === 'Verified for demo' ? 'pass' : 'unknown', evidence: s.legal },
    { criterion: 'access', result: s.access === 'Good' ? 'pass' : 'unknown', evidence: s.access },
    { criterion: 'capacity', result: c.available > 0 ? 'pass' : 'fail', evidence: `${c.available} available; limiting resource: ${c.bottleneck}` }
  ];
  res.json(envelope({ site_id: s.id, checks, effective_capacity: c.effective, available_capacity: c.available, limiting_resource: c.bottleneck, status: checks.some(x => x.result === 'fail') ? 'fail' : checks.some(x => x.result === 'unknown') ? 'unknown' : 'pass', caveat: 'Demo screening only. Unknown is not equivalent to safe or approved.' }));
});
app.post('/api/v1/relocations/plan', (req, res) => {
  const demand = Number(req.body?.demand);
  if (!Number.isInteger(demand) || demand < 0 || demand > 1000000) return fail(res, 400, 'VALIDATION_ERROR', 'demand must be an integer between 0 and 1,000,000.');
  const candidateIds = Array.isArray(req.body?.candidate_site_ids) ? req.body.candidate_site_ids : sites.map(s => s.id);
  if (candidateIds.some(id => typeof id !== 'string')) return fail(res, 400, 'VALIDATION_ERROR', 'candidate_site_ids must contain string IDs.');
  let remaining = demand;
  const eligible = sites.map(siteRecord).filter(s => candidateIds.includes(s.id) && s.hazard.toLowerCase().startsWith('pass') && s.legal.toLowerCase().startsWith('verified')).sort((a, b) => b.available - a.available);
  const assignments = eligible.map(s => { const people = Math.min(remaining, s.available); remaining -= people; return { site_id: s.id, site_name: s.name, assigned: people, available_capacity: s.available, remaining_capacity: s.available - people }; }).filter(a => a.assigned > 0);
  const plan = { id: `PLAN-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'draft', created_at: now(), requested_demand: demand, allocated: demand - remaining, unallocated_demand: remaining, assignments, constraints: ['Only demo sites marked hazard-pass and legally verified are eligible.', 'Site capacity uses the strictest of land, housing, water and sanitation, less occupancy.'], objective: req.body?.objective || 'maximize_feasible_allocation', caveat: 'Draft only; not an evacuation or relocation order.' };
  relocationPlans.set(plan.id, plan);
  res.status(201).json(envelope(plan));
});
app.get('/api/v1/relocations/:id', (req, res) => {
  const plan = relocationPlans.get(req.params.id);
  if (!plan) return fail(res, 404, 'NOT_FOUND', `Relocation plan ${req.params.id} was not found.`);
  res.json(envelope(plan));
});
app.post('/api/v1/copilot/query', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return fail(res, 400, 'VALIDATION_ERROR', 'question is required.');
  try {
    const answer = await geminiAnswer(question);
    res.json(envelope({ answer: answer || copilotAnswer(question), mode: answer ? 'Gemini (server-side key)' : 'rule-based demo assistant', citations: [{ type: 'dataset', id: 'dashboard-data' }], caveats: ['Decision support only; verify with competent authorities.'] }));
  } catch (error) {
    console.warn(`Gemini unavailable; using rule-based fallback: ${error.message}`);
    res.json(envelope({ answer: copilotAnswer(question), mode: 'rule-based fallback', citations: [{ type: 'dataset', id: 'dashboard-data' }], caveats: ['Gemini was unavailable.', 'Decision support only; verify with competent authorities.'] }));
  }
});
app.get('/api/v1/data-sources/status', (_req, res) => {
  const configured = Object.values(sourceStatus);
  const hasLive = ['settlements', 'sites', 'hazards', 'earthquakes'].some(id => sourceStatus[id]?.status === 'live');
  res.json(envelope([
    ...configured,
    { id: 'demo-fallback', name: 'Bundled illustrative records', status: hasLive ? 'standby' : 'demo', last_fetched_at: null, error: null, source_reference: 'Local sample dataset' },
    { id: 'basemap', name: 'Online basemap imagery and labels', status: 'external-basemap-only', last_fetched_at: null, error: null, source_reference: 'Online third-party map tiles' }
  ], { refresh_minutes: refreshMinutes, has_live_data: hasLive, all_official_feeds_connected: false }));
});
app.post('/api/v1/data-sources/refresh', async (_req, res, next) => {
  try { await refreshAllSources(); res.json(envelope(Object.values(sourceStatus), { refreshed_at: now() })); } catch (error) { next(error); }
});
app.post('/api/v1/reports/generate', (req, res) => {
  const { assessment_id = null, plan_id = null, format = 'json' } = req.body || {};
  if (!['json'].includes(format)) return fail(res, 400, 'VALIDATION_ERROR', 'Only json report format is supported in this MVP.');
  if (assessment_id && !assessments.has(assessment_id)) return fail(res, 404, 'UNKNOWN_ASSESSMENT', `Assessment ${assessment_id} was not found.`);
  if (plan_id && !relocationPlans.has(plan_id)) return fail(res, 404, 'UNKNOWN_PLAN', `Relocation plan ${plan_id} was not found.`);
  const report = buildReport({ assessment_id, plan_id });
  reports.set(report.report_id, report);
  res.status(201).json(envelope({ report_id: report.report_id, status: 'ready', format, download_url: `/api/v1/reports/${report.report_id}/download`, generated_at: report.generated_at }));
});
app.get('/api/v1/reports/:id/download', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) return fail(res, 404, 'NOT_FOUND', `Report ${req.params.id} was not found.`);
  res.setHeader('Content-Disposition', `attachment; filename="aashray-${req.params.id}.json"`);
  res.json(report);
});

app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', `Unknown API route: ${req.method} ${req.path}`));
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) return fail(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  console.error(err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
});

const PORT = process.env.PORT || 3001;
refreshAllSources();
setInterval(refreshAllSources, refreshMinutes * 60 * 1000).unref();
app.listen(PORT, () => console.log(`AASHRAY API running at http://localhost:${PORT} (live adapters ready; v1 routes enabled)`));
