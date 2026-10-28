# AASHRAY REST API Contract (v1)

All routes are served by the local Express API at `http://localhost:3001`. Versioned routes use `{ data, meta }` success envelopes and `{ error: { code, message }, meta }` error envelopes. Timestamps are ISO-8601 UTC strings. IDs are stable within the seeded demo dataset; generated assessment, plan and report IDs are created at runtime and stored in memory.

> **Safety/data note:** the included settlement, population, hazard and candidate-site values are illustrative sample data. No official hazard feed is connected. API results are decision-support prototypes, not evacuation orders or safety certifications.

## Dashboard & hazards

| Method | Route | Inputs | Response |
|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | Optional `district_id`, `hazard_type` | KPI totals, capacity summary and caveats |
| GET | `/api/v1/hazards` | Optional `type`, `status` | Hazard layer metadata and source notes |
| GET | `/api/v1/hazards/map` | None in MVP; reserved for bbox/type filters | GeoJSON FeatureCollection of demo settlement/site points |

## Settlements & assessments

| Method | Route | Inputs | Response |
|---|---|---|---|
| GET | `/api/v1/settlements` | `page`, `page_size` (1–100), optional `q`, `district_id`, `hazard_type`, `min_priority` | Risk-ranked, paginated rows and pagination metadata |
| GET | `/api/v1/settlements/:id` | Path ID | Settlement record, risk reasons and boundary caveat |
| POST | `/api/v1/assessments/run` | `settlement_ids` array or `district_id`; optional `hazard_type`, `scenario_id` | Creates a completed demo assessment with scores, reasons, source and model version |
| GET | `/api/v1/assessments/:id` | Assessment ID | Assessment scores, provenance and caveats |

## Candidate sites & relocation

| Method | Route | Inputs | Response |
|---|---|---|---|
| GET | `/api/v1/sites` | Optional `district_id`, `status`, `min_capacity` | Candidate site summaries with effective/available capacity |
| POST | `/api/v1/sites/:id/assess` | Optional JSON resource assumptions/scenario (reserved for extension) | Pass/fail/unknown screening checks and effective capacity |
| POST | `/api/v1/relocations/plan` | `demand` integer; optional `candidate_site_ids`, `objective` | Draft allocation plan, assignments, remaining capacity and unallocated demand |
| GET | `/api/v1/relocations/:id` | Plan ID | Saved draft plan |

Capacity rule: `effective_capacity = min(land, housing, water, sanitation)`, and `available_capacity = max(0, effective_capacity - occupancy)`. The demo allocation only uses sites marked as passing the sample hazard check and legally verified in the sample data. A missing/unknown check is not a pass.

## Copilot, data status & reports

| Method | Route | Inputs | Response |
|---|---|---|---|
| POST | `/api/v1/copilot/query` | `question` string | Rule-based answer, dataset reference and caveats; not a generative AI model |
| GET | `/api/v1/data-sources/status` | Optional `district_id` (reserved for extension) | Feed status, last fetch and error metadata; official feeds marked disconnected |
| POST | `/api/v1/reports/generate` | Optional `assessment_id`, `plan_id`; `format: "json"` | Report job metadata and authorized local download path |
| GET | `/api/v1/reports/:id/download` | Report ID | JSON report snapshot |

## Error conventions

- `400 VALIDATION_ERROR` or `400 INVALID_JSON`: invalid inputs/body.
- `404 NOT_FOUND`, `404 NO_MATCHING_SETTLEMENTS`, `404 UNKNOWN_ASSESSMENT`, `404 UNKNOWN_PLAN`: requested record not found.
- `500 INTERNAL_ERROR`: unexpected server error.

Production extensions still required: authentication and role-based permissions, persistent database/PostGIS, request/assessment IDs in logs, audit trail, official provider adapters with licence checks, data freshness validation, and background jobs for long-running GIS/report work.
