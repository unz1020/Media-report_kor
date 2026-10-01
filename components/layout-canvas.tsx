"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { useWorkspace } from "./workspace-context";
import { emptyDashboardLayout, LAYOUT_WIDTHS, movePanel, orderedPanelIds, type DashboardLayout } from "@/lib/dashboard-layout";
import styles from "./layout-canvas.module.css";

type PanelProps = { id: string; title: string; width?: number; children: ReactNode };
export function LayoutPanel({ children }: PanelProps) { return <>{children}</>; }
export function LayoutGroup({ children }: { children: ReactNode }) { return <>{children}</>; }
function collectPanels(children: ReactNode): PanelProps[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment || child.type === LayoutGroup) return collectPanels((child.props as { children: ReactNode }).children);
    if (child.type === LayoutPanel) return [child.props as PanelProps];
    return [];
  });
}
async function requestLayout(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/reporting/store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error === "LAYOUT_CHANGED"
    ? "동료가 배치를 변경했습니다. 취소 후 다시 편집하면 최신 배치를 불러옵니다."
    : "배치를 불러오거나 저장하지 못했습니다. 다시 시도해주세요.");
  return payload;
}
export function LayoutCanvas({ page, children }: { page: string; children: ReactNode }) {
  const { advertiser } = useWorkspace();
  return <LayoutCanvasInner key={advertiser + ":" + page} page={page}>{children}</LayoutCanvasInner>;
}
function LayoutCanvasInner({ page, children }: { page: string; children: ReactNode }) {
  const { advertiser, canEdit } = useWorkspace();
  const panels = collectPanels(children);
  const ids = panels.map(panel => panel.id);
  const [saved, setSaved] = useState<DashboardLayout>(emptyDashboardLayout);
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<{ id: string; target: string; after: boolean; x: number; y: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const pointer = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const active = draft !== null && canEdit;
  const activeRef = useRef(false);
  activeRef.current = active || saving;
  const layout = active ? draft! : saved;
  const order = orderedPanelIds(layout, ids);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const payload = await requestLayout({ action: "load_layout", advertiser, page });
      if (!mounted.current || ticket !== generation.current || activeRef.current) return;
      setSaved(payload.layout || emptyDashboardLayout()); setUpdatedAt(payload.updatedAt || null); setError("");
    } catch (error) {
      if (mounted.current && ticket === generation.current) setError(error instanceof Error ? error.message : "배치를 불러오지 못했습니다.");
    } finally { if (mounted.current && ticket === generation.current) setLoading(false); }
  }, [advertiser, page]);
  useEffect(() => {
    mounted.current = true; void refresh();
    const reload = () => { if (!activeRef.current && document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", reload);
    const timer = window.setInterval(reload, 60000);
    return () => { mounted.current = false; generation.current++; window.removeEventListener("focus", reload); window.clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { if (!canEdit) { setDraft(null); setDrag(null); dragRef.current = null; pointer.current = null; } }, [canEdit]);
  async function save() {
    if (!draft || !canEdit || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const settings = { ...draft, order: [...draft.order, ...ids.filter(id => !draft.order.includes(id))] };
      const payload = await requestLayout({ action: "save_layout", input: { advertiser, page, layout: settings, expectedUpdatedAt: updatedAt } });
      if (!mounted.current) return;
      setSaved(payload.layout); setUpdatedAt(payload.updatedAt); setDraft(null); setNotice("화면 배치를 저장했습니다. 동료에게도 같은 배치가 적용됩니다.");
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { if (mounted.current) setSaving(false); }
  }
  function move(id: string, target: string, after = false) {
    if (!active || saving) return;
    setDraft(current => current ? movePanel(current, ids, id, target, after) : current);
    setNotice("위치를 변경했습니다. 배치 저장을 눌러 적용하세요.");
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const position = order.indexOf(id);
    if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const backward = ["ArrowUp", "ArrowLeft", "Home"].includes(event.key);
      const target = event.key === "Home" ? order[0] : event.key === "End" ? order.at(-1) : order[position + (backward ? -1 : 1)];
      if (target) move(id, target, !backward);
    }
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8 && !dragRef.current) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-layout-panel]");
    let targetId = dragRef.current?.target || start.id;
    let after = dragRef.current?.after || false;
    if (target && target.parentElement === canvas.current) {
      targetId = target.dataset.layoutPanel || start.id;
      const rect = target.getBoundingClientRect();
      const narrow = rect.width < (canvas.current?.clientWidth || rect.width) * .9;
      after = narrow ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
    }
    const next = { id: start.id, target: targetId, after, x: event.clientX, y: event.clientY };
    dragRef.current = next; setDrag(next);
    // Keep long pages reachable while a mouse or touch pointer is held.
    if (event.clientY < 100) window.scrollBy(0, -24);
    else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 24);
  }
  function finishDrag(cancel = false) {
    const current = dragRef.current;
    if (!cancel && current) move(current.id, current.target, current.after);
    pointer.current = null; dragRef.current = null; setDrag(null);
  }
  return <>
    {canEdit && <div className={styles.toolbar} aria-label="화면 배치 편집">
      <div><strong>{active ? "화면 배치 편집 중" : "화면 배치"}</strong><p>{active ? "이동 손잡이를 드래그하거나 화살표를 누르세요. 카드 너비도 조절할 수 있습니다." : "카드와 섹션의 위치·너비를 바꾸고 팀과 공유하세요."}</p></div>
      <div className={styles.buttons}>{active ? <>
        <button type="button" className="btn" disabled={saving} onClick={() => { setDraft(emptyDashboardLayout()); setNotice("기본 배치로 되돌렸습니다. 배치 저장을 눌러 적용하세요."); }}>기본 배치</button>
        <button type="button" className="btn" disabled={saving} onClick={() => { setDraft(null); activeRef.current = false; setError(""); setNotice(""); void refresh(); }}>배치 취소</button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>{saving ? "배치 저장 중…" : "배치 저장"}</button>
      </> : <><button type="button" className="btn primary" disabled={loading || Boolean(error)} onClick={() => { setDraft({ ...saved, order: [...saved.order, ...ids.filter(id => !saved.order.includes(id))], widths: { ...saved.widths } }); setNotice(""); }}>화면 편집</button>{error && <button type="button" className="btn" disabled={loading} onClick={() => void refresh()}>배치 다시 불러오기</button>}</>}</div>
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div ref={canvas} className={`${styles.canvas} ${active ? styles.editing : ""}`} data-layout-page={page}>
      {order.map((id, index) => {
        const panel = panels.find(panel => panel.id === id)!;
        const width = layout.widths[id] || panel.width || 60;
        return <div key={id} data-layout-panel={id} data-layout-width={width} className={`${styles.panel} ${drag?.id === id ? styles.dragging : ""} ${drag?.target === id && drag.id !== id ? styles.dropTarget : ""}`} style={{ "--panel-span": width } as CSSProperties}>
          {active && <div className={styles.panelTools}>
            <button type="button" className={styles.handle} aria-label={`${panel.title} 이동`} disabled={saving} onKeyDown={event => keyboard(event, id)} onPointerDown={event => { if (event.button !== 0 || saving) return; event.currentTarget.setPointerCapture(event.pointerId); pointer.current = { id, x: event.clientX, y: event.clientY }; }} onPointerMove={pointerMove} onPointerUp={() => finishDrag()} onPointerCancel={() => finishDrag(true)} onLostPointerCapture={() => finishDrag(true)}>⠿ <span>{panel.title}</span></button>
            <div className={styles.panelButtons}>
              <button type="button" aria-label={`${panel.title} 앞으로 이동`} disabled={saving || index === 0} onClick={() => move(id, order[index - 1])}>↑</button>
              <button type="button" aria-label={`${panel.title} 뒤로 이동`} disabled={saving || index === order.length - 1} onClick={() => move(id, order[index + 1], true)}>↓</button>
              <select aria-label={`${panel.title} 너비`} value={width} disabled={saving} onChange={event => setDraft(current => current ? { ...current, widths: { ...current.widths, [id]: Number(event.target.value) } } : current)}>{LAYOUT_WIDTHS.map(value => <option key={value} value={value}>{({ 12: "1/5 너비", 15: "1/4 너비", 20: "1/3 너비", 30: "절반 너비", 40: "2/3 너비", 60: "전체 너비" })[value]}</option>)}</select>
            </div>
          </div>}
          <div className={styles.body}>{panel.children}</div>
        </div>;
      })}
    </div>
    {drag && <div className={styles.ghost} style={{ left: drag.x + 12, top: drag.y + 12 }}>이동 중 · 놓아서 배치</div>}
  </>;
}
