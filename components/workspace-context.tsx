"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdvertiserKey = "jacomo" | "kyowon";

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
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const ADVERTISER_STORAGE = "media-report-workspace-advertiser";
const MONTH_STORAGE = "media-report-workspace-month";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [advertiserKey, setAdvertiserKeyState] = useState<AdvertiserKey>("jacomo");
  const [month, setMonthState] = useState("2026-09");

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

  const value = useMemo<WorkspaceValue>(() => ({
    advertiserKey,
    advertiser: ADVERTISERS[advertiserKey].label,
    month,
    setAdvertiserKey,
    setMonth,
  }), [advertiserKey, month]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
