const base = process.env.AASHRAY_API || 'http://localhost:3001';
const checks = [
  ['health', '/api/health'],
  ['dashboard summary', '/api/v1/dashboard/summary'],
  ['hazards', '/api/v1/hazards'],
  ['GeoJSON map', '/api/v1/hazards/map'],
  ['settlements pagination', '/api/v1/settlements?page=1&page_size=2'],
  ['candidate sites', '/api/v1/sites'],
  ['source status', '/api/v1/data-sources/status']
];
let failed = false;
for (const [label, path] of checks) {
  try {
    const response = await fetch(`${base}${path}`);
    const body = await response.json();
    const ok = response.ok && (path === '/api/health' ? body.ok === true : body.data !== undefined);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} (${response.status})`);
    if (!ok) failed = true;
  } catch (error) {
    console.log(`FAIL ${label}: ${error.message}`);
    failed = true;
  }
}
try {
  const response = await fetch(`${base}/api/v1/relocations/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ demand: 1000 }) });
  const body = await response.json();
  const ok = response.status === 201 && body.data && body.data.allocated <= body.data.requested_demand && body.data.unallocated_demand >= 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} constrained allocation (${response.status})`);
  if (!ok) failed = true;
} catch (error) {
  console.log(`FAIL constrained allocation: ${error.message}`);
  failed = true;
}
if (failed) process.exitCode = 1;
