# Agent Handoff

Last updated: `2026-05-30`

## Current Slice

Investigated and advanced true GitHub-triggered deployment setup for `avgKol/marananusmrti`, then updated the project goal docs with the exact observed CI/CD state.

This slice completed:

- enabled `secretmanager.googleapis.com` in GCP project `gen-lang-client-0390414473`
- granted `roles/secretmanager.admin` to `service-887525091528@gcp-sa-cloudbuild.iam.gserviceaccount.com`
- created 2nd-gen Cloud Build connection `marananusmrti-conn` in `us-west1`
- stored the GitHub authorizer token in Secret Manager secret `github-authorizer-token`
- updated the connection so Cloud Build now holds the authorizer credential
- advanced the connection state from `PENDING_USER_OAUTH` to `PENDING_INSTALL_APP`
- identified the Cloud Build GitHub App installation id from the signed-in browser flow: `136472995`
- confirmed the remaining blocker is a GitHub step-up/passkey confirmation on the installation page
- updated `GOAL.md` to reflect the saved-session / audit-panel product targets and the exact CI/CD state

## Files Changed

Repo files changed in this slice:

- `GOAL.md`
- `AGENT_HANDOFF.md`

## Validation Completed

Docs/infrastructure slice:

- no app code changed, so no `npm` validation was required for this slice
- verified Cloud Build connection state with `gcloud builds connections describe`
- verified the blocker state in the signed-in browser flow and captured the install path through the GitHub App installation page

## Deployment Status

No new app deploy in this slice.

Git:

- repo: `https://github.com/avgKol/marananusmrti`
- branch: `main`
- latest deployed app commit before this slice: `0362a4d`

Cloud Build / Cloud Run state:

- live service: `marananusmrti`
- live URL: `https://marananusmrti-gw6zrea5qq-uw.a.run.app`
- Cloud Build connection: `marananusmrti-conn`
- connection stage: `PENDING_INSTALL_APP`
- Cloud Build GitHub App installation id observed in browser: `136472995`
- GitHub-side blocker: passkey / step-up confirmation required before the app installation can be completed for the repo

Important CI/CD note:

- `cloudbuild.yaml` still works for manual repo-based deploys.
- The old repo `avgKol/marana-lab-take2` uses a working classic GitHub trigger.
- The public fork is now partly migrated to a 2nd-gen connection, but it is not complete yet.
- After the GitHub authorizer token was attached, the remaining work moved fully to the GitHub App install step.
- Until that step is completed, use `gcloud builds submit --project gen-lang-client-0390414473 --config cloudbuild.yaml --substitutions "REPO_NAME=marananusmrti,COMMIT_SHA=<git-sha>"`.

## Open Issue For Next Agent

1. Finish the GitHub App installation step for connection `marananusmrti-conn`.
2. Create the Cloud Build repository resource for `avgKol/marananusmrti`.
3. Create the push trigger for `main`.
4. Prove auto-deploy with a tiny commit and verify the resulting Cloud Run revision.

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
- If you resume the GitHub App flow, the browser already reached `https://github.com/settings/installations/136472995` before the GitHub passkey / step-up prompt blocked completion.
