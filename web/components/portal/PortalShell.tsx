"use client";

import React, { useEffect, useRef, useState } from "react";
import { CogniTaraLockup, CogniTaraMark } from "@/components/CogniTaraLogo";
import {
  getMonogram,
  PIconBell,
  PIconChevronDown,
  PIconChevronRight,
  PIconLogOut,
  PIconMenu,
  PIconSearch,
  PIconSidebar,
  PortalThemeToggle,
} from "./PortalIcons";

export interface ShellNavItem {
  id: string;
  group: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

export interface ShellCommandItem {
  id: string;
  label: string;
  hint?: string;
  onSelect: () => void;
}

interface PortalShellProps {
  roleLabel: "Admin" | "Teacher";
  schoolName: string;
  schoolTermMeta: string;
  userName: string;
  userSubtitle: string;
  activeId: string;
  crumbLabel: string;
  navItems: ShellNavItem[];
  onSelectNav: (id: string) => void;
  onSignOut: () => void;
  pendingCount?: number;
  onClickBell?: () => void;
  footerAction?: React.ReactNode;
  commands?: ShellCommandItem[];
  children: React.ReactNode;
}

export function PortalShell({
  roleLabel,
  schoolName,
  schoolTermMeta,
  userName,
  userSubtitle,
  activeId,
  crumbLabel,
  navItems,
  onSelectNav,
  onSignOut,
  pendingCount = 0,
  onClickBell,
  footerAction,
  commands = [],
  children,
}: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        setCmdQuery("");
      } else if (e.key === "Escape") {
        setCmdOpen(false);
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const groups: Array<{ name: string; items: ShellNavItem[] }> = [];
  for (const item of navItems) {
    let g = groups.find((x) => x.name === item.group);
    if (!g) {
      g = { name: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  const allCommands: ShellCommandItem[] = [
    ...navItems.map((n) => ({
      id: `nav:${n.id}`,
      label: n.label,
      hint: n.group,
      onSelect: () => onSelectNav(n.id),
    })),
    ...commands,
  ];
  const filteredCommands = cmdQuery.trim()
    ? allCommands.filter((c) => c.label.toLowerCase().includes(cmdQuery.trim().toLowerCase()))
    : allCommands;

  const schoolMonogram = getMonogram(schoolName, "CT");
  const userMonogram = getMonogram(userName, roleLabel[0]);

  return (
    <div className={`pt-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <div className="pt-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />

      <aside className="pt-sidebar" aria-label={`${roleLabel} navigation`}>
        <div className="pt-sidebar__brand">
          <button
            type="button"
            className="pt-sidebar__brand-link"
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
            onClick={() => {
              onSelectNav(navItems[0]?.id || "overview");
              setMobileOpen(false);
            }}
          >
            {collapsed ? (
              <CogniTaraMark size={22} />
            ) : (
              <CogniTaraLockup markSize={22} wordmarkHeight={14} />
            )}
          </button>
          <span className="pt-sidebar__role">{roleLabel}</span>
        </div>

        <div className="pt-sidebar__scroll">
          <div className="pt-school-tile" title={schoolName}>
            <span className="pt-crest pt-crest--sm">{schoolMonogram}</span>
            <span className="pt-school-tile__txt">
              <strong>{schoolName}</strong>
              <span>{schoolTermMeta}</span>
            </span>
          </div>

          {groups.map((g) => (
            <nav key={g.name} className="pt-nav-group" aria-label={g.name}>
              <div className="pt-nav-label">{g.name}</div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`pt-nav-item ${activeId === item.id ? "is-active" : ""}`}
                  onClick={() => {
                    onSelectNav(item.id);
                    setMobileOpen(false);
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="pt-nav-item__ico">{item.icon}</span>
                  <span className="pt-nav-item__lbl">{item.label}</span>
                  {typeof item.count === "number" && item.count > 0 ? (
                    <span className="pt-nav-item__num">{item.count}</span>
                  ) : null}
                </button>
              ))}
            </nav>
          ))}
        </div>

        {footerAction ? <div className="pt-sidebar__foot">{footerAction}</div> : null}
      </aside>

      <div className="pt-main-col">
        <header className="pt-topbar">
          <div className="pt-topbar__left">
            <button
              type="button"
              className="pt-icon-btn pt-mobile-menu-btn"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open navigation"
            >
              <PIconMenu size={18} />
            </button>
            <button
              type="button"
              className="pt-icon-btn pt-desktop-collapse-btn"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PIconSidebar size={16} />
            </button>
            <nav className="pt-crumbs" aria-label="Breadcrumb">
              <span>{roleLabel}</span>
              <PIconChevronRight size={13} />
              <strong>{crumbLabel}</strong>
            </nav>
          </div>

          <div className="pt-topbar__right">
            <button
              type="button"
              className="pt-cmd-trigger"
              onClick={() => {
                setCmdOpen(true);
                setCmdQuery("");
              }}
              aria-label="Jump to page or action"
            >
              <PIconSearch size={14} />
              <span>Jump to action</span>
              <kbd className="pt-kbd">Ctrl K</kbd>
            </button>

            <PortalThemeToggle />

            {onClickBell ? (
              <button
                type="button"
                className="pt-icon-btn"
                onClick={onClickBell}
                aria-label="Pending approvals"
                title="Pending student approvals"
              >
                <PIconBell size={16} />
                {pendingCount > 0 ? <span className="pt-icon-btn__count">{pendingCount}</span> : null}
              </button>
            ) : null}

            <div className="pt-user-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="pt-user-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="pt-crest pt-crest--solid pt-crest--xs">{userMonogram}</span>
                <span className="pt-hide-sm">{userName}</span>
                <PIconChevronDown size={13} />
              </button>

              {menuOpen ? (
                <div className="pt-dropdown-menu" role="menu">
                  <div className="pt-dropdown-menu__head">
                    <strong>{userName}</strong>
                    <span>{userSubtitle}</span>
                  </div>
                  <button
                    type="button"
                    className="pt-dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                  >
                    <PIconLogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main id="main-content" className="pt-content">
          {children}
        </main>
      </div>

      {cmdOpen ? (
        <div
          className="pt-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onClick={() => setCmdOpen(false)}
        >
          <div className="pt-cmd-box" onClick={(e) => e.stopPropagation()}>
            <div className="pt-cmd-input-row">
              <PIconSearch size={15} />
              <input
                type="text"
                autoFocus
                placeholder="Search pages or actions"
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
              />
              <kbd className="pt-kbd">Esc</kbd>
            </div>
            <ul className="pt-cmd-list">
              {filteredCommands.length === 0 ? (
                <li style={{ padding: "14px 12px", fontSize: 13, color: "var(--pt-ink-3)" }}>
                  No matching commands
                </li>
              ) : (
                filteredCommands.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="pt-cmd-item"
                      onClick={() => {
                        setCmdOpen(false);
                        c.onSelect();
                      }}
                    >
                      <span>{c.label}</span>
                      {c.hint ? <span style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>{c.hint}</span> : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
