# AASHRAY backend architecture

The hackathon MVP is one deployable Node/Express application with modular route groups. This is intentionally simpler than a distributed microservice architecture for a small team, while preserving the responsibility boundaries in the design blueprint.

```text
React + Vite + Leaflet UI
        |
        | /api (current UI routes) + /api/v1 (versioned contract)
        v
Express API + JSON validation + standard error envelopes
        |
        +-- Dashboard summary
        +-- Hazard metadata / GeoJSON map features
        +-- Settlement records and deterministic risk explanations
        +-- Site suitability screening
        +-- Capacity engine
        +-- Constrained relocation planner
        +-- Rule-based copilot grounded in demo records
        +-- Report snapshots and source-status metadata
        |
        v
In-memory illustrative dataset (no database or official live feeds in this MVP)
```

## Service responsibilities

- **API layer:** route parsing, input validation, pagination, stable IDs and consistent response envelopes.
- **GIS/map layer:** GeoJSON FeatureCollection for settlement and candidate-site points; Leaflet displays the map. Polygon overlays and real spatial intersections are not included yet.
- **Hazard ingestion:** source metadata is represented, but official provider adapters are not connected. Do not imply real-time monitoring.
- **Risk engine:** transparent illustrative score/reason records, versioned as `illustrative-rules-v1`; not a validated hazard model.
- **Site suitability:** records pass/fail/unknown for hazard screening, legal status, access and capacity. Unknown never means safe.
- **Capacity engine:** minimum of land, housing, water and sanitation; subtract current occupancy without allowing negative availability.
- **Relocation optimizer:** deterministic greedy allocation over demo-eligible sites, returns unallocated demand instead of over-allocating. For larger/complex cases, replace with a tested optimization solver.
- **Copilot:** deterministic rule-based responses sourced from the same records; no external LLM/API key required.
- **Reports & audit:** JSON snapshot includes generation time, sources, assessment/plan references and safety caveats. Persistent audit storage is a production requirement.
- **Background jobs:** not needed for the small synchronous demo; implement a job queue when GIS or report tasks become long-running.

## Production architecture to grow into

- FastAPI/Pydantic GIS service using GeoPandas, Shapely and Rasterio where raster processing is required.
- PostgreSQL + PostGIS for persistent geospatial data, indexed geometry, audit records and versioned assessments.
- Provider-specific official feed adapters that retain source URL/reference, issue time, valid period, fetch time, coverage, parser status and freshness.
- Authentication, role-based permissions, request/assessment correlation IDs, access logs and reviewed report downloads.
- Background job queue for large spatial analysis and report generation.
- OR-Tools or another constrained optimizer only after the objective and constraints are agreed and tested.

## Data integrity rules

1. Never replace missing/invalid data with zero.
2. Distinguish permanent restrictions, temporary warnings, baseline hazard layers and prototype outputs.
3. Preserve source, retrieval time, validity period and data freshness in records.
4. Population grids are estimates, not household registers.
5. OpenStreetMap is a basemap, not proof of land ownership, shelter authorization, water availability or safe capacity.
6. A numeric score is not an official hazard declaration or evacuation order.
