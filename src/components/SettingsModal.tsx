"use client";

import { useEffect, useState } from "react";
import type { LlmProvider, ProviderStatus } from "./types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const PROVIDERS: {
  id: LlmProvider;
  name: string;
  blurb: string;
  keyUrl?: string;
  keyLabel?: string;
}[] = [
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    blurb: "Your OpenAI API key. Pay-as-you-go; gpt-4o-mini is very cheap.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyLabel: "sk-…",
  },
  {
    id: "gemini",
    name: "Gemini (Google)",
    blurb: "Free-tier key from Google AI Studio — plenty for this app.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyLabel: "AIza…",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic API)",
    blurb: "Your Anthropic API key. Tip: set model to claude-haiku-4-5 for cheap parsing.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyLabel: "sk-ant-…",
  },
  {
    id: "claude-code",
    name: "Claude Code (CLI)",
    blurb: "Uses the claude CLI on this machine under your subscription — no API key.",
  },
];

export function GoogleG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

interface GoogleConfig {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export default function SettingsModal({ onClose, onSaved }: Props) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [provider, setProvider] = useState<LlmProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gcfg, setGcfg] = useState<GoogleConfig | null>(null);
  const [gClientId, setGClientId] = useState("");
  const [gClientSecret, setGClientSecret] = useState("");
  const [gSaving, setGSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: ProviderStatus) => {
        setStatus(s);
        if (s.provider) {
          setProvider(s.provider);
          setModel(s.models[s.provider] === s.defaults[s.provider] ? "" : s.models[s.provider]);
        }
      })
      .catch(() => setError("Couldn't load settings"));
    fetch("/api/google/config")
      .then((r) => r.json())
      .then(setGcfg)
      .catch(() => {});
  }, []);

  async function saveGoogle(body: object) {
    setGSaving(true);
    try {
      const res = await fetch("/api/google/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setGcfg(await res.json());
      setGClientId("");
      setGClientSecret("");
      onSaved();
    } finally {
      setGSaving(false);
    }
  }

  function switchProvider(p: LlmProvider) {
    setProvider(p);
    setApiKey("");
    if (status) {
      setModel(status.models[p] === status.defaults[p] ? "" : status.models[p]);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          // only send the key if the user typed one (empty = keep existing)
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          model,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const current = PROVIDERS.find((p) => p.id === provider)!;
  const needsKey = provider !== "claude-code";
  const keyAlreadySet =
    needsKey && !!status?.keysSet[provider as "openai" | "gemini" | "anthropic"];
  const cliMissing = provider === "claude-code" && status && !status.claudeCodeAvailable;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">AI provider</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100">
            ✕
          </button>
        </div>

        <div className="space-y-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                provider === p.id
                  ? "border-stone-900 bg-stone-50"
                  : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <input
                type="radio"
                name="provider"
                checked={provider === p.id}
                onChange={() => switchProvider(p.id)}
                className="mt-0.5 accent-stone-900"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  {p.name}
                  {p.id !== "claude-code" &&
                    status?.keysSet[p.id as "openai" | "gemini" | "anthropic"] && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-emerald-600">
                        key saved
                      </span>
                    )}
                  {p.id === "claude-code" && status?.claudeCodeAvailable && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-emerald-600">
                      installed
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">{p.blurb}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {needsKey && (
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-stone-600">
                <span>API key {keyAlreadySet && <span className="text-stone-400">(saved — leave blank to keep)</span>}</span>
                {current.keyUrl && (
                  <a href={current.keyUrl} target="_blank" className="text-indigo-600 hover:underline">
                    get a key ↗
                  </a>
                )}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyAlreadySet ? "••••••••••••" : current.keyLabel}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
              />
              <p className="mt-1 text-[0.65rem] text-stone-400">
                Stored only in the local database on this machine (data/planr.db).
              </p>
            </div>
          )}
          {cliMissing && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
              The <code>claude</code> CLI wasn&apos;t found on this machine — install Claude Code or
              pick an API provider.
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Model <span className="text-stone-400">(optional)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={`default: ${status?.defaults[provider] ?? ""}`}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-6 border-t border-stone-100 pt-4">
          <h2 className="mb-1 text-base font-bold tracking-tight">Google Calendar</h2>
          {gcfg?.connected ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-sm text-emerald-800">
                <span className="font-semibold">Signed in</span>
                {gcfg.email && <span className="block text-xs">{gcfg.email}</span>}
              </div>
              <button
                onClick={() => saveGoogle({ disconnect: true })}
                disabled={gSaving}
                className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
              >
                {gSaving ? "…" : "Disconnect"}
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs leading-relaxed text-stone-500">
                One-time setup: create an OAuth client at{" "}
                <a
                  className="text-indigo-600 underline"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                >
                  console.cloud.google.com
                </a>{" "}
                (type: <em>Web application</em>, redirect URI{" "}
                <code className="rounded bg-stone-100 px-1">
                  http://localhost:3000/api/google/callback
                </code>
                , with the Calendar API enabled), then paste the credentials here and sign in.
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={gClientId}
                  onChange={(e) => setGClientId(e.target.value)}
                  placeholder={gcfg?.configured ? "Client ID (saved — leave blank to keep)" : "Client ID"}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={gClientSecret}
                  onChange={(e) => setGClientSecret(e.target.value)}
                  placeholder={gcfg?.configured ? "Client secret (saved — leave blank to keep)" : "Client secret"}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  {gClientId.trim() && gClientSecret.trim() && (
                    <button
                      onClick={() =>
                        saveGoogle({ clientId: gClientId, clientSecret: gClientSecret })
                      }
                      disabled={gSaving}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
                    >
                      {gSaving ? "Saving…" : "Save credentials"}
                    </button>
                  )}
                  {gcfg?.configured && (
                    <a
                      href="/api/google/auth"
                      className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
                    >
                      <GoogleG /> Sign in with Google
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || (needsKey && !keyAlreadySet && !apiKey.trim())}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-30"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
