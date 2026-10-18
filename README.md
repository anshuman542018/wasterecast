# WasteRecast — Industrial Waste-to-Value Screening

## Global buyer / seller exchange — 18 October 2026

[Buy / Sell worldwide](https://wasterecast.web.app/#exchange) adds Google/email
registration, owner-managed Firestore buyer requests and seller offers, country
filters, evidence-linked acceptance passports, typed pass/fail/unknown checks,
alias/vector/process retrieval, Gemini explanations, conditional processing
investigations, quote-and-yield landed costs, human review and an evaluation lab. Published
listings expire after 30 days; no real businesses or offers are fabricated. See
[EXCHANGE.md](EXCHANGE.md) for data access, AI methodology, deployment, testing and
the limits of estimated fit scores. The updated submission deck and three-minute video demonstrate the exchange,
acceptance checks, conditional investigations, landed costs and evaluation lab.

Upgrade verification: **57 automated tests passed**; the 24 authored acceptance
scenarios passed their proposed labels. A live public Vercel embedding request
returned real 768-dimensional Gemini vectors and passed owner-private durable
quota checks. Three live model runs kept the same conditional decision while
scores varied (55, 70, 65). Authored vector fixtures retrieved their relevant item
at rank one. These are scoped software checks, not independent expert validation,
real-market accuracy or a load benchmark. See the methodology for exact limits.

## AI Builder Cup submission / Clorex

The completed prescribed pitch template (PPTX and PDF), three-minute video link,
brief description, transcript and verification checklist are in
[submission/](submission/README.md). The public prototype remains
[wasterecast.web.app](https://wasterecast.web.app/).

The updated demonstration uses actual public-app captures, real Gemini explanations
and explicitly illustrative material/counterpart/cost inputs. The participant
records their own narration. It visibly shows the signed-out alias/process fallback;
real verified-account embeddings were checked separately. See the submission
checklist and evaluation report for scope and limitations.

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

The site is deployed to the separate `wasterecast` Firebase Hosting site in project `parallax-waste-2026-91129`. The Firebase project ID is internal; the product name and public URL are WasteRecast. To reseed the public catalog or deploy rules, use `python scripts/seed_firestore.py` and `python scripts/deploy_firestore_rules.py` with an authorized gcloud login. The source catalog remains read-only. The global exchange adds schema-validated, email-verified owner writes for listings, and private owner-only member profiles; see [EXCHANGE.md](EXCHANGE.md).

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

### Previous voice recording approach (replaced by Live voice)

The primary Record voice action now uses getUserMedia and MediaRecorder rather than requiring browser SpeechRecognition. Press Record, grant microphone permission, speak, and press Stop. A maximum 30-second / 4 MB in-memory clip is sent through Firebase AI Logic to Gemini for a transcription, then through the bounded assistant action path. The app does not save audio to browser storage or application storage; Google service data/logging terms still apply. Closing the assistant discards pending or captured audio and stops tracks. A browser-recognition alternative remains available when supported.

Spoken replies default on. Automatic voice selection prefers named feminine voices in the selected language, with rate 0.9, pitch 1.04 and volume 0.85. Actual voices come from the device/browser and are selectable with Preview voice. The tested browser supplied Microsoft Heera (English India). This is device speech synthesis, not a paid Google TTS service. Microphone permission remains a user/browser requirement. The Google-hosted audio endpoint passed a generated English speech-clip test; physical live microphone capture still requires that permission.

Diagnostic: `python scripts/check_gemini.py --audio path/to/test.wav --lite` checks audio with a temporary development credential that is revoked in finally. Use a WAV under 4 MB. Never include private recordings without permission.

### Recast live assistant, adapted from HealthByYou Lumi

The current public assistant uses Gemini Live native audio with Aoede, the same voice and streaming approach as Lumi. Start voice once, allow microphone access, and speak naturally across turns. An AudioWorklet sends mono PCM16 at 16 kHz; Gemini returns PCM16 at 24 kHz. Automatic speech detection handles turn-taking. The UI includes live transcripts, interruption, microphone mute, spoken reply mute, minimise and End conversation. Preview Aoede voice starts without requesting a microphone; typed follow-ups use that connection. Sessions last up to five minutes. Hiding or leaving the page stops the microphone. Minimise keeps voice active on this page with a visible End control.

Firebase's browser Live SDK currently omits the App Check token from its WebSocket path (firebase/firebase-js-sdk#10018). Production App Check stays enforced. The site stays on Firebase Hosting. A Node function at `https://wasterecast.vercel.app/api/live-session` verifies the Firebase App Check JWT against Google's public JWKS and issues a one-use Gemini token. The Gemini key is a sensitive Production secret in the existing WasteRecast Vercel project. The browser receives only a token with a sixty-second connection window, a five-minute lifetime and locked model, configuration and tools. Tokens are not persisted or logged by the app. No billing account was added; free quotas still apply.

Two bounded Live tools read the actual workspace context and execute validated app commands. Actual profiling, source-backed matching and uncertainty checks remain in the existing app paths. The assistant cannot send enquiries, pay, delete records or certify acceptance. Routine local interface commands also work without a model session. Audio goes to Google's Gemini service under its free-tier terms during the explicit session; the app does not store recordings. Transcripts stay in page memory.

Security controls include exact CORS origins, explicit consent, signed app attestation, fixed tool definitions, short tokens, and best-effort limits of six sessions per IP per hour and thirty per server instance per hour. These in-memory counters are not distributed production quota guarantees. Google's free quota is the account ceiling. A larger public or paid rollout needs authentication and shared durable limits. Do not enable paid billing without revisiting usage controls.

The function is in `api/live-session.js`; attestation and token creation are in `server/live-token.js`. Development uses the ignored root `.env` through private Vite middleware. Never put the key in a `VITE_` variable. `.vercelignore` excludes local secrets, tools, unrelated projects and outputs from uploads.

Verification commands:

- `npm test`: microphone cancellation, stale permissions, duplicate/cancelled tools, signed-attestation requirement, consent, short locked tokens, CORS, rate limits, secret redaction and existing screening checks.
- `node --env-file=.env scripts/check_live_voice.mjs`: real Gemini one-use session, audio output and a diagnostic tool call. Add `--audio path/to/short-mono-pcm16.wav` for streamed generated speech input. This is not a physical microphone test.
- `python scripts/check_gemini.py --live-token`: deployed token endpoint, real Live audio and tool output, using a temporary App Check development credential revoked in finally. Production enforcement is unchanged.

Physical microphone capture needs browser permission and an available input device. Keep that verification separate from generated speech and typed-to-audio tests.

#### Windows microphone diagnostics

Choose a laptop or headset input from the assistant's Microphone selector. Device changes replace the media track inside the same Live session without spending another token. The real PCM input level is displayed, and a separate receipt appears when Gemini transcribes speech. Quiet input, a suspended audio context, stalled processing and a disconnected microphone have distinct messages. A Resume audio control handles suspended browser audio. The app requests mono input and mixes all supplied channels before resampling; it no longer drops a microphone present only on the second channel. If the AudioWorklet fails or stops producing frames, an in-memory compatible capture path uses the same PCM encoder. Neither path stores a recording. Windows microphone and sound settings remain under user control.

The generated-audio diagnostic now exercises the actual deployed worklet with speech only on channel two before streaming its PCM to Gemini. This verifies capture conversion and transport, not the user's physical device or Windows permissions.
