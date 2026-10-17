# Clorex / WasteRecast — submission checklist

Prepared 17 October 2026. Submission deadline shown on the official event site: **18 October 2026**. Use the participant dashboard for the exact closing time; no midnight cutoff is assumed.

## Submit these

| Field | Value / file |
|---|---|
| Team | Clorex |
| Leader | Zuhaib Ahmed |
| Members | Anshuman Pandey; Aliyan Ahmed |
| Product | WasteRecast |
| Theme | Sustainability & Social Impact |
| Pitch deck | `Clorex_WasteRecast_Pitch_Deck.pdf` — exported from the completed prescribed PPTX template |
| Editable backup | `Clorex_WasteRecast_Pitch_Deck.pptx` |
| Demo video | [Google Drive video](https://drive.google.com/file/d/1e1EyM-4qKs6WXAbR9nq35Z9UsCGghN5u/view) — 3:00, narrated working UI walkthrough |
| Prototype | https://wasterecast.web.app/ |
| GitHub | https://github.com/anshuman542018/wasterecast |
| Brief description | Copy `Submission_Description.txt` |

## Rule checks

- Prescribed template: same 16-slide sequence, section headings, dimensions and event artwork. Download instructions are replaced by a product introduction; the blank page becomes an evidence page. Native process and architecture diagrams remain editable. Sources are in speaker notes.
- Video: 1920×1080 H.264/AAC, exactly 180 seconds. English synthetic narration and captions. Actual interface captures with pauses/waiting time edited. AI walkthrough uses the private local connection; the deployed public app uses Firebase AI Logic. No simulated model responses or fake commercial results.
- Public access: site and repository return HTTP 200 without credentials. Drive metadata confirms `type=anyone`, `role=reader`, with link-only discovery. The video was uploaded and its bytes updated in place; the same file ID is used in all materials.
- Google stack: Firebase Hosting, Cloud Firestore, Firebase AI Logic, Gemini Developer API and Gemini Live are used. **Cloud Run is not deployed.** The official event requirements allow **Cloud Run or Firebase**; do not claim Cloud Run usage in the form.
- Language: submission text, deck and video narration/captions are English. A brief UI language-switch demonstration shows an accessibility feature.
- Eligibility: participant explicitly confirmed all three members are 21+, working professionals and not students on 17 October 2026. This is participant confirmation, not independent identity verification.
- Public repository contains the application and supporting documentation. Secrets remain excluded.

## Verification evidence / practical limits

| Check on 17 October 2026 | Result |
|---|---|
| `npm test` | 39 passed, 0 failed |
| Public Firebase Hosting root and catalog | HTTP 200 |
| Public GitHub page and unauthenticated repository API | HTTP 200; repository public |
| Firebase AI Logic material extraction | HTTP 200; structured polypropylene profile. Temporary App Check diagnostic credential revoked in `finally`. Production enforcement unchanged. |
| Vercel token server + real Gemini Live audio/tool response | Passed. Returned audio and a validated theme tool response. Temporary diagnostic credential revoked. |
| Local browser material/profile/shortlist/enquiry flow | Passed with real Gemini responses and sourced catalog data |
| Public Chrome/Edge material profile | Participant confirmed a Plastic profile appears |
| Codex in-app browser public Gemini request | Network fetch failed; participant's normal-browser check is recorded separately |
| Microphone on the participant's Windows laptop | Participant previously confirmed it works after selecting the Realtek input; not independently re-recorded in this video |

Free-tier quotas and third-party availability can still interrupt evaluation. No paid billing was enabled. Keep Firebase, Firestore rules, Gemini free access and the auxiliary Vercel service active throughout evaluation. The current in-memory token limits are not distributed production quotas.

## Before the final Submit click

1. Watch the entire video and confirm its wording represents the team's work. Synthetic narration can be replaced by a team member's voice using `Demo_Transcript.md` if preferred; preserve the duration.
2. Open the video in an incognito window and confirm playback after Drive finishes processing. Also open the prototype and repository there.
3. In the prototype, run the labelled test scenario below, find leads, open a source and prepare an enquiry. Keep commercial fields blank unless you have actual quotes.
4. Upload the **PDF deck**; paste the three public links and description. Read the portal's final declarations before accepting/submitting. This package does not submit the entry or accept legal declarations for you.
5. Save the portal's submission confirmation and check the entry's links once from the submitted form.

## Copy/paste scenario

```text
Illustrative scenario: clean polypropylene injection-moulding offcuts, 5 tonnes per month, in Pune, Maharashtra, India. No laboratory contaminant results or buyer quotes supplied.
```

Country: India. City: Pune. State: Maharashtra. Tonnes/month: 5. Material family: Auto detect. Flash point: blank.

Expected: Plastic profile; quantity 5; missing facts retained; a source-linked list of potential facilities; enquiries with four unconfirmed checks; economics pending without real quotes. Exact AI wording can vary. Leads are ordered by state/district proximity and name, not by road distance or cheapest buyer. No live quote feed is integrated.

## Official references

- [AI Builder Cup overview, eligibility, timeline and submission requirements](https://aibuildercup.com/)
- [Theme descriptions](https://aibuildercup.com/themes.html)
- Prescribed source: `Submission Template _ AI Builder Cup.pptx`, provided by the participant. It states a three-minute demo; 3:00 also fits the participant's pasted 3–4 minute rule.

## Evidence boundaries

The 912 count is catalog records from MPCB (771), TNPCB (12) and WBPCB (129), not a count of unique verified active buyers. Sources include 2025 and 2023–24 documents. Worldwide map leads are unverified and may include public drop-off centres. No completed transaction, realized savings, measured avoided emissions, independent AI-accuracy benchmark or production-scale load benchmark is claimed. Google free-tier processing and logging terms apply; do not upload confidential material.
