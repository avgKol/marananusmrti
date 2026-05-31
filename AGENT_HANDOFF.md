# Agent Handoff

Last updated: `2026-05-30`

## Current Slice

Enabled and verified true push-to-`main` auto-deploy for `avgKol/marananusmrti`, then updated the project docs to reflect the final working CI/CD path.

This slice completed:

- created Workload Identity Federation pool `github-actions-pool` in project `gen-lang-client-0390414473`
- created OIDC provider `marananusmrti-provider` restricted to repo `avgKol/marananusmrti` on ref `refs/heads/main`
- granted `roles/iam.workloadIdentityUser` on service account `887525091528-compute@developer.gserviceaccount.com` to that repo principal set
- added GitHub Actions workflow `.github/workflows/deploy.yml`
- configured the workflow to run on push to `main` and `workflow_dispatch`
- configured the workflow to run `npm ci`, `npm run lint`, `npm run build`, authenticate to GCP through OIDC, and submit `cloudbuild.yaml`
- pushed commit `09247d6` and verified the workflow auto-ran
- verified GitHub Actions run `26699949506` succeeded
- verified Cloud Build `11503885-f74a-446c-b368-a4599b38d670` succeeded from that workflow
- verified Cloud Run deployed revision `marananusmrti-00008-sf9`
- updated the docs to reflect the final verified GitHub Actions -> Cloud Build -> Cloud Run path

## Files Changed

Repo files changed in this slice:

- `.github/workflows/deploy.yml`
- `README.md`
- `MULTI_AGENT_WORKFLOW.md`
- `walkthrough.md`
- `GOAL.md`
- `AGENT_HANDOFF.md`

## Validation Completed

Infra slice validation:

- `npm run lint`
- `npm run build`
- verified GitHub Actions workflow run `26699949506` completed successfully
- verified Cloud Build `11503885-f74a-446c-b368-a4599b38d670` completed successfully
- verified the deployed Cloud Run service now points at commit `09247d6894a165ac97a0148bcf1cf01f468ba2f3`
- live browser sanity check on `https://marananusmrti-gw6zrea5qq-uw.a.run.app`
- confirmed the live page loaded unauthenticated and rendered `Marananusmrti` with `Explorer`, `Graph`, and `Reading Desk`

## Deployment Status

Deployment completed successfully.

Git:

- repo: `https://github.com/avgKol/marananusmrti`
- branch: `main`
- latest repo head: `09247d6` (`Add GitHub Actions deploy workflow`)

Cloud Build / Cloud Run state:

- live service: `marananusmrti`
- live URL: `https://marananusmrti-gw6zrea5qq-uw.a.run.app`
- GitHub Actions workflow: `Deploy Marananusmrti`
- GitHub Actions run: `26699949506`
- GitHub Actions status: `SUCCESS`
- Cloud Build: `11503885-f74a-446c-b368-a4599b38d670`
- Cloud Build status: `SUCCESS`
- live revision: `marananusmrti-00008-sf9`
- live deployed commit: `09247d6894a165ac97a0148bcf1cf01f468ba2f3`

Important CI/CD note:

- `.github/workflows/deploy.yml` is now the primary GitOps entrypoint.
- It authenticates to GCP without a stored service-account key by using Workload Identity Federation.
- `cloudbuild.yaml` still works for manual repo-based deploys.
- The old repo `avgKol/marana-lab-take2` uses a working classic GitHub trigger.
- Legacy connection `marananusmrti-conn` remains in place but is no longer required for successful deploys.
- GitHub Actions emitted a warning that several marketplace actions currently run on Node 20 and should eventually be reviewed for newer major versions, but the workflow completed successfully.

## Open Issue For Next Agent

1. Optionally clean up or remove legacy connection `marananusmrti-conn` if it is no longer wanted.
2. Optionally upgrade the GitHub marketplace actions in `.github/workflows/deploy.yml` once newer Node 24-safe majors are confirmed.

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
- The verified deploy proof is: GitHub Actions run `26699949506` -> Cloud Build `11503885-f74a-446c-b368-a4599b38d670` -> Cloud Run revision `marananusmrti-00008-sf9`.
