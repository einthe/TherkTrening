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
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
     >Confirm your email</a
   >
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

Apply `202609230001_pain_check_ins.sql` before deploying the grouped pain check-in update. Existing individual pain events remain readable and editable; new check-ins store all readings together.

Apply `202609240001_daily_event_lifecycle.sql` before deploying the daily logging update (after all earlier migrations). Days use the browser's local timezone; workout lock deadlines are stored as absolute timestamps, including daylight-saving transitions. Locks are enforced by the database even before the next workspace load records an expired lock. No scheduled job is required. Explicitly unlocking from Event history allows corrections; saving a pain check-in or past workout locks it again.

Apply `202609240002_reopen_pain_check_ins.sql` for adding injuries after today’s check-in: saving the component settings and reopening today’s event happen atomically. Existing readings, notes, and timestamps are preserved; the added slider is logged when **Save changes** is pressed.

Apply `202609240003_injury_library.sql` before deploying the Injuries section. It creates private injury records from existing component labels, chart targets, and historical pain readings without changing their IDs or logs. New injuries are created in **Injuries**, then selected in pain component settings.

Apply `202609240004_pain_event_titles.sql` before deploying component titles for pain events. New check-ins save the component title; historical check-ins receive the title when their injuries match exactly one current pain component. Unmatched or ambiguous old events display **Pain check-in**.

Apply `202609240005_volleyball_component.sql` before deploying Volleyball. It registers the component, validates its two 0–10 ratings, and renames the chart catalog entry to **Chart**. Existing training sessions remain supported.

Apply `202609240006_volleyball_match_sets.sql` before deploying the Practice/Match selector. Practice is the default; Match also records sets played (0–5). Older rated volleyball logs remain readable as Practice.

Apply `202609240007_flexible_charts.sql` before deploying flexible charts. It registers the new chart source/trend operators and validates multi-entry configurations. Existing charts keep their saved calculations and appearance; opening and saving Settings upgrades their configuration without changing events.

## Included functionality

- Supabase email/password signup, login, confirmation, persisted cookie sessions, pending/rejected/disabled states, and logout.
- One dashboard per user with add/remove/reorder, visibility, titles, tracked targets, notes, defaults, and chart settings.
- Dashboard management lives on **Components**: use **Add component** to add cards and **Customize** to reorder or remove them. The optional **Last 7 days** component shows sessions, pain check-ins, and active days; its Settings control dashboard visibility.
- Pain check-in tracks up to 12 injuries/body parts in one card, with a slider per target. Create and edit injury names and notes in **Injuries**; select or deselect them in **Components → Settings**; the dashboard shows the sliders and logging controls. Choosing Pain check-in again from the component browser opens the existing card. **Save check-in** stores all readings as one event named after the component title with a shared time and notes; history edits, locks, and deletes the whole check-in; removing a slider preserves its history.
- Daily logging: pain check-ins lock immediately and collapse to **Checked in today**. Select that message to expand the saved readings or log another date. Adding a new injury in Settings reopens today’s check-in with its existing readings, and saving updates and locks the same event. Today's saved workout stays in its card across navigation/reloads; **Save changes** updates that event. Workouts lock at local midnight. Backdated saves lock and reset the form; when today already has a saved entry, the card returns to that entry. Both cards reset at the next local day, including when a sleeping tab is reopened.
- Workout cards with expandable exercises, independent reps/weight rows, a standard exercise list, and private custom exercises. One save creates a single workout record containing its exercises; history opens the same workout editor for updates.
- Private workout templates, saved explicitly using **Save as template**. The **Workouts** page creates, edits, reorders, and deletes templates containing only exercises, sets, and reps. Adding exercises or loading a template prefills weights from the latest earlier logged occurrence of each exercise (matching set positions and repeating the final weight for extra sets); exercises without history start at zero. Templates themselves contain no weights; logging or changing the draft never overwrites the template. The **Exercises** page creates and edits names/descriptions, including personal overrides for standard exercises. Stable exercise IDs keep graphs and history linked.
- A dedicated **Volleyball** component with **Intensity** and **Jumps** sliders (0–10). Choose **Practice** (default) or **Match**; matches also have a **Sets played** slider (0–5). The type, ratings, sets for matches, event time, and optional notes save as one training session and can be edited in Event history. Jumps is a rating of jumping amount, not a jump count.
- Other training sessions with optional duration, and configurable numeric measurements.
- Flexible charts with up to 20 entries: select a data type, exercise/injury/workout/activity or measurement, and metric. Each entry has a label, line/dots/bars display, and palette or custom color. Set a range of 1–365 days or weeks and choose raw data, daily averages, or weekly averages; entries inherit the chart mode unless overridden. Different units use separate labeled axes.
- Statistics, a recent-events list, and searchable/filterable event history.
- Backdating, structured editing, notes, reversible locks, deletion, and stale-edit detection. Unlocking from Event history keeps the details open so you can edit immediately.
- A compiled/versioned component registry, versioned JSON events, declarative operator pipelines, and a storage interface separate from UI.
- PostgreSQL-enforced approval, ownership, locking, validation, and admin authorization.
- Responsive mobile layout, keyboard-accessible controls and dialogs, explicit chart legends, and a text table for chart data.
- Forest, Petrol, Slate, Plum, Black, Amber, and Midnight palettes, selectable in the top bar and on the sign-in page. The choice is remembered in this browser and applies to charts, forms, and dialogs.

## Reference workflow

1. Create **Left knee** in **Injuries**, then add **Pain check-in** and select it in the component settings.
2. In **Components**, add **Workout**. On the dashboard, expand Squat to enter its sets; use **Add exercise** to build the rest of the workout. Create or edit exercises on the **Exercises** page.
3. Add **Chart**, then configure its entries and time range. For example: Exercise → Squat → Volume, Pain check-in → Left knee → Pain level, and Volleyball → Match → Sets played.
4. Save a pain reading. Zero-valued numeric inputs clear automatically on focus; nonzero values stay intact, with the caret at the end when focused. An empty field becomes zero on blur and saves as zero. Enter different reps and weights for each exercise, collapsing rows as you go. Name the workout and click **Save workout** to log it. To reuse its structure later, choose **Save as template**, give it a unique name, and click **Save template**. It will then appear under **Saved workouts**.
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

`tests/charts.test.ts` covers typed data sources, mixed exercise sets, daily/weekly means, partial weeks, raw duplicates, mode overrides, legacy upgrades, gaps, and configuration validation. `tests/domain.test.ts` covers event validation, configuration, operators, version handling, backdating, sparse-series alignment, and authorization helpers. `tests/database.test.ts` executes the actual migration in PGlite (PostgreSQL compiled to WASM); it stubs only Supabase's external Auth users table and JWT-subject lookup. Database tests cover real RLS, cross-user isolation, account approval/disablement, admin restrictions, parent links, atomic rollback, configuration validation, locking, explicit unlock, and stale writes.

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
- Schema v1 readers validate known payloads. Unknown versions are not reinterpreted; add a compatible reader before charting their data. Add a reader/migration before introducing a new incompatible version.
- Daily aggregation and series alignment use **UTC calendar days**, explicitly stated below charts. Input times and history are shown in the user's browser timezone. Missing measurements remain null; chart lines do not connect across missing values. A future user timezone setting can extend aggregation without changing raw events.
- Chart sources are independently filtered and transformed. Raw data preserves each recorded observation, including repeated timestamps. Trends compute the arithmetic mean of recorded observations per UTC day or Monday–Sunday week, excluding missing values. Partial edge weeks use only observations inside the selected range; the current day ends at the present time. Numeric calculations live in the domain layer.
- Compiled definitions and allowed schemas live in source. Admin V1 configuration controls their global availability. Introducing a new executable component/operator requires a reviewed code change and migration, not stored arbitrary code. Disabling a definition does not delete history.
- Chart metrics: exercise volume sums reps × weight across sets; sets and reps are totals per exercise; weight can be the heaviest set or the average set weight. Workout metrics total the included exercises; select all workouts for total workout volume observations. Session-count observations are 1 per event (their average remains 1). Durations use actual start/end times in minutes and remain missing when absent. Pain selects an injury by stable ID; volleyball selects all sessions, Practice, or Match, with sets played present only for recorded matches. Measurement sources match both ID and unit. Existing declarative pipelines remain available as Saved calculation entries.
- Real workspaces start empty; only the explicitly labeled demo contains sample records. No fake account approval is provided in the demo.
- API event reads page through Supabase results rather than silently truncating at the default REST row limit. For very large accounts, add server-side range querying and pagination to the repository interface.
- Writes show success only after persistence and reload. No optimistic event writes are used. Locked events require a separate unlock operation, and event updates carry their last-known database timestamp.

Framework setup follows the [Next.js documentation](https://nextjs.org/docs) and [Supabase cookie-based SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
