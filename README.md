# Marananusmrti

Marananusmrti is a public, unauthenticated research fork of Marana-Lab.

It keeps the philosophical corpus and Gemini-powered comparative assistance, but removes Google sign-in, removes Drive dependency, and treats the app as a shared public workspace instead of a private personal notebook.

## Core model

- `Explorer` for keyword, quote, and source retrieval
- `Graph` for conceptual constellation reading
- `Reading Desk` for deep study of one concept at a time

## Public corpus

- Canonical seed corpus is checked in at `src/content/corpus.seed.json`
- Live shared data is stored in Firestore collection `public_nodes`
- The app reads publicly and creates publicly
- The app does not require Google login anywhere

## Local development

1. Install dependencies with `npm install`
2. Set `GEMINI_API_KEY` in `.env.local`
3. Run `npm run dev`
4. Open `http://localhost:3000`

## Validation

- `npm run lint`
- `npm run build`

## Deployment target

- GCP project: `gen-lang-client-0390414473`
- Region: `us-west1`
- Cloud Run service: `marananusmrti`

The intended GitOps flow is push to `main`, let Cloud Build deploy, then verify the live public page and public corpus behavior.
The verified GitOps flow is push to `main`, let GitHub Actions workflow `.github/workflows/deploy.yml` validate and authenticate via GCP OIDC, let that workflow submit `cloudbuild.yaml`, then verify the live public page and public corpus behavior.
