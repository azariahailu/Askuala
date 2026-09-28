"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "askuala-theme";

type ThemeCtx = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  resolved: "light" | "dark";
};

const Ctx = createContext<ThemeCtx | null>(null);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const cookie = document.cookie.match(/(?:^|; )askuala-theme=([^;]*)/);
    const fromCookie = cookie ? decodeURIComponent(cookie[1]) : "";
    const saved = ((fromCookie || localStorage.getItem(KEY)) as ThemeMode | null) || "system";
    if (fromCookie) localStorage.setItem(KEY, fromCookie);
    setThemeState(saved);
    applyTheme(saved);
    setResolved(saved === "system" ? (systemDark() ? "dark" : "light") : saved);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const saved = (localStorage.getItem(KEY) as ThemeMode | null) || "system";
      if (saved === "system") setResolved(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = (next: ThemeMode) => {
    localStorage.setItem(KEY, next);
    document.cookie = `${KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    setThemeState(next);
    applyTheme(next);
    setResolved(next === "system" ? (systemDark() ? "dark" : "light") : next);
  };

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, resolved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme needs ThemeProvider");
  return ctx;
}
