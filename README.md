# TherkTrening

A dark, responsive personal training workspace built from [`therktrening-instructions.md`](therktrening-instructions.md). Next.js App Router, React, TypeScript, Supabase Auth/PostgreSQL, Zod, and Recharts.

## Run locally

Use Node **24 LTS** (or Node 22.13+).

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. Without Supabase environment variables the app opens a **clearly labeled local demo**. The demo has sample records and persists edits in this browser's local storage. It is not authentication, cloud storage, or a place for sensitive real data. `/demo` also works when Supabase is configured. Clear the `therktrening-demo-v1` local-storage entry to reset it.

## Connect Supabase

1. Create **one shared Supabase project** for all users.
2. Apply all files in [`supabase/migrations`](supabase/migrations) in filename order using the SQL editor, or use the Supabase CLI:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```

   The application requires **no service-role key**. Never put one in a `NEXT_PUBLIC_` variable.

4. In Supabase Auth, enable email/password signups. Set Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/confirm`. For production, use `https://trening.therk.no` and its `/auth/confirm` route instead.
5. If email confirmation is enabled, change the confirmation email link to:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
   ```

6. Restart Next.js. Create your primary admin account at `/login`, and confirm the email if required.
7. Bootstrap the first admin **once in the Supabase SQL editor**, using the account UUID from Auth → Users:

   ```sql
   update public.profiles
   set role = 'admin', account_status = 'approved', updated_at = now()
   where id = 'YOUR_AUTH_USER_UUID';
   ```

8. Sign in again. Use **Administration** to approve/reject/disable other accounts and enable/disable registered definitions. A user starts with an empty dashboard; **Add component** adds their first logger or display.

New accounts always start pending, including when user-supplied Auth metadata claims otherwise. Admins can manage accounts but cannot read other users' private events. Rejected/disabled users retain their data but lose normal app access.

For a completely local Supabase environment, install Docker and the Supabase CLI, run `supabase start` then `supabase db reset`, and copy the local URL and anon key from `supabase status`. The checked-in local configuration disables email confirmation for local testing only.

## Included functionality

- Supabase email/password signup, login, confirmation, persisted cookie sessions, pending/rejected/disabled states, and logout.
- One dashboard per user with add/remove/reorder, visibility, titles, tracked targets, notes, defaults, and chart settings.
- Dashboard management lives on **Components**: use **Add component** to add cards and **Customize** to reorder or remove them. The optional **Last 7 days** component shows sessions, pain check-ins, and active days; its Settings control dashboard visibility.
- Single- and multi-target pain logging. Each target becomes an independent event; one multi-target submission shares a batch UUID.
- Workout cards with expandable exercises, independent reps/weight rows, a standard exercise list, and private custom exercises. One save creates a single workout record containing its exercises; history opens the same workout editor for updates.
- Private workout templates, saved explicitly using **Save as template**. The **Workouts** page creates, edits, reorders, and deletes templates containing only exercises, sets, and reps. Loading a template starts every weight at zero; logging or changing the draft never overwrites the template. The **Exercises** page creates and edits names/descriptions, including personal overrides for standard exercises. Stable exercise IDs keep graphs and history linked.
- Other training sessions with optional duration, and configurable numeric measurements.
- Configurable line/bar graphs, statistics, a recent-events list, and searchable/filterable event history.
- Backdating, structured editing, notes, reversible locks, deletion, and stale-edit detection.
- A compiled/versioned component registry, versioned JSON events, declarative operator pipelines, and a storage interface separate from UI.
- PostgreSQL-enforced approval, ownership, locking, validation, and admin authorization.
- Responsive mobile layout, keyboard-accessible controls and dialogs, explicit chart legends, and a text table for chart data.
- Forest, Petrol, Slate, and Plum palettes, selectable in the top bar and on the sign-in page. The choice is remembered in this browser and applies to charts, forms, and dialogs.

## Reference workflow

1. Add **Pain check-in**. Set title to `Left knee pain`, target to `left-knee`.
2. In **Components**, add **Workout**. On the dashboard, expand Squat to enter its sets; use **Add exercise** to build the rest of the workout. Create or edit exercises on the **Exercises** page.
3. Add **Volume & pain**, using the default squat/left-knee sources and 21-day range.
4. Save a pain reading. Numeric exercise inputs can be cleared while typing; an empty field becomes zero on blur and saves as zero. Enter different reps and weights for each exercise, collapsing rows as you go. Name the workout and click **Save workout** to log it. To reuse its structure later, choose **Save as template**, give it a unique name, and click **Save template**. It will then appear under **Saved workouts**.
5. Compare the two recorded series. For identical sets, volume is **sets × reps × weightKg**. For sets with different reps or weights, volume is **the sum of each set’s reps × weightKg**, measured in kg·reps. For example, 3 sets of 5 reps at 80 kg = **1,200 kg·reps**; sets of 5 × 80 kg, 4 × 85 kg, and 3 × 90 kg = **1,010 kg·reps**. It is a **placeholder training-volume calculation**, not a medically validated loading-capacity estimate.
6. Open **Event history** to edit/backdate, lock, unlock, or delete an event.

## Validation and tests

```sh
npm run typecheck
npm run lint
npm test
npm run build

# Actual PostgreSQL migration/RPC/RLS tests, without Docker or cloud credentials
npm run test:db

# Install a browser once, then run the interaction tests
npx playwright install chromium
npm run test:e2e

# Alternatively, use an installed Google Chrome
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

`tests/domain.test.ts` covers event validation, configuration, operators, version handling, backdating, sparse-series alignment, and authorization helpers. `tests/database.test.ts` executes the actual migration in PGlite (PostgreSQL compiled to WASM); it stubs only Supabase's external Auth users table and JWT-subject lookup. Database tests cover real RLS, cross-user isolation, account approval/disablement, admin restrictions, parent links, atomic rollback, configuration validation, locking, explicit unlock, and stale writes.

Playwright covers the reference dashboard workflow, non-uniform sets, rendered graph series, history edits, locks, backdating, multiple pain targets, local persistence, component reordering/removal, workout templates, custom exercises, failed-save draft preservation, and mobile layout. The optional live Auth test requires a disposable local Supabase environment; see its environment variables in `tests/e2e/auth.spec.ts`. Never point test setup at a production project.

## Deployment

The repository is ready to import into Vercel as a Next.js project. Configure Node 24, the two public Supabase variables, the production Supabase Auth URLs, and apply the migration before the first production login. The build command is `npm run build`. No Vercel-only services are used; a Node host can run `npm run build` followed by `npm start`.

For an existing installation, apply new migrations with `supabase db push` before deploying the updated app. The `202609190001_weekly_summary.sql` migration enables **Last 7 days** in the component catalog; existing dashboards can opt in through **Components → Add component**. The `202609190002_workout_templates.sql` migration adds private templates/custom exercises and converts existing exercise cards to workout cards, preserving their defaults, visibility, and order. That migration leaves historical events unchanged. The newer `202609210001_workout_libraries.sql` migration removes template weights, adds library editing with stale-write protection, and nests older child exercise records inside their workout. Original child data is preserved under each exercise’s `legacy` field, including notes and timestamps; a workout becomes locked if any of its old exercises was locked. Apply the complete migration before deploying this update.

Connect `trening.therk.no` through your chosen hosting provider and set the DNS records it supplies. This implementation does not create a remote GitHub repository, provision Supabase, configure DNS, or publish a deployment.

## Architecture and deliberate V1 choices

```text
src/app/                  Next.js pages, auth confirmation, authenticated API routes
src/components/           Dashboard shell, forms, settings, history, chart renderers
src/lib/domain/           Event schemas, component registry, deterministic operators
src/lib/data/             Repository interface, HTTP adapter, local demo adapter
src/lib/supabase/         Cookie-based browser/server clients
supabase/migrations/     Tables, grants, RLS, server validation, atomic mutation RPCs
```

- Event storage never references component instances; removing cards cannot remove history.
- Only the owner sees events. Database write grants are revoked from browser roles. All writes pass through narrow `SECURITY DEFINER` RPCs with fixed search paths, approval and ownership checks, and explicit validation. RLS remains enabled for reads. There are no service-role credentials in app code.
- Database `created_at`/`updated_at` timestamps are authoritative. `occurred_at` is user-editable. Missing durations stay null.
- Event type and owner cannot change through editing. Workouts are edited, locked, and deleted as one record containing their exercise sets. Standalone historical exercises remain readable. The operator layer derives exercise series from nested workout data without creating extra stored events.
- Schema v1 readers validate known payloads. Unknown versions are not silently reinterpreted; a chart reports the incompatibility. Add a reader/migration before introducing a new incompatible version.
- Daily aggregation and series alignment use **UTC calendar days**, explicitly stated below charts. Input times and history are shown in the user's browser timezone. Missing measurements remain null; chart lines do not connect across missing values. A future user timezone setting can extend aggregation without changing raw events.
- Sources are independently filtered/transformed/aggregated, then joined by date. Numeric calculations do not live inside chart rendering code.
- Compiled definitions and allowed schemas live in source. Admin V1 configuration controls their global availability. Introducing a new executable component/operator requires a reviewed code change and migration, not stored arbitrary code. Disabling a definition does not delete history.
- The user-facing graph editor exposes the reference exercise/pain source settings, range, and line/bar display. The underlying validated pipeline supports other registered numeric fields for future templates.
- Real workspaces start empty; only the explicitly labeled demo contains sample records. No fake account approval is provided in the demo.
- API event reads page through Supabase results rather than silently truncating at the default REST row limit. For very large accounts, add server-side range querying and pagination to the repository interface.
- Writes show success only after persistence and reload. No optimistic event writes are used. Locked events require a separate unlock operation, and event updates carry their last-known database timestamp.

Framework setup follows the [Next.js documentation](https://nextjs.org/docs) and [Supabase cookie-based SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
