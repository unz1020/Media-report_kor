"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearPublishedDailyState, hydratePublishedDailyState } from "@/lib/daily-report-store";

export type AdvertiserKey = "jacomo" | "kyowon";
export type DataSyncState = "idle" | "loading" | "saving" | "ready" | "error";
export const ADVERTISERS: Record<AdvertiserKey, { label: string; slug: string }> = {
  jacomo: { label: "자코모", slug: "jakomo" },
  kyowon: { label: "교원웰스", slug: "kyowon-wells" },
};
export type WorkspaceAdvertiser = { id: string; name: string; slug: string; accessLevel: "owner" | "editor" | "viewer" };
export type WorkspaceSession = {
  user: { email: string; display_name: string | null; role: string };
  advertisers: WorkspaceAdvertiser[];
  months: string[];
};
type WorkspaceValue = {
  advertiserKey: AdvertiserKey; advertiser: string; month: string; months: string[];
  setAdvertiserKey: (value: AdvertiserKey) => void; setMonth: (value: string) => void;
  dataSyncState: DataSyncState; dataSyncError: string; reloadData: () => Promise<void>;
  session: WorkspaceSession | null; sessionLoading: boolean; sessionError: string;
  refreshSession: () => Promise<void>; canEdit: boolean; allowedAdvertiserKeys: AdvertiserKey[];
};
const WorkspaceContext = createContext<WorkspaceValue | null>(null);
function currentMonth() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [advertiserKey, setAdvertiserKeyState] = useState<AdvertiserKey>("jacomo");
  const [month, setMonthState] = useState(currentMonth);
  const [dataSyncState, setDataSyncState] = useState<DataSyncState>("idle");
  const [dataSyncError, setDataSyncError] = useState("");
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const allowedAdvertiserKeys = (Object.keys(ADVERTISERS) as AdvertiserKey[]).filter(key =>
    session?.advertisers.some(item => item.name === ADVERTISERS[key].label));
  const selectedAccess = session?.advertisers.find(item => item.name === ADVERTISERS[advertiserKey].label)?.accessLevel;
  const canEdit = selectedAccess === "owner" || selectedAccess === "editor";
  const months = [...new Set([currentMonth(), month, ...(session?.months || [])])].sort().reverse();
  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "WORKSPACE_UNAVAILABLE");
      setSession(payload);
      setSessionError("");
    } catch (error) {
      setSession(null);
      clearPublishedDailyState();
      setSessionError(error instanceof Error ? error.message : "WORKSPACE_UNAVAILABLE");
    } finally { setSessionLoading(false); }
  }, []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    if (!session) return;
    const allowed = (Object.keys(ADVERTISERS) as AdvertiserKey[]).filter(key =>
      session.advertisers.some(item => item.name === ADVERTISERS[key].label));
    const saved = window.localStorage.getItem(`media-report-advertiser:${session.user.email}`) as AdvertiserKey;
    if (allowed.length) setAdvertiserKeyState(allowed.includes(saved) ? saved : allowed[0]);
    const savedMonth = window.localStorage.getItem(`media-report-month:${session.user.email}`);
    if (savedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(savedMonth)) setMonthState(savedMonth);
  }, [session?.user.email]);
  const setAdvertiserKey = (value: AdvertiserKey) => {
    if (!allowedAdvertiserKeys.includes(value)) return;
    clearPublishedDailyState(); setAdvertiserKeyState(value);
    window.localStorage.setItem(`media-report-advertiser:${session?.user.email}`, value);
  };
  const setMonth = (value: string) => {
    clearPublishedDailyState(); setMonthState(value);
    window.localStorage.setItem(`media-report-month:${session?.user.email}`, value);
  };
  const reloadData = useCallback(async () => {
    if (!session?.advertisers.some(item => item.name === ADVERTISERS[advertiserKey].label)) return;
    setDataSyncState("loading"); setDataSyncError("");
    try {
      await hydratePublishedDailyState(ADVERTISERS[advertiserKey].label, month);
      setDataSyncState("ready");
    } catch (error) {
      setDataSyncState("error");
      setDataSyncError(error instanceof Error ? error.message : "DB 동기화 실패");
    }
  }, [advertiserKey, month, session]);
  useEffect(() => { void reloadData(); }, [reloadData]);
  useEffect(() => {
    const reloadVisible = () => { if (document.visibilityState === "visible") void reloadData(); };
    const timer = window.setInterval(reloadVisible, 60000);
    window.addEventListener("focus", reloadVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", reloadVisible); };
  }, [reloadData]);
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: DataSyncState; error?: string }>).detail;
      if (detail?.state) { setDataSyncState(detail.state); setDataSyncError(detail.error || ""); }
    };
    window.addEventListener("media-report-daily-sync", onSync);
    return () => window.removeEventListener("media-report-daily-sync", onSync);
  }, []);
  const value = { advertiserKey, advertiser: ADVERTISERS[advertiserKey].label, month, months,
    setAdvertiserKey, setMonth, dataSyncState, dataSyncError, reloadData, session, sessionLoading,
    sessionError, refreshSession, canEdit, allowedAdvertiserKeys };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
