# Walkthrough: Marananusmrti Public Research Fork

This project is a public fork of the Marana-Lab app.

## Core changes from the source app

1. Authentication is removed from the user experience.
2. Google Drive backup/import flows are removed from the product model.
3. The corpus is shared through public Firestore collection `public_nodes`.
4. The canonical fallback corpus is checked into `src/content/corpus.seed.json`.
5. The workspace still uses `Explorer`, `Graph`, and `Reading Desk`.

## Public research behavior

- Explorer is the default landing mode.
- Graph remains the spatial reading surface.
- Reading Desk remains the deep-reading destination.
- Scholar Assistant is public and concept-aware.
- Archives download the public corpus and allow session-only local snapshot comparison.

## Deployment target

- project: `gen-lang-client-0390414473`
- region: `us-west1`
- target service: `marananusmrti`

Update this file if deployment strategy, service naming, or workflow steps change materially.
