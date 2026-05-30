# Agent Handoff

Last updated: `2026-05-30`

## Current Slice

Created the new public fork project `Marananusmrti` from the Marana-Lab codebase and turned it into an unauthenticated shared research workspace.

This slice completed:

- new repo identity and public branding
- removal of Google sign-in and Drive-dependent UX
- shared public Firestore corpus model using `public_nodes`
- checked-in canonical corpus at `src/content/corpus.seed.json`
- public `Explorer`, `Graph`, and `Reading Desk` workspace
- public archive tools for JSON download and local snapshot comparison
- public Gemini assistant + enrichment flow without login
- public server safeguards: body limits, validation, and IP rate limiting
- Bengali sanitization hardening so prompt leakage no longer shows in visible titles

## Files Changed

Primary implementation files:

- `src/App.tsx`
- `src/firebase.ts`
- `src/types.ts`
- `src/utils/focusAnalysis.ts`
- `src/utils/researchIndex.ts`
- `src/lib/publicCorpus.ts`
- `src/lib/archiveUtils.ts`
- `src/components/WorkspaceHeader.tsx`
- `src/components/PublicArchivePanel.tsx`
- `src/components/ResearchWorkspacePanels.tsx`
- `src/components/ConceptNodeView.tsx`
- `server.ts`
- `firestore.rules`
- `cloudbuild.yaml`

Project/workflow/docs:

- `README.md`
- `GOAL.md`
- `MULTI_AGENT_WORKFLOW.md`
- `task.md`
- `walkthrough.md`
- `security_spec.md`
- `firebase-blueprint.json`
- `index.html`
- `metadata.json`
- `package.json`
- `tsconfig.json`
- `tools/claim-agent-lock.ps1`
- `tools/release-agent-lock.ps1`
- `AGENT_LOCK.json`

Removed obsolete private/auth files:

- `src/data.ts`
- `src/driveUtils.ts`
- `src/firestoreUtils.ts`
- `src/googleDrive.ts`

## Data / Persistence Notes

- Exported the richer source corpus and checked it in as `src/content/corpus.seed.json`.
- Public collection is `public_nodes` in Firestore database `ai-studio-f095d8aa-6c1b-4e17-9435-90603aed9b1c`.
- Public rules now allow anonymous `read` and `create`, while rejecting `update` and `delete`.
- A one-time admin migration seeded the live `public_nodes` collection from the richer corpus.
- Live corpus was later verified to accept anonymous AI-generated child nodes.

## Validation Completed

Ran locally:

- `npm run lint`
- `npm run build`

Local browser / Playwright checks against `http://127.0.0.1:3000`:

- verified the app loads with no auth prompt
- verified default mode is `Explorer`
- verified `Open full concept` moves from Explorer into `Reading Desk`
- verified `Graph` mode renders with focus lens controls
- verified isolate control is present
- verified the visible Bengali prompt-leak phrases are no longer rendered
- verified `Archives` renders public download/import controls

Firestore rule checks:

- malformed anonymous create rejected with `403 PERMISSION_DENIED`
- anonymous update rejected with `403 PERMISSION_DENIED`
- anonymous delete rejected with `403 PERMISSION_DENIED`

## Deployment Status

Deployment completed successfully.

Git:

- repo: `https://github.com/avgKol/marananusmrti`
- branch: `main`
- implementation commit: `9e3387d` (`Create public Marananusmrti fork`)

Cloud Build / Cloud Run:

- Cloud Build: `fe44c087-16b7-4d7f-b0f0-de66afa4b024`
- Cloud Build status: `SUCCESS`
- Live revision: `marananusmrti-00003-nll`
- Live URL: `https://marananusmrti-gw6zrea5qq-uw.a.run.app`

Important CI/CD note:

- `cloudbuild.yaml` is in place and works for repo-based deploys.
- Creating a GitHub-triggered Cloud Build with `gcloud builds triggers create github ...` still returns generic `INVALID_ARGUMENT`.
- Most likely blocker: the Cloud Build GitHub App installation is not yet exposing the new `avgKol/marananusmrti` repo to GCP, even though the repo itself exists and `main` is pushed.
- Until that is fixed, use `gcloud builds submit --project gen-lang-client-0390414473 --config cloudbuild.yaml --substitutions "REPO_NAME=marananusmrti,COMMIT_SHA=<git-sha>"`.

## Live Verification

Verified on the deployed public URL:

- app loads with no Google sign-in or logout UI
- default landing view is `Explorer`
- shared public corpus status pill is visible
- Bengali prompt-leak phrases are not visible on the live page
- opening a concept binds Scholar Assistant to the selected concept
- Gemini responds live without login
- Gemini published a meaningful new public node:
  - `Pralaya and the Witness-Self`
- after reload, the new node still appears in the corpus
- live concept count increased from `35` to `36`

## Open Issue For Next Agent

1. Finish true push-to-main GitOps by exposing the new GitHub repo to the Cloud Build GitHub App, then create a persistent trigger for `avgKol/marananusmrti`.

## Notes For The Next Agent

- Read files in this order before working:
  1. `AGENT_LOCK.json`
  2. `MULTI_AGENT_WORKFLOW.md`
  3. `AGENT_HANDOFF.md`
  4. `task.md`
  5. `walkthrough.md`
  6. `GOAL.md`
- Do not reintroduce auth or Drive UX.
- Preserve the three-mode public research workspace.
- Preserve the hardened Bengali sanitization path in `src/utils/focusAnalysis.ts`.
- If you touch deployment, verify both the Cloud Build path and the live public page.
