# Multi-Agent Workflow

This repository may be worked on by multiple AI agents, but only one agent at a time should actively edit, deploy, or test it.

## Read Order For Every Agent

Before doing any work, read these files in this order:

1. `AGENT_LOCK.json`
2. `MULTI_AGENT_WORKFLOW.md`
3. `AGENT_HANDOFF.md`
4. `task.md`
5. `walkthrough.md`
6. `GOAL.md`
7. any files directly related to the task you are about to perform

If `AGENT_LOCK.json` shows an active, unexpired lock held by another agent, do not proceed unless the lock is clearly stale or you have explicit permission to override it.

## Lock Protocol

Preferred commands on Windows PowerShell:

```powershell
pwsh -File .\tools\claim-agent-lock.ps1 -Agent "Codex GPT-5" -Task "Short task summary"
pwsh -File .\tools\release-agent-lock.ps1 -Agent "Codex GPT-5" -Summary "What was completed"
```

Rules:

- only one active editor/tester/deployer at a time
- claim the lock before editing files
- release the lock when done
- update `AGENT_HANDOFF.md` before releasing the lock

## Development Commands

```powershell
npm install
npm run dev
npm run lint
npm run build
```

Expected local URL:

- `http://localhost:3000`

## Browser Testing Protocol

If UI files changed, browser testing is required.

Minimum checks:

1. app loads without auth prompts
2. default landing mode is `Explorer`
3. keyword or quote results open the full concept correctly
4. graph focus lens and isolate mode still behave sensibly
5. Reading Desk provenance remains readable
6. public Gemini behavior works without login

## Deployment Protocol

Only deploy after:

1. `npm run lint` passes
2. `npm run build` passes
3. local browser smoke test passes

Deployment target:

- project: `gen-lang-client-0390414473`
- region: `us-west1`
- service: `marananusmrti`

GitOps target:

- repo: `avgKol/marananusmrti`
- branch: `main`

If GitHub-triggered Cloud Build is configured, let push-to-main drive deployment. If the trigger is not ready yet, document the manual deployment command and create the trigger before closing the slice when feasible.

## Handoff Protocol

Before releasing the lock, update `AGENT_HANDOFF.md` with:

1. what changed
2. which files changed
3. what was tested
4. whether deployment happened
5. open issues for the next agent

## Recommended Work Boundaries

Each agent turn should usually take one bounded slice such as:

- improve explorer retrieval flow
- refine graph clutter or isolate mode
- improve public archive tooling
- strengthen public corpus validation
- run validation and deploy
