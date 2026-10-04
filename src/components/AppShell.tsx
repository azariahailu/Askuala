"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Component, useEffect, useState, type ReactNode } from "react";
import { AssistantPanel } from "./AssistantPanel";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  StickyNote,
  X,
} from "lucide-react";
import { useBuddy } from "./BuddyProvider";
import { StudyPrintBackfill } from "./StudyPrintBackfill";
import { ThemeToggle } from "./ThemeToggle";
import { PhoneAccess } from "./PhoneAccess";
import { useTheme, type ThemeMode } from "./ThemeProvider";
import { APP_NAME } from "@/lib/brand";
import { termsForAcademicYear } from "@/lib/terms";
import { createPortal } from "react-dom";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data, ui } = useBuddy();
  const { theme, setTheme } = useTheme();
  const path = usePathname();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [yearsOpen, setYearsOpen] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const [termsOpen, setTermsOpen] = useState<Record<string, boolean>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalOk, setPortalOk] = useState(false);

  useEffect(() => {
    setPortalOk(true);
    if (localStorage.getItem("askuala-sidebar") === "0") setDesktopOpen(false);
    try {
      const years = localStorage.getItem("askuala-years-open-v2");
      if (years) setYearsOpen(JSON.parse(years) as Record<number, boolean>);
      const terms = localStorage.getItem("askuala-terms-open-v2");
      if (terms) setTermsOpen(JSON.parse(terms) as Record<string, boolean>);
      else {
        try {
          localStorage.removeItem("askuala-terms-open");
        } catch {
          /* ignore */
        }
        setTermsOpen({});
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  function closeNav() {
    setMenuOpen(false);
  }

  function toggleDesktop() {
    setDesktopOpen((v) => {
      localStorage.setItem("askuala-sidebar", v ? "0" : "1");
      return !v;
    });
  }

  async function signOut() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = "/login";
  }

  const nav = (wide: boolean, onGo?: () => void) => (
    <>
      <Nav href="/home" icon={<LayoutDashboard size={18} />} label={ui("nav.home")} open={wide} active={path === "/home"} onClick={onGo} />
      {Boolean(data?.settings.isAdmin) && (
        <Nav href="/admin" icon={<Shield size={18} />} label="Admin" open={wide} active={path.startsWith("/admin")} onClick={onGo} />
      )}
      <Nav
        href="/calendar"
        icon={<CalendarDays size={18} />}
        label={ui("nav.calendar")}
        open={wide}
        active={path.startsWith("/calendar")}
        onClick={onGo}
      />
      <Nav
        href="/assistant"
        icon={<MessageSquare size={18} />}
        label={ui("nav.assistant")}
        open={wide}
        active={path.startsWith("/assistant")}
        onClick={onGo}
      />
      <Nav
        href="/quick-notes"
        icon={<StickyNote size={18} />}
        label={ui("nav.quickNotes")}
        open={wide}
        active={path.startsWith("/quick-notes")}
        onClick={onGo}
      />
      {wide && <p className="mt-4 px-2 text-[11px] uppercase tracking-wider text-muted">{ui("nav.academics")}</p>}
      {[1, 2, 3, 4].map((year) => (
        <div key={year}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-ink hover:bg-hover"
            aria-expanded={Boolean(yearsOpen[year])}
            onClick={() =>
              setYearsOpen((s) => {
                const next = { ...s, [year]: !s[year] };
                try {
                  localStorage.setItem("askuala-years-open-v2", JSON.stringify(next));
                } catch {
                  /* ignore */
                }
                return next;
              })
            }
          >
            <span className="flex items-center gap-2">
              {yearsOpen[year] ? <ChevronLeft size={14} className="-rotate-90" /> : <ChevronRight size={14} />}
              {wide ? ui("nav.year", { n: String(year) }) : `Y${year}`}
            </span>
          </button>
          {wide && yearsOpen[year] && (
            <div className="mb-2 ml-4 border-l border-line pl-2">
              {termsForAcademicYear(year).map((t) => {
                const termId = `${year}-${t.term}-${t.year}`;
                const open = Boolean(termsOpen[termId]);
                const courses =
                  data?.courses.filter(
                    (c) => !c.dropped && c.academicYear === year && c.term === t.term && c.year === t.year,
                  ) || [];
                return (
                  <div key={termId} className="py-0.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      className="flex min-h-9 w-full items-center justify-between rounded px-1 py-1.5 text-left text-[11px] text-muted hover:bg-hover hover:text-ink"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTermsOpen((s) => {
                          const next = { ...s, [termId]: !s[termId] };
                          try {
                            localStorage.setItem("askuala-terms-open-v2", JSON.stringify(next));
                          } catch {
                            /* ignore */
                          }
                          return next;
                        });
                      }}
                    >
                      <span className="flex items-center gap-1">
                        {open ? <ChevronLeft size={12} className="-rotate-90" /> : <ChevronRight size={12} />}
                        {t.label}
                      </span>
                      <span className="tabular-nums">{courses.length}</span>
                    </button>
                    {open && (
                      <>
                        {courses.length === 0 && <p className="px-2 text-[11px] text-muted">{ui("nav.noCourses")}</p>}
                        {courses.map((c) => (
                          <Link
                            key={c.id}
                            href={`/courses/${c.id}`}
                            onClick={onGo}
                            className={`block min-h-11 truncate rounded px-2 py-2 hover:bg-hover ${
                              path.startsWith(`/courses/${c.id}`) ? "text-gold-2" : ""
                            }`}
                          >
                            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                            {c.code}
                          </Link>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <Nav href="/settings" icon={<Settings size={18} />} label={ui("nav.settings")} open={wide} active={path.startsWith("/settings")} onClick={onGo} />
      {wide && data?.me?.email && (
        <p className="mt-2 truncate px-2 text-[11px] text-muted" title={data.me.email}>
          {data.me.email}
          {data.settings.isAdmin ? " · admin" : ""}
        </p>
      )}
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-line bg-sidebar lg:flex ${
          desktopOpen ? "w-64" : "w-[72px]"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <img src="/icon.png" alt="" className="h-8 w-8 rounded-md" />
          {desktopOpen && <span className="brand text-[1.05rem] font-semibold text-gold-2">{APP_NAME}</span>}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 text-sm">{nav(desktopOpen)}</nav>
        <button
          type="button"
          onClick={toggleDesktop}
          className="m-2 min-h-11 rounded-md p-2 text-muted hover:bg-hover"
          aria-label={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {desktopOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-canvas px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-hover lg:hidden"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            {menuOpen &&
              portalOk &&
              createPortal(
              <div className="fixed inset-0 z-[200] lg:hidden">
                <button type="button" className="absolute inset-0 z-0 bg-overlay" aria-label="Close menu" onClick={closeNav} />
                <aside className="absolute inset-y-0 left-0 z-10 flex w-[min(20rem,86vw)] flex-col bg-sidebar pt-[env(safe-area-inset-top)] shadow-xl">
                  <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 px-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <img src="/icon.png" alt="" className="h-8 w-8 rounded-md" />
                      <span className="brand truncate text-[1.05rem] font-semibold text-gold-2">{APP_NAME}</span>
                    </div>
                    <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-hover" aria-label="Close menu" onClick={closeNav}>
                      <X size={22} />
                    </button>
                  </div>
                  <nav className="flex-1 overflow-y-auto px-2 pb-4 text-sm">{nav(true, closeNav)}</nav>
                  <div className="space-y-3 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <p className="text-xs uppercase tracking-wide text-muted">Theme</p>
                    <div className="grid grid-cols-3 gap-1">
                      {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-sm capitalize ${theme === mode ? "bg-gold text-on-gold" : "border border-line"}`}
                          onClick={() => setTheme(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <Link href="/assistant" className="block w-full rounded-lg bg-gold px-3 py-2.5 text-center text-on-gold" onClick={closeNav}>
                      {ui("nav.chat")}
                    </Link>
                    <button className="w-full rounded-lg border border-line px-3 py-2.5 text-muted" type="button" onClick={signOut}>
                      {ui("nav.signOut")}
                    </button>
                  </div>
                </aside>
              </div>,
              document.body,
            )}
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto lg:hidden">
              <Link href="/home" className={`flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm ${path === "/home" ? "text-gold-2" : ""}`}>
                {ui("nav.home")}
              </Link>
              {Boolean(data?.settings.isAdmin) && (
                <Link href="/admin" className={`flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm ${path.startsWith("/admin") ? "text-gold-2" : ""}`}>
                  Admin
                </Link>
              )}
              <Link href="/calendar" className={`flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm ${path.startsWith("/calendar") ? "text-gold-2" : ""}`}>
                Cal
              </Link>
              <Link href="/assistant" className={`flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm ${path.startsWith("/assistant") ? "text-gold-2" : ""}`}>
                {ui("nav.assistant")}
              </Link>
              <Link href="/quick-notes" className={`flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm ${path.startsWith("/quick-notes") ? "text-gold-2" : ""}`}>
                Notes
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/assistant" className="rounded-full border border-gold/40 px-3 py-2 text-sm text-gold-2 lg:hidden">
              {ui("nav.chat")}
            </Link>
            <button className="text-sm text-muted hover:text-ink lg:hidden" type="button" onClick={signOut}>
              {ui("nav.signOut")}
            </button>
            <div className="hidden items-center gap-2 lg:flex">
            <PhoneAccess compact />
            <ThemeToggle compact />
            <button type="button" onClick={() => setChatOpen(true)} className="rounded-full border border-gold/40 px-3 py-1 text-gold-2">
              {ui("nav.chat")}
            </button>
            <button className="text-muted hover:text-ink" type="button" onClick={signOut}>
              {ui("nav.signOut")}
            </button>
            </div>
          </div>
        </header>
        <main className="relative z-0 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">{children}</main>
        <StudyPrintBackfill />
        {chatOpen && path !== "/assistant" && (
          <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-surface sm:inset-auto sm:bottom-3 sm:right-3 sm:h-[min(34rem,calc(100dvh-5.5rem))] sm:w-[min(26rem,calc(100vw-1.5rem))] sm:rounded-2xl sm:border sm:border-gold/40 sm:shadow-2xl">
            <ChatSafe onClose={() => setChatOpen(false)}>
              <AssistantPanel variant="popup" onClose={() => setChatOpen(false)} />
            </ChatSafe>
          </div>
        )}
      </div>
    </div>
  );
}

function Nav({
  href,
  icon,
  label,
  open,
  active,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  open: boolean;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 ${active ? "bg-nav-active text-gold-2" : "text-ink hover:bg-hover"}`}
      title={label}
    >
      {icon}
      {open && <span>{label}</span>}
    </Link>
  );
}

class ChatSafe extends Component<{ children: ReactNode; onClose: () => void }, { err: string }> {
  state = { err: "" };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message || "Chat failed" };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full flex-col gap-2 p-3 text-sm">
          <p className="font-medium">Chat hit a snag</p>
          <p className="text-muted">{this.state.err}</p>
          <div className="mt-auto flex gap-2">
            <button type="button" className="rounded-lg bg-gold px-3 py-2 text-on-gold" onClick={() => this.setState({ err: "" })}>
              Try again
            </button>
            <button type="button" className="rounded-lg border border-line px-3 py-2" onClick={this.props.onClose}>
              Close
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function GuardShell({ children }: { children: React.ReactNode }) {
  const { data, loading, error, refresh } = useBuddy();
  if (data) return <AppShell>{children}</AppShell>;
  if (loading) {
    return (
      <div className="p-10">
        <p className="text-muted">Loading your workspace…</p>
        <p className="mt-2 text-sm text-muted">If this sits here, the app is still starting. Refresh in a few seconds.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-10">
      <p className="text-red-400">{error || "Could not load your workspace."}</p>
      <button type="button" className="rounded-lg bg-gold px-3 py-2 text-on-gold" onClick={() => void refresh()}>
        Try again
      </button>
    </div>
  );
}
