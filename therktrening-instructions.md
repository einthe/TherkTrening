# TherkTrening — Codex Implementation Specification

**Target domain:** `trening.therk.no`  
**Repository:** GitHub  
**Deployment target:** Vercel-compatible; final host undecided  
**Backend:** Supabase  
**UI:** Dark mode for V1

---

## 1. Product purpose

TherkTrening is a modular web application for logging, transforming, comparing, and displaying personal training-related data.

The reference use case is:

- log pain levels for one or more injuries/joints;
- log workouts;
- log individual exercises and sets;
- log volleyball or other training sessions;
- transform raw logged data through mathematical operators;
- compare training load and pain over time.

The application must **not** be hard-coded as a pain logger or squat logger. Those are reference use cases for a more general architecture.

The long-term goal is that new event types, components, operators, and displays can be added without invalidating old data.

---

## 2. Core model

The app has four central concepts:

1. **Events** — stored facts/data points.
2. **Operators** — mathematical/logical transformations over events.
3. **Components** — configurable visual UI modules used to log, access, or display data.
4. **Dashboard** — the user's single customizable front page containing component instances.

The key rule is:

> **Components interact with the user. Events preserve data. Operators transform or interpret data.**

A component must not own historical data.

Example:

- Pain Logger component -> creates pain events.
- Squat Logger component -> creates workout/exercise events.
- Graph component -> reads events, runs operators, displays results.

---

## 3. V1 technical decisions

### Frontend

- TypeScript
- React
- Next.js
- Dark-mode UI
- Responsive desktop/mobile layout
- One consistent styling/design-system approach
- Prefer simple, readable UI over unnecessary visual complexity

### Backend

- Supabase
- PostgreSQL
- Supabase Auth
- PostgreSQL Row Level Security
- **One central Supabase project in V1**
- Version-controlled database migrations

Do **not** implement a separate Supabase project per user in V1.

Keep the domain/data-access code clean enough that an alternate storage adapter could be introduced later.

### Repository and deployment

- Source code lives in GitHub.
- The app should deploy cleanly to Vercel.
- Do not unnecessarily couple application logic to Vercel-specific services.
- Include deployment/setup documentation and required environment variables.

### Validation

Use runtime validation, preferably Zod or equivalent.

Do not rely only on TypeScript types for:

- event payloads;
- component configuration;
- operator configuration;
- user input.

### Testing

Include:

- operator unit tests;
- event validation tests;
- authorization/RLS tests where practical;
- basic integration/E2E coverage for critical flows.

---

## 4. UI principles

### Dark mode

V1 is dark mode only.

Do not prioritize a theme switch before core functionality works.

Prioritize:

- readability;
- clear hierarchy;
- low-friction logging;
- large enough touch targets on mobile;
- readable graphs;
- restrained visual clutter.

### Logging should be fast

Frequent data logging should require as few interactions as practical.

Example pain component:

```text
Left knee pain

0 ─────────●──────── 10

Notes: [optional / may be hidden]

[ Save ]
```

A user who does not use notes should be able to hide that field for that component instance.

### User customization

Users may customize supported component behavior and which components appear.

Users do not edit arbitrary CSS, application code, or low-level schemas.

---

## 5. Users, roles, and account lifecycle

### Roles

- `admin`
- `user`

There is one primary admin account in V1.

### Account status

- `pending`
- `approved`
- `rejected`
- `disabled`

Role and status are separate.

### Authentication

Use Supabase email + password authentication.

Also store a unique visible username in the user's profile.

Use normal secure Supabase session persistence.

### Registration flow

1. User creates an account.
2. Profile is created with `account_status = pending`.
3. User sees a waiting-for-approval page.
4. Admin approves or rejects the request.
5. Only approved users can use normal app functionality.
6. Rejected/disabled users are blocked from normal app data.

### Admin permissions

Admin can:

- view users and status;
- approve/reject/disable users;
- manage globally available component definitions;
- manage globally available event type definitions;
- manage allowed operators/configuration.

Admin should **not automatically receive access to all private event data** just because the account is admin.

Account administration and private event access are separate concerns.

---

## 6. Global configuration vs user configuration

There are two configuration scopes.

### Global/admin configuration

Applies to the web app as a whole and therefore to all users.

Examples:

- which component types exist;
- which fields a component can support;
- which event types exist;
- which operators are available;
- supported graph/display modes;
- global schemas and allowed options.

### User configuration

Belongs only to one user.

Examples:

- which components appear on the dashboard;
- component order;
- title;
- tracked injury;
- tracked exercise;
- whether notes are shown;
- default values;
- graph range;
- graph data sources;
- which supported fields are visible.

Rule:

> Admin configuration defines what a component **can do**.  
> User configuration defines how that component **behaves for that user**.

Low-level or technically complex configuration should remain admin-only in V1.

---

## 7. Dashboard

V1 has **one customizable front page/dashboard per user**.

Do not implement multiple named dashboards in V1.

Users can:

- add available component instances;
- remove components;
- enable/disable components;
- reorder components;
- edit supported instance settings.

A complex free-form drag-and-drop grid is not required.

A reliable responsive card layout is sufficient.

---

## 8. Components

A **component** is primarily a visual/application UI module.

Examples:

- pain logger;
- multi-joint pain logger;
- exercise logger;
- workout logger;
- volleyball/session logger;
- quick-value logger;
- graph;
- statistic card;
- recent-events list.

A component may:

- create one event;
- create several events in one submission;
- edit an event;
- query events;
- run operators;
- display processed results;
- navigate to a detailed view.

### Component definition vs component instance

A **component definition** is global.

A **component instance** belongs to one user.

Example global definition:

```text
Pain Logger
- supports one or more tracked targets
- supports 0–10 numeric input
- supports optional notes
- supports timestamp editing
```

User instance A:

```text
Title: Left knee pain
Target: left-knee
Show notes: false
```

User instance B:

```text
Title: Morning joint check
Targets:
- left-knee
- right-knee
- left-ankle
- right-ankle
Show notes: true
```

Both use the same global definition.

### One component may create multiple events

A component with four pain sliders may create four separate pain events in one save operation.

The events remain separate for analysis.

They may share an optional `batchId` to show that they were entered together.

---

## 9. Generic event model

Events are the central stored data model.

Use semantics equivalent to:

```ts
interface EventRecord {
  id: string;                   // UUID
  userId: string;               // owner

  eventType: string;            // stable event-type key
  schemaVersion: number;

  occurredAt: string;           // required

  startedAt?: string | null;    // optional duration
  endedAt?: string | null;

  parentEventId?: string | null;
  batchId?: string | null;

  payload: unknown;             // validated JSON/JSONB
  notes?: string | null;

  isLocked: boolean;

  createdAt: string;
  updatedAt: string;
}
```

Exact field naming may follow repository conventions, but preserve these semantics.

---

## 10. Event time model

### `occurredAt`

Every event has `occurredAt`.

It means:

> When did the logged event happen or represent?

Users must be allowed to backdate events.

Do not assume save time equals event time.

### `createdAt`

Database-controlled time representing when the record was created.

Charts/operators should normally use `occurredAt`, not `createdAt`.

### Optional duration

Most events are point-in-time events.

Do not force duration onto them.

If duration matters, use optional `startedAt` and `endedAt`.

Example point event:

```text
occurredAt = 08:30
startedAt = null
endedAt = null
```

Example volleyball session:

```text
occurredAt = 18:00
startedAt = 18:00
endedAt = 20:00
```

Missing duration means "not recorded", not "zero duration".

---

## 11. Parent/child events

Events may have an optional parent event.

### Workout hierarchy

A workout is a parent event.

Each exercise inside it is a separate child event.

```text
Workout event
├── Squat event
├── Bench press event
└── Pull-up event
```

Child exercise events reference the workout through `parentEventId`.

This keeps exercises independently queryable while preserving session context.

### Parent relationships are optional

Pain measurements and many other events do not need a parent.

`parentEventId` must be nullable.

### Sets

Sets should normally remain inside the exercise event payload rather than each set becoming its own database event.

---

## 12. Event payloads

Use JSON/JSONB payloads.

Do not restrict the generic system to "scalar/list/matrix".

JSON may contain:

- scalars;
- arrays;
- objects;
- arrays of objects;
- nested structures when justified.

Prefer self-describing objects instead of positional matrices.

### Pain example

```json
{
  "injuryId": "left-knee",
  "painLevel": 3
}
```

### Exercise example

```json
{
  "exerciseId": "squat",
  "sets": [
    { "reps": 5, "weightKg": 80 },
    { "reps": 5, "weightKg": 80 },
    { "reps": 3, "weightKg": 90 }
  ]
}
```

Prefer this over:

```json
[
  [5, 80],
  [5, 80],
  [3, 90]
]
```

because named fields are clearer and extensible.

For example, later:

```json
{
  "reps": 5,
  "weightKg": 80,
  "rpe": 7
}
```

---

## 13. Event types

An event type defines validation and interpretation for a class of events.

Support at least:

- stable key;
- human-readable name;
- schema version;
- runtime payload schema;
- optional units;
- optional display metadata;
- optional supported parent type;
- description.

Example keys:

```text
pain_measurement
workout
exercise
training_session
measurement
```

Do not create a new database table for every event type unless a strong technical reason appears.

---

## 14. Schema versioning

Every event stores `schemaVersion`.

Historical data must remain usable.

If a schema changes:

- readers may support old versions;
- operators may adapt based on version;
- or an explicit migration may convert data.

Do not silently reinterpret old incompatible JSON.

---

## 15. Notes

Notes are a standard optional event capability.

Prefer a general event `notes` field rather than redefining it separately for each event type.

Whether the notes input appears is component-instance configuration.

Example:

```json
{
  "showNotes": false
}
```

Notes should not be required unless a later explicit event definition requires them.

---

## 16. Editing and locking

Users can edit and delete their own historical events.

### Locking

Events have `isLocked`.

Purpose: protect against accidental changes, similar to locking a layer in a design tool.

Behavior:

- unlocked: owner can edit/delete;
- locked: editing/deletion blocked;
- owner can explicitly unlock;
- lock is reversible;
- admin is not required to unlock it.

Enforce this server-side as well as in the UI.

---

## 17. Operators

Operators are reusable mathematical or logical transformations over event data.

They are separate from components.

Conceptually:

```ts
interface Operator<I, C, O> {
  key: string;
  apply(input: I, config: C): O;
}
```

Possible operators:

- filter by date range;
- filter by event type;
- filter by exercise;
- filter by injury;
- extract field;
- flatten;
- sum;
- average;
- min;
- max;
- count;
- moving average;
- daily aggregation;
- align two time series;
- percentage change;
- unit conversion.

Operators should be deterministic where practical and independently testable.

---

## 18. Operator pipelines

Components such as graphs may define validated operator pipelines.

Example:

```text
Exercise events
→ filter exercise = squat
→ calculate load
→ aggregate by day
```

Second source:

```text
Pain events
→ filter injury = left-knee
```

Then:

```text
two series
→ align by date
→ display graph
```

Pipelines must be:

- serializable;
- runtime validated;
- restricted to registered operators;
- safe to execute;
- independently testable.

Do not use:

- `eval`;
- `new Function`;
- stored arbitrary JavaScript;
- arbitrary remote code execution.

---

## 19. Placeholder load operator

The actual mathematical definition of loading capacity is not yet specified.

Do **not** invent a medically meaningful formula.

For V1, add a clearly named placeholder operator only to prove the architecture.

Example:

```text
set load = reps × weight
exercise load = sum(set loads)
```

Suggested key:

```text
placeholder_volume_load
```

It must be clearly documented as a **placeholder training-volume calculation**, not a medical measure or validated loading-capacity estimate.

Later operators should be addable without rewriting historical exercise events.

---

## 20. Canonical V1 workflow

The pain/workout/load example is the main end-to-end reference implementation.

### Pain Logger component

Example user configuration:

```text
Title: Left knee pain
Tracked injury: left-knee
Scale: 0–10
Show notes: false
```

Submission creates:

```json
{
  "eventType": "pain_measurement",
  "payload": {
    "injuryId": "left-knee",
    "painLevel": 3
  }
}
```

### Workout and squat logging

Create/select a workout parent event.

Log a squat child event:

```json
{
  "exerciseId": "squat",
  "sets": [
    { "reps": 5, "weightKg": 80 },
    { "reps": 5, "weightKg": 80 },
    { "reps": 3, "weightKg": 90 }
  ]
}
```

The logger must support non-uniform sets.

Do not assume all sets share the same reps or weight.

The UI must allow individual rows to be added/removed.

### Graph component

Example:

> Last 3 weeks of squat volume versus left-knee pain.

Conceptual config:

```text
Source A:
  exercise
  filter exercise = squat
  placeholder_volume_load
  aggregate daily

Source B:
  pain_measurement
  filter injury = left-knee

Time range:
  last 21 days

Display:
  line graph
```

This workflow should prove:

- components and events are separate;
- operators can transform historical raw events;
- multiple event types can be compared;
- graph behavior is configurable.

---

## 21. Pain logger flexibility

### Single-target

```text
Left knee pain
[0 -------- 10]
[Save]
```

Creates one pain event.

### Multi-target

```text
Morning joint check

Left knee     [0 ---- 10]
Right knee    [0 ---- 10]
Left ankle    [0 ---- 10]
Right ankle   [0 ---- 10]

Notes: optional
[Save all]
```

Creates four separate pain events.

They may share a `batchId`.

Do not merge them into one event merely because one component submitted them together.

---

## 22. Workout logging

A workout is a parent event.

Its payload may contain basic session-level data:

```json
{
  "name": "Lower body workout"
}
```

Exercises are child events.

### Exercise logger UI

Support at least:

- reps;
- weight;
- add/remove set rows.

Example:

```text
Squat

Set    Reps    Weight
1      5       80 kg
2      5       80 kg
3      3       90 kg

[+ Add set]

Notes [optional]

[Save]
```

Do not model exercise input only as:

```text
3 sets × 5 reps × 80 kg
```

because individual sets may differ.

### Future-compatible set fields

The structure should permit later fields such as:

- RPE;
- RIR;
- tempo;
- assistance;
- distance;
- duration;
- velocity;
- exercise-specific measurements.

Do not implement them all in V1.

---

## 23. Other training sessions

The system should support activities such as volleyball.

Example payload:

```json
{
  "activityId": "volleyball"
}
```

Duration is optional.

The user should be able to log the session without entering duration.

---

## 24. Component registry

Use a component registry or equivalent clear mechanism.

Semantics similar to:

```ts
interface ComponentDefinition {
  id: string;
  name: string;
  version: number;

  kind: "logger" | "display" | "navigation" | "combined";

  supportedEventTypes?: string[];
  configSchema: unknown;

  capabilities: {
    canCreateEvents?: boolean;
    canCreateMultipleEvents?: boolean;
    canReadEvents?: boolean;
    canRunOperators?: boolean;
  };
}
```

Exact structure may differ.

Requirements:

- component definitions are registered/versioned;
- config is validated;
- user instances reference definitions;
- database configuration must not contain arbitrary executable source code.

---

## 25. User component instances

Store per-user configuration separately.

Conceptually:

```ts
interface UserComponentInstance {
  id: string;
  userId: string;
  componentDefinitionId: string;

  title?: string;

  enabled: boolean;
  position: number;

  config: unknown;

  createdAt: string;
  updatedAt: string;
}
```

Possible user settings:

- title;
- injury ID;
- exercise ID;
- visible fields;
- notes visibility;
- defaults;
- graph range;
- graph sources.

---

## 26. Admin component configuration

V1 may include a form-based admin interface for declarative component configuration.

It does not need to be a visual programming language.

Admin may eventually:

- create logger definitions;
- select event types;
- select supported fields;
- choose fields users may show/hide;
- set allowed defaults;
- define graph/display templates;
- select registered operators.

No arbitrary code editor is required.

---

## 27. Display pipeline

Separate data display into:

1. event query;
2. operator pipeline;
3. renderer.

Example:

```text
Query events
→ filter/transform/aggregate
→ display-ready data
→ chart renderer
```

Do not embed reusable business/math logic directly inside chart React components.

### V1 renderers

At minimum:

- single value/statistic;
- table/list;
- line graph;
- bar graph where appropriate.

---

## 28. Graph behavior

Graphs should handle:

- one or multiple series;
- configurable time ranges;
- no-data state;
- sparse data;
- different logging frequencies;
- operator errors;
- incompatible config;
- responsive sizing.

If series do not share exact timestamps, use an explicit alignment strategy/operator.

Do not silently invent missing measurements.

---

## 29. Suggested database entities

### `profiles`

- `id` — UUID matching Supabase Auth user
- `username` — unique
- optional display name
- `role`
- `account_status`
- timestamps

### `events`

- `id`
- `user_id`
- `event_type`
- `schema_version`
- `occurred_at`
- `started_at` nullable
- `ended_at` nullable
- `parent_event_id` nullable
- `batch_id` nullable
- `payload` JSONB
- `notes` nullable
- `is_locked`
- `created_at`
- `updated_at`

Index common queries, especially:

- `user_id`
- `event_type`
- `occurred_at`
- `parent_event_id`

### `event_type_definitions`

Store or represent:

- stable key;
- name;
- version;
- validation/config metadata;
- active state;
- timestamps.

Built-in schemas may live partly in source code where appropriate.

### `component_definitions`

Store/represent:

- stable ID;
- name;
- version;
- kind;
- validated global config;
- availability;
- timestamps.

### `user_component_instances`

Store:

- ID;
- user ID;
- component definition ID;
- title;
- enabled;
- position;
- validated user config;
- timestamps.

Avoid premature over-normalization.

---

## 30. RLS and authorization

Security must be enforced in backend/database layers, not only in React.

At minimum:

- users can read only their own events;
- users can create events only for themselves;
- users can edit/delete only their own allowed events;
- locked-event mutation rules are enforced server-side;
- users manage only their own component instances;
- pending/rejected/disabled users cannot use normal app APIs;
- ordinary users cannot perform admin mutations;
- service-role credentials never enter browser bundles.

Global definitions may be readable by approved users while remaining admin-writable only.

---

## 31. Private data handling

TherkTrening may contain personal training, pain, and injury-related records.

Treat event data as private user data.

Do not:

- expose one user's event data to another;
- place private payloads into public URLs;
- log sensitive payloads unnecessarily;
- log passwords/auth tokens;
- expose service-role credentials.

The app may display user-configured trends, but placeholder formulas must not be presented as diagnoses or validated medical recommendations.

---

## 32. Input validation

Validate at least:

- event type;
- event payload;
- timestamps;
- parent relationships where relevant;
- notes length;
- numeric ranges;
- component configuration;
- operator configuration;
- graph configuration;
- profile fields.

Do not treat generic "sanitization" as the main security boundary.

Use:

- runtime validation;
- RLS;
- server authorization;
- safe database APIs/parameterization;
- normal framework output escaping.

---

## 33. Error handling

A broken component should not break the whole dashboard.

Handle:

- invalid config;
- missing event type;
- incompatible operator input;
- empty/unavailable data;
- failed writes;
- stale edits;
- locked-event mutation attempts;
- missing parent events;
- malformed historical payloads.

Show understandable UI errors.

Keep internal diagnostic information in secure logs.

---

## 34. Historical event management

Provide an event-history interface/detail view.

Users should be able to:

- browse old events;
- filter at least by type/date;
- view timestamp/type/payload;
- edit;
- backdate;
- lock/unlock;
- delete unlocked events.

---

## 35. Optimistic UI

Optimistic updates are allowed where useful, but failed writes must roll back correctly.

For event logging, provide a clear success/error state so the user knows whether data was saved.

---

## 36. Testing requirements

### Operators

Test:

- placeholder volume load;
- daily aggregation;
- date filtering;
- field extraction;
- invalid input;
- empty input.

### Event model

Test:

- JSON payload validation;
- parent/child links;
- backdated `occurredAt`;
- optional start/end times;
- notes;
- schema version;
- batch ID;
- locking.

### Authorization

Test:

- pending user blocked;
- approved user allowed;
- user A cannot read user B's events;
- user A cannot modify user B's events;
- user cannot perform admin mutation;
- locked event cannot be changed until unlocked.

### Component configuration

Test:

- valid user config saves;
- invalid config rejects;
- user config affects only that user;
- global/admin config is shared as intended.

### Reference E2E flow

Automate a flow close to:

1. create user;
2. approve user;
3. add Left Knee Pain component;
4. add Squat Logger component;
5. add Load vs Pain graph;
6. log pain;
7. create workout;
8. log non-uniform squat sets;
9. calculate placeholder squat volume;
10. render both graph series;
11. edit historical event;
12. lock it;
13. verify editing is blocked;
14. unlock it;
15. edit it;
16. create a backdated event;
17. log out.

---

## 37. V1 screens

### Authentication

- sign up;
- sign in;
- pending approval;
- logout.

### Dashboard

- dark-mode UI;
- component instances;
- add/remove/reorder;
- component configuration.

### Component browser/configuration

Users can:

- browse available definitions;
- add an instance;
- configure allowed settings;
- enable/disable;
- remove.

### Event history

Users can:

- browse old events;
- filter;
- edit;
- lock/unlock;
- delete.

### Admin

Admin can:

- manage registration requests;
- manage user status;
- manage global component definitions;
- manage global event type definitions where implemented.

---

## 38. Dashboard UX reference

Conceptual layout:

```text
┌──────────────────────────────┐
│ Left knee pain               │
│                              │
│ 0 ─────────●──────────── 10  │
│                              │
│ [ Save ]                     │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Squat                        │
│                              │
│ Set   Reps   Weight          │
│ 1     5      80 kg           │
│ 2     5      80 kg           │
│ 3     3      90 kg           │
│                              │
│ [+ Add set]       [ Save ]   │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Squat load vs knee pain      │
│ Last 21 days                 │
│                              │
│        [ line graph ]        │
│                              │
└──────────────────────────────┘
```

This is not a pixel-perfect requirement.

---

## 39. Responsive behavior

The app should work well on mobile.

On narrow screens:

- cards stack vertically;
- controls remain tap-friendly;
- set rows remain usable;
- charts resize;
- important controls do not require desktop-only layout.

Desktop may use a wider grid.

---

## 40. Accessibility

At minimum:

- semantic HTML;
- form labels;
- keyboard-accessible buttons/controls;
- accessible slider values;
- visible focus states;
- readable dark-mode contrast;
- graph legends/text labels.

---

## 41. Vertical-jump calculator

A vertical-jump calculator is planned for later.

Its exact inputs, formula, units, output, and logging behavior are not yet specified.

Do not invent these requirements.

The architecture should allow it later as:

- a component;
- an operator;
- an event-producing calculator;
- or a combination.

---

## 42. Explicit V1 non-goals

Do not spend significant V1 effort on:

- separate Supabase projects per user;
- external database connection management;
- light mode;
- multiple named dashboards;
- arbitrary user-written code;
- arbitrary admin-written JavaScript;
- full visual programming;
- advanced free-form dashboard grid editing;
- native mobile apps;
- social/community features;
- automatic medical diagnosis;
- medically validated loading-capacity estimates before formulas are supplied;
- complex analytics beyond proving the operator architecture;
- premature distributed-system architecture.

---

## 43. Implementation principles for Codex

1. Keep architecture understandable.
2. Prefer a working end-to-end path over many unfinished abstractions.
3. Keep event storage independent from visual components.
4. Keep operators independent from charts/UI.
5. Store raw facts where practical; derive display values with operators.
6. Do not rewrite source events because an operator changes.
7. Validate all serialized configuration.
8. Use migrations.
9. Do not disable RLS for convenience.
10. Do not store arbitrary executable source in database config.
11. Keep user configuration separate from global/admin configuration.
12. Make frequent logging fast.
13. Keep the interface dark, responsive, and uncluttered.
14. For unclear requirements, choose the smallest reversible implementation and document the assumption.
15. Do not invent medically meaningful formulas.

---

## 44. Recommended implementation order

### Phase 1 — Foundation

- Next.js + TypeScript
- dark app shell
- Supabase setup
- environment handling
- migrations
- GitHub-ready repo structure
- Vercel-compatible build

### Phase 2 — Authentication/users

- sign up/sign in
- profiles
- roles
- approval states
- pending screen
- admin approval
- RLS baseline

### Phase 3 — Event system

- events table
- runtime validation
- event repository/service
- backdating
- optional duration
- parent events
- batch IDs
- notes
- locking
- event history

### Phase 4 — Reference event types

Implement enough for:

- pain measurement;
- workout;
- exercise.

### Phase 5 — Reference logger components

Implement:

- single-target pain logger;
- exercise/squat logger.

Support user settings such as:

- title;
- tracked target;
- notes visibility.

### Phase 6 — Operators

Implement:

- operator registry;
- pipeline validation/execution;
- filters;
- extraction;
- daily aggregation;
- placeholder volume load.

### Phase 7 — Graph component

Implement:

- configurable sources;
- operator pipelines;
- time range;
- line chart;
- reference load-vs-pain graph.

### Phase 8 — Dashboard customization

Implement:

- add;
- remove;
- enable/disable;
- order;
- per-user component configuration.

### Phase 9 — Multi-target pain logger

One component may create several independent pain events with shared `batchId`.

### Phase 10 — Admin declarative configuration

Only after the fixed/reference end-to-end implementation is reliable.

### Phase 11 — Hardening

- tests;
- error handling;
- responsive review;
- accessibility;
- security review;
- deployment documentation.

---

## 45. V1 acceptance criteria

### Accounts

1. User can sign up.
2. New account starts pending.
3. Admin can approve/reject.
4. Approved user can sign in and remain signed in through normal Supabase sessions.
5. Non-approved accounts cannot access normal app features.

### Dashboard

6. Each user has one customizable dashboard.
7. User can add/remove/reorder available component instances.
8. User configuration affects only that user.
9. UI is dark mode.

### Events

10. User can create events.
11. Events store owner, type, schema version, `occurredAt`, payload, notes, lock state, and timestamps.
12. Events can be backdated.
13. Start/end timestamps are optional.
14. Events can have a parent.
15. Events can share a batch ID.
16. User can edit/delete unlocked historical events.
17. User can lock/unlock events.
18. Locked events cannot be modified until unlocked.

### Workout hierarchy

19. Workout can exist as parent event.
20. Exercise can exist as child event.
21. Squat exercise supports non-uniform set rows with reps and weight.

### Pain tracking

22. Dedicated pain component creates pain event.
23. Reference pain scale is 0–10.
24. Notes visibility is user-configurable.
25. Multi-target pain component can create several separate pain events in one submission.

### Operators/graphs

26. Operators remain separate from components.
27. Placeholder volume load can be calculated from squat sets.
28. Exercise data can be aggregated by day.
29. Graph can compare squat volume and pain for the last 21 days.
30. Raw historical events do not need rewriting when an operator changes.

### Security

31. User A cannot read User B's private event data.
32. User A cannot modify User B's event data.
33. Ordinary users cannot perform admin actions.
34. Service-role secrets are never exposed to browser code.

### Code quality

35. Core operators have automated tests.
36. Critical authorization has automated coverage.
37. Reference E2E flow works.
38. Setup/deployment documentation exists.
39. App is deployable to a Vercel-compatible environment.
40. No separate Supabase project per user is required.

---

## 46. Future direction

The architecture should leave room for:

- more exercises;
- more training/session types;
- more event schemas;
- custom measurements;
- more graph types;
- reusable operator pipelines;
- personally/scientifically defined load models;
- loading-capacity models once formulas are supplied;
- component templates;
- richer admin component builder;
- import/export;
- alternate storage adapters;
- optional externally owned Supabase storage;
- vertical-jump calculations.

Future extensibility should influence clean interfaces, but must not make V1 unnecessarily complicated.

---

## 47. Final mental model

```text
USER
 │
 ▼
DASHBOARD
 │
 ├── Pain Logger Component ───────────► Pain Events
 │
 ├── Exercise Logger Component ───────► Workout / Exercise Events
 │
 └── Graph Component
          │
          ▼
       Query Events
          │
          ▼
       Operators
          │
          ▼
     Display-ready data
          │
          ▼
        Graph
```

TherkTrening stays extensible because:

- components can change without changing historical events;
- new operators can process old events;
- new visualizations can reuse existing data and operators;
- users configure their own dashboard without modifying global definitions;
- admins can expand globally available capabilities without manually changing every user's dashboard.

That separation is the foundation of the application.
