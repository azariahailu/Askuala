"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  if (compact) {
    return (
      <label className="text-xs text-muted">
        <span className="sr-only">Theme</span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeMode)}
          className="min-h-11 min-w-[6.5rem] rounded-lg border border-line bg-input px-2"
        >
          {OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className={`inline-flex rounded-full border border-line bg-surface p-0.5 ${compact ? "" : "w-full"}`} role="radiogroup" aria-label="Theme">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const on = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={opt.label}
            onClick={() => setTheme(opt.id)}
            className={`flex min-h-11 min-w-11 flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs ${
              on ? "bg-gold text-on-gold" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={14} />
            {compact ? <span className="hidden">{opt.label}</span> : opt.label}
          </button>
        );
      })}
    </div>
  );
}
