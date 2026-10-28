# AASHRAY — Habitat Safety & Relocation Intelligence MVP

A local hackathon prototype with a redesigned, clean dashboard inspired by the user-provided UI reference: left navigation, top search/profile bar, five KPI cards, satellite-style risk map, map-layer legend, Copilot panel, at-risk settlement table, relocation planner, and shelter-capacity table.

## Requirements
- Node.js 20+ (Node 22 recommended)
- npm
- Internet connection for online map imagery/labels and Google Fonts

## Run on macOS
1. Extract this folder and open it in VS Code.
2. Open Terminal in the project root (the folder containing `package.json`).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the frontend and API together:
   ```bash
   npm run dev
   ```
5. Open the **Local** address printed by Vite (usually `http://localhost:5173`; if occupied it may use `5174` or another port).
6. API health endpoint: `http://localhost:3001/api/health`.

Keep the terminal open while using the dashboard. If you have another AASHRAY copy running, stop it with `Ctrl+C` in that copy's terminal before starting this one.

## Main features
- Interactive satellite-style map with settlement risk markers, candidate relocation sites, flood/landslide/both controls, and a layer legend.
- KPI cards calculated from the included sample API data.
- Search/filter across settlement names and hazard labels.
- Rule-based Copilot using sample records (not a connected generative AI service).
- Risk-ranked settlements and one-click population selection for the relocation planner.
- Capacity-constrained demo allocation API and candidate-site capacity table.
- JSON action report download and site-screening cards.
- Responsive layouts for laptop, tablet, and mobile.

## Important limitations
- All settlement and candidate-site records are illustrative demo data, not verified real-world data.
- No official government hazard feeds, verified shelter inventory, authentication, or production database are connected.
- The map imagery and labels are online basemaps. Risk circles are illustrative markers, not official hazard polygons.
- This is a decision-support prototype, not an official hazard declaration, evacuation order, or live prediction service.

## API / diagnostics
- `GET /api/health`
- `GET /api/settlements`
- `GET /api/sites`
- `POST /api/allocate` with `{ "people": 1000 }`
- `POST /api/copilot` with `{ "question": "Who needs priority?" }`
- `GET /api/report`
- Versioned routes are documented in `API_CONTRACT.md`.

To run the API smoke test, keep `npm run dev` running and open a second terminal in this folder:
```bash
npm run test:api
```
