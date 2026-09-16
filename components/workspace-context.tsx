"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { hydratePublishedDailyState } from "@/lib/daily-report-store";

export type AdvertiserKey = "jacomo" | "kyowon";
export type DataSyncState = "idle" | "loading" | "saving" | "ready" | "error";

export const ADVERTISERS: Record<AdvertiserKey, { label: string; slug: string }> = {
  jacomo: { label: "자코모", slug: "jacomo" },
  kyowon: { label: "교원웰스", slug: "kyowon" },
};

type WorkspaceValue = {
  advertiserKey: AdvertiserKey;
  advertiser: string;
  month: string;
  setAdvertiserKey: (value: AdvertiserKey) => void;
  setMonth: (value: string) => void;
  dataSyncState: DataSyncState;
  dataSyncError: string;
  reloadData: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const ADVERTISER_STORAGE = "media-report-workspace-advertiser";
const MONTH_STORAGE = "media-report-workspace-month";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [advertiserKey, setAdvertiserKeyState] = useState<AdvertiserKey>("jacomo");
  const [month, setMonthState] = useState("2026-09");
  const [dataSyncState, setDataSyncState] = useState<DataSyncState>("idle");
  const [dataSyncError, setDataSyncError] = useState("");

  useEffect(() => {
    const savedAdvertiser = window.localStorage.getItem(ADVERTISER_STORAGE) as AdvertiserKey | null;
    const savedMonth = window.localStorage.getItem(MONTH_STORAGE);
    if (savedAdvertiser && ADVERTISERS[savedAdvertiser]) setAdvertiserKeyState(savedAdvertiser);
    if (savedMonth) setMonthState(savedMonth);
  }, []);

  const setAdvertiserKey = (value: AdvertiserKey) => {
    setAdvertiserKeyState(value);
    window.localStorage.setItem(ADVERTISER_STORAGE, value);
  };

  const setMonth = (value: string) => {
    setMonthState(value);
    window.localStorage.setItem(MONTH_STORAGE, value);
  };

  const reloadData = useCallback(async () => {
    setDataSyncState("loading");
    setDataSyncError("");
    try {
      await hydratePublishedDailyState(ADVERTISERS[advertiserKey].label, month);
      setDataSyncState("ready");
    } catch (error) {
      setDataSyncState("error");
      setDataSyncError(error instanceof Error ? error.message : "Supabase 동기화 실패");
    }
  }, [advertiserKey, month]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: DataSyncState; error?: string }>).detail;
      if (!detail?.state) return;
      setDataSyncState(detail.state);
      setDataSyncError(detail.error || "");
    };
    window.addEventListener("media-report-daily-sync", onSync);
    return () => window.removeEventListener("media-report-daily-sync", onSync);
  }, []);

  const value = useMemo<WorkspaceValue>(() => ({
    advertiserKey,
    advertiser: ADVERTISERS[advertiserKey].label,
    month,
    setAdvertiserKey,
    setMonth,
    dataSyncState,
    dataSyncError,
    reloadData,
  }), [advertiserKey, month, dataSyncState, dataSyncError, reloadData]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
