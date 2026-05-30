# Security Specification: Marananusmrti

This project is a public unauthenticated workspace, so its security model is not based on per-user ownership.

## Firestore model

- The source app's private `nodes` collection remains untouched for compatibility.
- Marananusmrti uses `public_nodes` only.
- `public_nodes` allows public reads.
- `public_nodes` allows create-only writes with schema constraints.
- `public_nodes` rejects update and delete operations.

## Public write safeguards

- document IDs must match a constrained ID format
- concept title, grouping, and metadata fields are size-limited
- public writes must carry the expected top-level shape
- text fragments must include the required core fields

## Server safeguards

- Gemini routes use request-size limits
- Gemini routes use per-IP rate limiting
- Gemini route payloads are shape-validated before prompting the model

## Product-level constraints

- no Google sign-in is required
- no Google Drive permissions are requested
- Gemini keys remain server-side
- local snapshot imports are session-only and do not write to Firestore
