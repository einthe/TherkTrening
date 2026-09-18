"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import type { Snapshot } from "@/lib/data/repository";
export function Admin({
  snapshot,
  refresh,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
}) {
  const [users, setUsers] = useState<
    { id: string; username: string; role: string; account_status: string }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const r = await fetch("/api/admin");
      if (!r.ok) throw new Error("Unable to load accounts.");
      setUsers(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load accounts.");
    }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/admin")
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to load accounts.");
        const data = await r.json();
        if (active) setUsers(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-grid">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="card">
        <div className="card-heading">
          <h2>
            <Users size={18} />
            Accounts & approvals
          </h2>
        </div>
        <p className="card-description">
          Account administration does not grant access to private events.
        </p>
        {users.map((u) => (
          <div className="admin-row" key={u.id}>
            <div>
              <strong>{u.username}</strong>
              <small>{u.role}</small>
            </div>
            <select
              aria-label={`Status for ${u.username}`}
              value={u.account_status}
              disabled={busy || u.id === snapshot.profile.id}
              onChange={(e) =>
                mutate({ action: "status", id: u.id, status: e.target.value })
              }
            >
              {["pending", "approved", "rejected", "disabled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        ))}
      </section>
      {(["components", "events", "operators"] as const).map((kind) => (
        <section className="card" key={kind}>
          <div className="card-heading">
            <h2>
              <ShieldCheck size={18} />
              {kind === "components"
                ? "Component definitions"
                : kind === "events"
                  ? "Event types"
                  : "Registered operators"}
            </h2>
          </div>
          <p className="card-description">
            Manage global availability. Historical records are preserved.
          </p>
          {snapshot.definitions[kind].map((d) => (
            <label className="admin-row" key={d.key}>
              <div>
                <strong>{d.name}</strong>
                <small>
                  v{d.version} · {d.key}
                </small>
              </div>
              <input
                type="checkbox"
                checked={d.active}
                disabled={busy}
                onChange={(e) =>
                  mutate({
                    action: "definition",
                    table:
                      kind === "components"
                        ? "component_definitions"
                        : kind === "events"
                          ? "event_type_definitions"
                          : "operator_definitions",
                    key: d.key,
                    active: e.target.checked,
                  })
                }
              />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
