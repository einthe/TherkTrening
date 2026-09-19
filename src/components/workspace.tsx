"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  LayoutDashboard,
  History,
  PanelsTopLeft,
  Settings2,
  Plus,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  LogOut,
  ShieldCheck,
  CalendarDays,
  Check,
  X,
  Menu,
} from "lucide-react";
import { Brand } from "./auth";
import { WorkoutLogger } from "./workout-logger";
import { PaletteSelector } from "./palette-selector";
import {
  HttpRepository,
  type Mutation,
  type Snapshot,
} from "@/lib/data/repository";
import { DemoRepository } from "@/lib/data/demo";
import {
  componentDefinitions,
  componentSchemas,
  type ComponentKey,
  type Instance,
} from "@/lib/domain/components";
import { type EventInput, type EventRecord } from "@/lib/domain/events";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PainLogger, OtherLogger } from "./loggers";
import { Graph, RecentEvents, Statistic, WeeklySummary } from "./displays";
import {
  ComponentBrowser,
  ComponentSettings,
  componentIcons,
} from "./configuration";
import { EventHistory, EventDetail } from "./history";
import { Admin } from "./admin";
import { CardBoundary } from "./ui";

type Page = "dashboard" | "history" | "components" | "admin";
export function Workspace({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const repository = useMemo(
    () => (demo ? new DemoRepository() : new HttpRepository()),
    [demo],
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [browser, setBrowser] = useState(false);
  const [settings, setSettings] = useState<{
    key: ComponentKey;
    existing?: Instance;
  } | null>(null);
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [customize, setCustomize] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setSnapshot(await repository.load());
  }, [repository]);
  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((s) => {
        if (active) setSnapshot(s);
      })
      .catch((e) => {
        if (active)
          setLoadError(e instanceof Error ? e.message : "Unable to load.");
      });
    return () => {
      active = false;
    };
  }, [repository]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 9000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function mutate(m: Mutation, message = "Changes saved") {
    let persisted = false;
    try {
      await repository.mutate(m);
      persisted = true;
      await refresh();
      setToast({ message, error: false });
      return true;
    } catch (e) {
      setToast({
        message: persisted
          ? "Saved, but the workspace could not refresh. Reload to see your changes."
          : e instanceof Error
            ? e.message
            : "Unable to save. Please try again.",
        error: true,
      });
      return persisted;
    }
  }
  async function saveEvents(events: EventInput[]) {
    return mutate(
      { action: "createEvents", events },
      events.length > 1 ? `${events.length} events saved` : "Event saved",
    );
  }
  function navigate(p: Page) {
    setPage(p);
    setMobileNav(false);
    setCustomize(false);
    setRemoving(null);
  }
  const instances = [...(snapshot?.instances ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  async function move(instance: Instance, direction: number) {
    const ids = instances.map((i) => i.id);
    const i = ids.indexOf(instance.id);
    if (i + direction < 0 || i + direction >= ids.length) return;
    [ids[i], ids[i + direction]] = [ids[i + direction], ids[i]];
    await mutate({ action: "reorder", ids }, "Dashboard order updated");
  }
  const operators =
    snapshot?.definitions.operators.filter((o) => o.active).map((o) => o.key) ??
    [];
  const titles = {
    dashboard: "Dashboard",
    history: "Event history",
    components: "Components",
    admin: "Administration",
  };
  function renderComponent(i: Instance) {
    const props = { instance: i, events: snapshot!.events, save: saveEvents };
    if (
      !snapshot!.definitions.components.some(
        (d) => d.key === i.componentDefinitionId && d.active,
      )
    )
      return (
        <div className="empty-state">
          This component has been disabled by the administrator.
        </div>
      );
    if (i.version !== 1)
      return (
        <div className="empty-state">
          This component version is unsupported.
        </div>
      );
    if (i.componentDefinitionId === "pain_logger")
      return <PainLogger {...props} />;
    if (i.componentDefinitionId === "workout_logger")
      return (
        <WorkoutLogger
          {...props}
          templates={snapshot!.workoutTemplates}
          customExercises={snapshot!.customExercises}
          saveTemplate={(template) =>
            mutate(
              { action: "saveWorkoutTemplate", template },
              "Workout template saved",
            )
          }
          createExercise={(exercise) =>
            mutate({ action: "createExercise", exercise }, "Exercise created")
          }
        />
      );
    if (
      i.componentDefinitionId === "session_logger" ||
      i.componentDefinitionId === "value_logger"
    )
      return <OtherLogger {...props} />;
    if (i.componentDefinitionId === "graph")
      return <Graph {...props} operators={operators} />;
    if (i.componentDefinitionId === "weekly_summary") {
      componentSchemas.weekly_summary.parse(i.config);
      return (
        <WeeklySummary
          instance={i}
          events={snapshot!.events}
          onSettings={() =>
            setSettings({ key: i.componentDefinitionId, existing: i })
          }
        />
      );
    }
    if (i.componentDefinitionId === "statistic")
      return <Statistic {...props} operators={operators} />;
    return (
      <RecentEvents
        events={snapshot!.events}
        limit={componentSchemas.recent_events.parse(i.config).limit}
        onHistory={() => navigate("history")}
        onSelect={setSelected}
      />
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
              { key: "history", label: "Event history", icon: History },
              { key: "components", label: "Components", icon: PanelsTopLeft },
              ...(snapshot?.profile.role === "admin" && !demo
                ? [{ key: "admin", label: "Administration", icon: ShieldCheck }]
                : []),
            ] as { key: Page; label: string; icon: typeof Activity }[]
          ).map((item) => (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => navigate(item.key)}
            >
              <item.icon size={18} />
              {item.label}
              {page === item.key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {snapshot?.profile.username.slice(0, 2).toUpperCase() ?? "TT"}
            </span>
            <div>
              <strong>{snapshot?.profile.username ?? "Your workspace"}</strong>
              {demo && <small>Demo account</small>}
            </div>
            <button
              className="icon-button"
              title={demo ? "Exit demo" : "Sign out"}
              aria-label={demo ? "Exit demo" : "Sign out"}
              onClick={async () => {
                if (!demo) await supabaseBrowser().auth.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
          </div>
          <div className="topbar-right">
            <PaletteSelector />
            <span className="today" suppressHydrationWarning>
              <CalendarDays size={14} />
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="avatar small-avatar">
              {snapshot?.profile.username.slice(0, 1).toUpperCase() ?? "T"}
            </span>
          </div>
        </header>
        <main className="main-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <span className="demo-dot" />
                Demo data is saved only in this browser.
              </span>
              <a href="/login">
                Sign in <ArrowUpRight size={13} />
              </a>
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>{titles[page]}</h1>
            </div>
            {page === "components" && (
              <div className="heading-actions">
                <button
                  className={`button secondary ${customize ? "selected" : ""}`}
                  aria-pressed={customize}
                  onClick={() => {
                    setCustomize(!customize);
                    setRemoving(null);
                  }}
                >
                  {customize ? <Check size={15} /> : <Settings2 size={15} />}
                  {customize ? "Done" : "Customize"}
                </button>
                <button
                  className="button primary"
                  onClick={() => setBrowser(true)}
                >
                  <Plus size={17} />
                  Add component
                </button>
              </div>
            )}
          </div>
          {loadError ? (
            <div className="card empty-state" role="alert">
              <h2>We couldn’t load your workspace.</h2>
              <p>{loadError}</p>
              <button
                className="button primary"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : !snapshot ? (
            <div className="loading-state">
              <span className="loading-dot" />
              Loading…
            </div>
          ) : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="dashboard-grid">
                    {instances
                      .filter((i) => i.enabled)
                      .map((i) => {
                        const def = componentDefinitions.find(
                          (d) => d.key === i.componentDefinitionId,
                        );
                        const Icon = def ? componentIcons[def.icon] : Activity;
                        return (
                          <section
                            className={`card dashboard-card ${i.componentDefinitionId === "graph" ? "graph-card" : ""} ${i.componentDefinitionId === "weekly_summary" ? "summary-card" : ""}`}
                            key={i.id}
                          >
                            {i.componentDefinitionId !== "weekly_summary" && (
                              <div className="card-heading">
                                <h2>
                                  <span
                                    className={`card-icon ${i.componentDefinitionId}`}
                                  >
                                    <Icon size={17} />
                                  </span>
                                  {i.title}
                                </h2>
                                <div className="card-controls">
                                  <button
                                    className="icon-button"
                                    aria-label={`Settings for ${i.title}`}
                                    onClick={() =>
                                      setSettings({
                                        key: i.componentDefinitionId,
                                        existing: i,
                                      })
                                    }
                                  >
                                    <Settings2 size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                            <CardBoundary key={i.updatedAt}>
                              <DeferredCard render={() => renderComponent(i)} />
                            </CardBoundary>
                          </section>
                        );
                      })}
                    {!instances.some((i) => i.enabled) && (
                      <button
                        className="add-empty"
                        onClick={() => navigate("components")}
                      >
                        <Plus size={30} />
                        <h2>No components</h2>
                        <p>
                          Choose which components to show on your dashboard.
                        </p>
                        <span className="button primary">
                          Go to Components <ArrowUpRight size={15} />
                        </span>
                      </button>
                    )}
                  </div>
                </>
              )}
              {page === "history" && (
                <EventHistory events={snapshot.events} onSelect={setSelected} />
              )}{" "}
              {page === "components" && (
                <div className="component-management">
                  {customize && (
                    <div className="notice">
                      Use the arrows to reorder components, or remove any you no
                      longer need. Open Settings to change visibility.
                    </div>
                  )}
                  {instances.map((i, index) => (
                    <section className="card manage-card" key={i.id}>
                      <span className="manage-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h2>{i.title}</h2>
                        <p>
                          {
                            componentDefinitions.find(
                              (d) => d.key === i.componentDefinitionId,
                            )?.name
                          }{" "}
                          · {i.enabled ? "Visible" : "Hidden"}
                        </p>
                      </div>
                      <div className="manage-actions">
                        {customize && (
                          <>
                            <button
                              className="icon-button"
                              aria-label={`Move ${i.title} up`}
                              disabled={index === 0}
                              onClick={() => move(i, -1)}
                            >
                              <ArrowUp size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Move ${i.title} down`}
                              disabled={index === instances.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              <ArrowDown size={17} />
                            </button>
                          </>
                        )}
                        <button
                          className="button secondary small"
                          onClick={() =>
                            setSettings({
                              key: i.componentDefinitionId,
                              existing: i,
                            })
                          }
                        >
                          <Settings2 size={14} />
                          Settings
                        </button>
                        {customize &&
                          (removing === i.id ? (
                            <>
                              <span className="micro">Remove this card?</span>
                              <button
                                className="button danger small"
                                onClick={async () => {
                                  await mutate(
                                    { action: "removeInstance", id: i.id },
                                    "Component removed. Your events are preserved.",
                                  );
                                  setRemoving(null);
                                }}
                              >
                                Remove component
                              </button>
                              <button
                                className="icon-button"
                                aria-label="Cancel removal"
                                onClick={() => setRemoving(null)}
                              >
                                <X size={15} />
                              </button>
                            </>
                          ) : (
                            <button
                              className="icon-button danger-text"
                              aria-label={`Remove ${i.title}`}
                              onClick={() => setRemoving(i.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          ))}
                      </div>
                    </section>
                  ))}
                  {!instances.length && (
                    <div className="card empty-state">
                      <PanelsTopLeft />
                      <h2>No components</h2>
                      <p>Add your first component to get started.</p>
                    </div>
                  )}
                  <p className="micro">
                    <ShieldCheck size={13} /> Removing a component always
                    preserves your logged events.
                  </p>
                </div>
              )}
              {page === "admin" &&
                !demo &&
                snapshot.profile.role === "admin" && (
                  <Admin snapshot={snapshot} refresh={refresh} />
                )}
            </>
          )}
        </main>
      </div>
      {browser && snapshot && (
        <ComponentBrowser
          definitions={snapshot.definitions.components}
          onClose={() => setBrowser(false)}
          onSelect={(key) => {
            setBrowser(false);
            setSettings({ key });
          }}
        />
      )}
      {settings && (
        <ComponentSettings
          key={settings.existing?.id ?? settings.key}
          componentKey={settings.key}
          existing={settings.existing}
          position={
            instances.length
              ? Math.max(...instances.map((i) => i.position)) + 1
              : 0
          }
          onClose={() => setSettings(null)}
          onSave={(instance, expectedUpdatedAt) =>
            mutate(
              { action: "saveInstance", instance, expectedUpdatedAt },
              settings.existing ? "Component updated" : "Component added",
            )
          }
        />
      )}{" "}
      {selected && snapshot && (
        <EventDetail
          key={selected.id}
          event={selected}
          events={snapshot.events}
          mutate={mutate}
          onClose={() => setSelected(null)}
        />
      )}{" "}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "toast-error" : ""}`}
        >
          <span>{toast.error ? <X size={17} /> : <Check size={17} />}</span>
          {toast.message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function DeferredCard({ render }: { render: () => React.ReactNode }) {
  return render();
}
