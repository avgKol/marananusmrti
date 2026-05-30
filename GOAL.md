# Marananusmrti Project Goal

## Purpose

Marananusmrti is a public visual research workspace for studying death, impermanence, Buddhism, Hinduism, Vedanta, Atman, witness-consciousness, and related contemplative ideas.

The goal is to make the app feel like a calm, rigorous public research instrument rather than a private authenticated notebook or a generic card list.

## Product Direction

The workspace should preserve three complementary modes:

1. `Explorer`
2. `Graph`
3. `Reading Desk`

These modes should work together as one public research system:

- `Explorer` for retrieval
- `Graph` for spatial orientation
- `Reading Desk` for deep reading

## Core UX Principles

- Preserve the scholarly dark aesthetic.
- Favor comprehension, retrieval, and reading flow over decoration.
- Keep the corpus public and accessible without sign-in.
- Make it easy to move from keyword to quote to source to full concept.
- Reduce clutter wherever it weakens reading or comparison.
- Keep Bengali sanitization active in visible UI.

## Public Architecture Rules

- No Google sign-in is required anywhere.
- No Google Drive auth is required anywhere.
- The live shared corpus is stored in `public_nodes`.
- The canonical fallback corpus lives in `src/content/corpus.seed.json`.
- Gemini chat, enrichment, and translation remain server-side and public.
- Public writes are create-only; the new app should not rely on editing or deleting existing public nodes.

## Workflow Rules For Agents

Before making changes, read:

1. `AGENT_LOCK.json`
2. `MULTI_AGENT_WORKFLOW.md`
3. `AGENT_HANDOFF.md`
4. `task.md`
5. `walkthrough.md`
6. `GOAL.md`
7. any files directly related to the current slice

Lock protocol:

- claim the repo lock before editing
- keep the task summary short and specific
- release the lock when done
- update `AGENT_HANDOFF.md` before releasing the lock

## Validation Gates

For any UI or persistence slice:

- run `npm run lint`
- run `npm run build`
- test the UI in a browser or Playwright if UI changed
- verify the live page if the change ships

## GitOps / CI-CD Contract

- commit the slice intentionally
- push to `origin/main`
- let Cloud Build / Cloud Run deploy the new revision
- verify the public live URL after deployment
- confirm anonymous load, Gemini response, and public-corpus persistence when behavior is touched

## Deployment Context

- project: `gen-lang-client-0390414473`
- region: `us-west1`
- target service: `marananusmrti`

## Definition Of Success

The project succeeds when:

- the app feels like a serious public research workspace
- the graph, explorer, and reading desk each add real value
- the public corpus stays readable and navigable
- the user can move from concept to keyword to quote to provenance without friction
- the live deployed app matches the repo state
- the app works without authentication
