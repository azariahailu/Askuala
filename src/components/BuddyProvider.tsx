"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ClientState } from "@/lib/types";
import { fillUiText, firstName, UI_DEFAULTS } from "@/lib/ui-copy";

type BuddyCtx = {
  data: ClientState | null;
  loading: boolean;
  error: string;
  ui: (key: string, vars?: Record<string, string>) => string;
  refresh: () => Promise<void>;
  postForm: (url: string, form: FormData) => Promise<ClientState & { extra?: unknown; error?: string }>;
  postJson: (url: string, body: unknown, method?: string) => Promise<ClientState & { extra?: unknown; error?: string }>;
};

const Ctx = createContext<BuddyCtx | null>(null);

export function BuddyProvider({ children, initial }: { children: React.ReactNode; initial?: ClientState | null }) {
  const [data, setData] = useState<ClientState | null>(initial || null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const dataRef = useRef(data);
  dataRef.current = data;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store", credentials: "include", signal: AbortSignal.timeout(20000) });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        if (!dataRef.current) setError(json.error || "Could not load");
        setLoading(false);
        return;
      }
      setData(json);
      setError("");
      setLoading(false);
    } catch (e) {
      if (!dataRef.current) setError(e instanceof Error ? e.message : "Could not load your workspace. Keep the computer on and refresh.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) {
      setLoading(false);
      return;
    }
    refresh();
  }, [initial, refresh]);

  useEffect(() => {
    const ping = (reason: "active" | "stop") => {
      const body = JSON.stringify({ reason, path: window.location.pathname });
      if (reason === "stop" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "include",
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") ping("stop");
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => ping("stop"));
    const later = window.setTimeout(() => {
      if (document.visibilityState === "visible") ping("active");
    }, 60_000);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") ping("active");
    }, 120000);
    const mail = setInterval(async () => {
      const res = await fetch("/api/notifications/tick", { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      const popups = json.extra?.popups as { title: string; body: string }[] | undefined;
      if (popups?.length && "Notification" in window) {
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") {
          for (const p of popups) new Notification(p.title, { body: p.body, icon: "/icon.png" });
        }
      }
    }, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(later);
      clearInterval(t);
      clearInterval(mail);
    };
  }, []);

  const apply = (json: ClientState & { error?: string }) => {
    if (json.me) setData(json);
    if (json.error && !json.me) throw new Error(json.error);
    return json;
  };

  const postForm = useCallback(async (url: string, form: FormData) => {
    const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return apply(json);
  }, []);

  const postJson = useCallback(async (url: string, body: unknown, method = "POST") => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return apply(json);
  }, []);

  const ui = useCallback(
    (key: string, vars?: Record<string, string>) => {
      const template = data?.uiText?.[key] || UI_DEFAULTS[key] || key;
      return fillUiText(template, { name: firstName(data?.me.name || ""), ...vars });
    },
    [data],
  );

  const value = useMemo(
    () => ({ data, loading, error, ui, refresh, postForm, postJson }),
    [data, loading, error, ui, refresh, postForm, postJson],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBuddy() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBuddy needs BuddyProvider");
  return ctx;
}
