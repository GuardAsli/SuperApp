# Convex performance notes (GuardAsli)

- Prefer **indexes** already defined in `schema.ts` (by_tenant, by_user, by_idempotency).
- Cron: jobs every 1 min; session purge hourly — do not lower below 1 min on free tier without need.
- `processDueJobs` limit default 25 — raise only if queue backs up.
- Keep secrets only in Convex Dashboard env (not `VITE_*`).
- Production: `bunx convex deploy` once per release; avoid long-running `convex dev` on VPS.
- Web UI on VPS serves **static preview** (`bun run preview`); backend is Convex cloud (not local Node DB).
