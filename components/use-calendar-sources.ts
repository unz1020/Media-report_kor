"use client";
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './workspace-context';
import { publishedDatasetsFor, publishedPlacementProofsFor, type PublishedDataset } from '@/lib/daily-report-store';
import type { PlacementProof } from '@/lib/placement-proof';

/** Read-only extra-month snapshots. Never hydrates or changes the workspace store scope. */
export function useCalendarSources() {
  const { advertiser, month, months, reloadData } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [currentProofs, setCurrentProofs] = useState<PlacementProof[]>([]);
  const [otherProofs, setOtherProofs] = useState<PlacementProof[]>([]);
  const [failedMonths, setFailedMonths] = useState<string[]>([]);
  const [readAt, setReadAt] = useState('');
  const cache = useRef(new Map<string, PlacementProof[]>());
  const monthKey = [...new Set(months)].filter(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m !== month).sort().join(',');
  useEffect(() => {
    let active = true, busy = false, lastRead = 0;
    const controller = new AbortController();
    const loadCurrent = () => {
      setDatasets(publishedDatasetsFor(advertiser, month));
      setCurrentProofs(publishedPlacementProofsFor(advertiser));
      setReadAt(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date()));
    };
    const loadOther = async (force = false) => {
      if (busy || (!force && Date.now() - lastRead < 60000)) return;
      busy = true; lastRead = Date.now();
      const pending = monthKey ? monthKey.split(',') : [], errors: string[] = [];
      const worker = async () => {
        while (pending.length && active) {
          const sourceMonth = pending.shift()!;
          try {
            const response = await fetch('/api/reporting/store', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'load_state', advertiser, month: sourceMonth }), signal: controller.signal });
            if (!response.ok) throw new Error('Calendar source read failed');
            const payload = await response.json();
            if (!Array.isArray(payload.imports)) throw new Error('Invalid calendar source');
            const proofs: PlacementProof[] = [];
            for (const item of payload.imports) {
              const proof = item.metadata?.bundle?.placementProof;
              if (!proof) continue;
              if (proof.advertiser !== advertiser || proof.month !== sourceMonth || typeof item.id !== 'string') throw new Error('Calendar scope mismatch');
              proofs.push({ ...proof, key: `remote-proof::${item.id}`, importId: item.id, publishedAt: item.updated_at || item.created_at || proof.publishedAt || '' });
            }
            if (active) cache.current.set(sourceMonth, proofs);
          } catch { if (active) errors.push(sourceMonth); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (active) {
        setOtherProofs([...cache.current.values()].flat());
        setFailedMonths(errors.sort()); busy = false;
      }
    };
    const load = () => { loadCurrent(); void loadOther(); };
    const force = () => { loadCurrent(); void loadOther(true); };
    load();
    window.addEventListener('media-report-daily-updated', load);
    window.addEventListener('media-report-calendar-refresh', force);
    return () => { active = false; controller.abort(); window.removeEventListener('media-report-daily-updated', load); window.removeEventListener('media-report-calendar-refresh', force); };
  }, [advertiser, month, monthKey]);
  const proofs = [...new Map([...otherProofs, ...currentProofs].map(p => [p.key || p.importId || JSON.stringify([p.month,p.sourceFile,p.media,p.placement,p.creativeName,p.periodStart,p.periodEnd]),p])).values()];
  const refresh = () => { void reloadData({ background: true }); window.dispatchEvent(new Event('media-report-calendar-refresh')); };
  return { datasets, proofs, failedMonths, readAt, refresh };
}
