# WasteRecast — Industrial Waste-to-Value Screening

A source-attributed working prototype for the AI Builder Cup 2026 **Sustainability & Social Impact** theme. The app profiles waste and surplus materials from 16 families, including solids, liquids, organics, electronics, and construction waste. It screens public recycler records and prepares a preliminary facility dossier.

## What is real, and what is unknown

- The catalog is extracted from [MPCB's 2025 Circular Economy Directory](https://www.mpcb.gov.in/sites/default/files/whats_new/2025-11/MPCB%20Circular%20Economy%20Directory%202025%20R3_compressed.pdf), [TNPCB's spent solvent recovery list](https://tnpcb.gov.in/PDF/Waste_Mngt/HazardousWaste/SolventRecoveryIndustries.pdf), and [WBPCB's 2023–24 hazardous waste inventory](https://www.wbpcb.gov.in/files/Fr-02-2025-02-39-23haz_inventory_2023_24.pdf). Every record keeps the original PDF URL and page. `python -m backend.refresh_catalog` refetches the public endpoints and keeps a prior source snapshot with a refresh error flag when a board site is unavailable.
- A directory entry is **not** proof that a permit remains valid, that a facility accepts a particular composition, that capacity is available, or that its price is known. The software refuses to mark a directory record as a verified viable transaction.
- A clickable scenario is explicitly labelled as illustrative. It is not represented as a factory's actual waste inventory.
- Annual value is shown in the selected country's currency only after quantity, disposal cost, buyer quote, and transport quote are supplied. The formula is deterministic code. There is no invented CO₂ number.
- The preliminary dossier is a screening document requiring expert and regulator review before any hazardous-waste movement.

## No-cost Google-hosted build

### October 2026 experience update

- Primary controls support English, Hindi, Marathi and Spanish. AI prose follows the selected language; source quotations and facility records remain verbatim. English remains the fallback for some diagnostics and source-specific supporting text.
- Light/dark themes and the interface language persist on the device. Descriptions alone work; the PDF/image upload is in an optional disclosure.
- Lead cards focus on the listed process and next acceptance question. Public catalog addresses are shown with their source. `spark/public/contacts.json` adds 12 phone/email pairs transcribed from the official TNPCB solvent-recovery PDF, checked 15 October 2026. OpenStreetMap leads retain published phone, email, website and address tags where present. Contact details and current authorization still require confirmation; missing contacts are never invented.
- The verification workspace saves up to 30 material-specific leads in this browser. Four user-confirmed checks record material analysis, authorization, acceptance/capacity and a written quote. This is a review checklist, not certification or an AI compatibility score. The enquiry draft is editable and can be copied or printed/saved as PDF; nothing is sent automatically. Saved records include the user's material brief and can be individually removed.
- The assistant accepts typed requests and browser speech recognition where available. It interprets natural-language requests with a bounded Gemini action schema and can fill a brief, run AI profiling and screening, explain/save a lead, prepare an enquiry, enter explicit quotes, calculate value and switch language/theme. Common interface commands run without a model call. A new search clears the previous stream's upload, measured flash point and quantity. Microphone capture starts only on a user click; some browsers send audio to their speech provider. Text reaches Gemini and free quotas apply. Actual microphone/audio capture still requires testing on a supported user browser; typed assistant search has been checked end to end.

The local development port is now **4173** because Windows reserved port 5173 on this machine. The private-key middleware checks the configured loopback host and origin.

The public prototype runs at [wasterecast.web.app](https://wasterecast.web.app). It uses Firebase Hosting and Cloud Firestore on the no-cost Spark plan, with no billing account linked. Firestore stores 912 source-attributed India catalog records for plastics, metals, solvents, and oils in 23 read-only chunks. A bundled copy keeps screening available if Firestore cannot be reached. For other materials and countries, browser-side discovery searches named `industrial=recycling` map records and material-tagged recycling centres within 30 km of the selected city. Centres are marked as public drop-off leads; none of these records prove buyer status, authorization, or material acceptance. The location lookup uses Open-Meteo's free non-commercial endpoint and OpenStreetMap/Overpass public endpoints. Worldwide discovery is best-effort and depends on those public services.

```powershell
npm install
npm run dev
npm test
npm run build
.\.venv\Scripts\python.exe scripts\deploy_spark.py
```

The site is deployed to the separate `wasterecast` Firebase Hosting site in project `parallax-waste-2026-91129`. The Firebase project ID is internal; the product name and public URL are WasteRecast. To reseed the free database or deploy its read-only rules, use `python scripts/seed_firestore.py` and `python scripts/deploy_firestore_rules.py` with an authorized gcloud login. The rules allow reads only for `publicCatalog/india-v1` and its chunks; all client writes and other document paths are denied.

The web app calls the official Firebase AI Logic REST proxy with a domain-restricted reCAPTCHA Enterprise App Check token and the public Firebase app key. Gemini credentials stay managed by Google. The **Gemini Developer API is enabled on Spark**. Gemini 3.5 Flash uses minimal thinking for extraction and low thinking for source assessment; a declared 429/500/503 error permits one attempt with Gemini 3.5 Flash-Lite. Model quota reset information avoids further attempts to an exhausted primary model during that session. The last 12 successful AI responses are cached in memory using input hashes; no input or AI response cache is persisted to browser storage. Network failures and timeouts do not trigger duplicate requests. Live description profiling, uploaded PDF/TXT profiling, individual fit explanations, and shortlist assessments passed on 13 October 2026. Chrome is not connected to the testing tool and has not been separately verified. Manual screening works without AI. App Check remains enforced and no billing account is linked. Documents are sent to Gemini only when “Profile with Gemini” is pressed; the application does not store uploads. Google's free-tier data terms apply. AI monitoring in the project records sampled prompts and outputs in Cloud Logging. Free model quotas remain a limitation for public traffic; reaching all available quotas produces a clear message and keeps manual screening available.

`python scripts/check_gemini.py --profile` independently diagnoses the model and profile schema using an authorized gcloud login. It creates a temporary App Check development credential in memory and revokes it in `finally`; production attestation and enforcement are unchanged. The UI shows a persistent connection result. Results start with five leads, expand evidence on demand, and open the quote calculator for a selected facility.

The checked-in catalog is a dated snapshot. Run `python -m backend.refresh_catalog`, copy `data/catalog.json` to `spark/public/catalog.json`, and reseed Firestore before rebuilding. The refresh preserves old source records and flags a failure if a board site is unavailable.

See [DEMO.md](DEMO.md) for copy-paste test cases and the judge-facing AI methodology.

## Optional local server run

### Use your own Gemini Developer API key locally

Requires Node.js 24+. Copy `.env.example` to `.env`, paste the key after `GEMINI_API_KEY=`, then run `npm run dev`. Open `http://127.0.0.1:4173`. Restart the development server after changing the key. The Vite development middleware sends Gemini requests from Node; the key never enters the browser bundle, client storage, or Git. The endpoint binds to loopback, checks host/origin and a custom request header, accepts bounded inputs, serializes requests, and caps local requests at 20/hour. It reuses the structured extraction/shortlist schemas, model fallback and memory cache. Google free-tier quotas still apply. Use only a key whose owner has authorized this usage.

This local connection does **not** change `https://wasterecast.web.app`: that site still uses Firebase AI Logic. `npm run build` removes the development-only connection and never reads the root `.env`. Hosting a private API-key backend on Google requires a billing-enabled Cloud Run/Functions project; no billing is enabled by this setup. The optional Python backend below remains a separate Vertex AI path.

Requires Python 3.12+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000`. The public catalog and manual screening work without cloud credentials. For live Gemini profiling, set `GCP_PROJECT_ID` and `GCP_LOCATION`, enable Vertex AI, and use Application Default Credentials locally or a service account on Cloud Run. The Gemini model ID is set with `GEMINI_MODEL`.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m backend.refresh_catalog
```

## Optional Google Cloud server architecture

```text
Browser → Cloud Run (FastAPI + responsive frontend)
             ├─ Vertex AI Gemini: document profiling, fit note
             ├─ BigQuery: parameterized facility shortlist query
             ├─ Firestore: analysis run records
             ├─ Cloud Storage: uploaded documents
             └─ official public board PDFs: source catalog refresh
```

Set `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCS_BUCKET`, `BIGQUERY_DATASET`, and `CATALOG_REFRESH_TOKEN` on Cloud Run. Run `python -m backend.sync_bigquery` once after deploying, and after each catalog refresh. Cloud Run's service account needs `aiplatform.user`, Firestore document access, Storage object creation, and BigQuery query/load permissions scoped to this project. Do not put a service-account key in the repository or container.

The public `/api/catalog/refresh` endpoint requires `X-Catalog-Refresh-Token`; keep it disabled unless the token is configured. For a public demo, apply Cloud Run request limits and budget alerts before sharing the URL, since Gemini calls consume quota.

## API

- `GET /api/health`: component status
- `GET /api/catalog`: source-attributed facility records by material family/state
- `GET /api/chemicals?name=`: live PubChem PUG REST chemical identity lookup, with a clear composition caveat
- `POST /api/profile`: Gemini profiling from text and optional PDF/image/TXT upload
- `POST /api/matches`: deterministic screening and economics, with BigQuery shortlist when configured
- `POST /api/explain`: Gemini technical screening note for a selected candidate
- `POST /api/dossier`: printable preliminary dossier with source reference and unanswered checks
- `POST /api/catalog/refresh`: protected, direct refresh from official board PDFs

## Limitations and path to a production marketplace

This is a production-shaped **screening prototype**, not an operating waste marketplace. Real transactions need facility onboarding, current authorization evidence, accepted material specifications, lab results, live capacity, binding price and transport quotes, location-specific movement rules, identity and access controls, and professional compliance review. Public PDF directories do not expose all of those fields or a guaranteed real-time API. The data model treats absent information as unknown rather than filling it in with AI.

The PDF import is checked into `data/catalog.json` for a deterministic demo. A refresh records each source's retrieval time and SHA-256. Extracted names and capacities should be manually audited against the corresponding source pages before any external use.
