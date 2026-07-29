# Workbench client

The Next.js client provides the engagement-centric workspace for the AI
Consulting Workbench. It supports organization and engagement creation,
engagement resume/list views, the Phase 2 Customer Operations Discovery
Profile editor, stage tracking, and the existing analysis view.

## Run locally

Set the backend base URL if it differs from the default:

```bash
cp .env.local.example .env.local
```

Start the client from this directory:

```bash
npm install
npm run dev
```

Open <http://localhost:3000> to create work or
<http://localhost:3000/engagements> to resume an engagement. The engagement
workspace saves Discovery Profile facts and explicit gaps through the backend;
browser state is not the source of truth.

## Validation

```bash
npm run lint
npm run build
```
