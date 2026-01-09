"use client";

import { useEffect, useState } from "react";

export function RulesEditorClient({ initialRules, domain }: { initialRules: any[]; domain: string }) {
  const [rules, setRules] = useState<any[]>(initialRules || []);
  const [selectedId, setSelectedId] = useState<string | null>((initialRules || [])?.[0]?.id || null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jsonText, setJsonText] = useState("{\n  \n}");
  const [active, setActive] = useState(true);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const r = rules.find((x) => x.id === selectedId);
    if (!r) return;
    setName(r.name || "");
    setDescription(r.description || "");
    setJsonText(JSON.stringify(r.json || {}, null, 2));
    setActive(Boolean(r.active));
  }, [selectedId, rules]);

  async function refresh() {
    const res = await fetch(`/api/rulesets?domain=${encodeURIComponent(domain)}`);
    const j = await res.json();
    setRules(j.ruleSets || []);
    if (!selectedId && (j.ruleSets || []).length) setSelectedId(j.ruleSets[0].id);
  }

  async function createNew() {
    setStatus("Creating…");
    let parsed: any = {};
    try {
      parsed = JSON.parse(jsonText || "{}");
    } catch {
      setStatus("Invalid JSON.");
      return;
    }
    const res = await fetch("/api/rulesets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, name, description, json: parsed }),
    });
    const j = await res.json();
    if (j.ok) {
      setStatus("Created.");
      await refresh();
      setSelectedId(j.ruleSet.id);
    } else {
      setStatus("Create failed.");
    }
  }

  async function save() {
    if (!selectedId) return;
    setStatus("Saving…");
    let parsed: any = {};
    try {
      parsed = JSON.parse(jsonText || "{}");
    } catch {
      setStatus("Invalid JSON.");
      return;
    }
    const res = await fetch(`/api/rulesets/${selectedId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, json: parsed, active }),
    });
    const j = await res.json();
    if (j.ok) {
      setStatus("Saved.");
      await refresh();
    } else {
      setStatus("Save failed.");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, marginTop: 12 }}>
      <div className="te-stepCard">
        <div style={{ fontWeight: 800 }}>All RuleSets</div>
        <div className="te-meta" style={{ marginTop: 6 }}>
          Click to edit.
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map((r) => (
            <button
              key={r.id}
              type="button"
              className="te-stepCard"
              style={{
                padding: 10,
                textAlign: "left",
                cursor: "pointer",
                borderColor: r.id === selectedId ? "rgba(27,98,248,0.45)" : "var(--te-border)",
                background: r.id === selectedId ? "rgba(27,98,248,0.06)" : "#fff",
              }}
              onClick={() => setSelectedId(r.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>{r.name}</div>
                <div className="te-meta">{r.active ? "active" : "off"}</div>
              </div>
              <div className="te-meta" style={{ marginTop: 4 }}>
                {new Date(r.updatedAt).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="te-stepCard">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>Editor</div>
          <div className="te-meta">{status || "—"}</div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label>
            <div className="te-meta">Name</div>
            <input className="te-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <div className="te-meta">Description</div>
            <input className="te-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            <div className="te-meta">JSON</div>
            <textarea
              className="te-input"
              style={{ minHeight: 240, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span className="te-meta">Active</span>
            </label>
            <div style={{ flex: 1 }} />
            <button type="button" className="te-tab" onClick={createNew}>
              Create new
            </button>
            <button type="button" className="te-tab te-tabActive" onClick={save} disabled={!selectedId}>
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


