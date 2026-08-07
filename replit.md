# Daymark Life Tracker

An offline-first personal life dashboard for tasks, expenses, nutrition, weight, and habit momentum.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/life-tracker/src/App.tsx` — dashboard, task, expense, nutrition, analytics, and settings views
- `artifacts/life-tracker/src/hooks/use-life-tracker.ts` — local-first tracker state and persistence
- `attached_assets/Pasted--Product-Requirements-Document-PRD-Personal-Life-Tracke_1786090276692.txt` — product requirements source

## Architecture decisions

- The first milestone is offline-first and stores tracker data in the browser so it is usable without a connected account.
- The web build is a product prototype; the intended final product is a native iOS app.
- Google Sheets sync remains optional and should be added only after the user connects it manually.

## Product

Daymark combines daily tasks, spending, nutrition, weight, and habit momentum into one personal dashboard. The current milestone supports local task, expense, and food entry flows with responsive dashboard navigation.

## User preferences

- The intended final product is an iOS app, not a web-only product.
- The user plans to publish and connect Google Sheets manually later.

## Gotchas

- Keep the local-first experience usable when Google Sheets is not connected.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
