# Agent Handoff

Last updated: `2026-05-29`

## Current Slice

The workspace has been redesigned into three top-level modes:

- `Graph`
- `Explorer`
- `Reading Desk`

What changed in this slice:

- added a client-side research index in `src/utils/researchIndex.ts`
- added a dedicated explorer/reading workspace component in `src/components/ResearchWorkspacePanels.tsx`
- wired `src/App.tsx` to switch between graph, explorer, and reading desk modes
- preserved the existing scholarly dark aesthetic and the current corpus
- tightened the graph/reading handoff so a concept selection moves the user into the reading desk
- kept the isolate/focus behavior available from the graph view
- updated the in-app guidance copy so the old "click the graph on the right" wording no longer leaks into the UI

## Validation Completed

Ran:

- `npm run lint`
- `npm run build`

Browser smoke-tested locally against `http://127.0.0.1:3000` via Chrome DevTools:

- verified the top-level mode switcher is present
- verified Explorer mode renders `Research Explorer`
- verified quote/source/result cards are present in the explorer
- verified the graph mode focus lens renders `Focus vector: [Atman]`
- verified the isolate toggle changes to `✓ Isolate Constellation`

## Deployment Status

Deployment has not been completed yet for this slice.

Next steps:

1. commit the UI slice
2. push to `origin/main`
3. let Cloud Build / Cloud Run deploy the updated revision
4. re-open the live page and confirm Google sign-in still works

## Notes For The Next Agent

- Do not rewrite the corpus or backend schema.
- Keep the three-mode workspace model intact.
- If anything regresses in live deployment, check the mode switch and the graph focus lens first.
