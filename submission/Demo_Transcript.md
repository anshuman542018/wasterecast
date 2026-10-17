# WasteRecast — three-minute demo

Team: Clorex. Recorded 17 October 2026. Synthetic narration (Microsoft Zira). Actual application captures, with pauses and waiting time edited. The AI walkthrough uses the private local server; deployed public profiling uses Firebase AI Logic and was confirmed working by the participant in Chrome/Edge on the same date. No simulated AI responses, contacts, prices or transactions.

## 0:00 — 01 / WasteRecast by Clorex

WasteRecast helps a business turn an unclear waste description into recovery leads and an acceptance enquiry. Our Sustainability and Social Impact prototype focuses on a practical obstacle: knowing which facility is worth approaching, and what evidence is still missing.

## 0:16 — 02 / An explicitly labelled scenario

Here we enter an illustrative scenario: five tonnes per month of polypropylene offcuts in Pune. The records are real public listings; this producer scenario is not real. This recording uses our private local Gemini connection. The public website uses Firebase AI Logic.

## 0:34 — 03 / Gemini extracts facts and gaps

Gemini identifies plastic, extracts the stated quantity and location, and lists missing laboratory results and buyer quotes. Source and checks exposes the input quotations. The model's confidence is an extraction estimate, not measured accuracy or proof that a recycler can accept this material.

## 0:54 — 04 / Source-linked recovery leads

Find recovery leads screens the sourced catalog. We show five leads first, ordered by state and district proximity. Asking Gemini to review produces a recovery-route hypothesis and the key unanswered question. These are potential leads, not confirmed buyers, live prices, or road-distance rankings.

## 1:15 — 05 / Inspect the evidence

For A K Enterprises, the source identifies plastic granules and links to page eighty-one of the Maharashtra board directory. The app asks for current authorization, exact accepted composition, capacity and a written price. Published contact details are shown where available; missing phone numbers and email addresses are not invented.

## 1:36 — 06 / Prepare an acceptance enquiry

Prepare enquiry creates a draft containing the material, quantity, origin, source link and questions for the facility. Nothing is sent automatically. All four review checks start unconfirmed. A user can save the lead, copy the draft, or print it as a PDF after reviewing the information.

## 1:58 — 07 / Economics waits for real quotes

The commercial calculator belongs to the selected facility. Without actual buyer and transport quotes, its value remains pending. Once supplied, it annualizes the quantity times avoided disposal cost plus the buyer quote, minus transport and pretreatment. Gemini does not invent revenue or environmental savings.

## 2:18 — 08 / Recast controls the workflow

Recast also supports natural-language app actions. We type, prepare enquiry for lead one. The assistant interprets the request and opens the actual enquiry. Live voice uses Gemini and the Aoede voice with a selectable microphone. Only validated application tools can run.

## 2:36 — 09 / Accessible, deliberate interface

The interface includes four language options, light and dark modes, optional documents and clear next steps. Worldwide discovery uses open map records, with material acceptance explicitly unverified.

## 2:48 — 10 / Built on Firebase and Gemini

Firebase hosts the app. Firestore serves the catalog. Gemini powers understanding and Recast. Our next step is a verified buyer pilot. Explore WasteRecast and the public source code.
