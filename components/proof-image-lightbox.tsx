"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./proof-image-lightbox.module.css";

type Size = { width: number; height: number };
export type ProofLightboxImage = { src: string; title: string; description?: string };

export function fitImageScale(image: Size, viewport: Size) {
  if (![image.width, image.height, viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0)) return 1;
  return Math.min(1, viewport.width / image.width, viewport.height / image.height);
}
export function clampImageScale(value: number) {
  return Number.isFinite(value) ? Math.min(8, Math.max(0.05, value)) : 1;
}

/** Read-only viewer. Existing authenticated image URLs and stored assets are unchanged. */
export function ProofImageLightbox({ image, onClose }: { image: ProofLightboxImage; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const helpId = useId();
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const fit = fitImageScale(natural, { width: Math.max(1, viewport.width - 32), height: Math.max(1, viewport.height - 32) });
  const scale = zoom ?? fit;
  const loaded = natural.width > 0 && natural.height > 0;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyPadding = document.body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbar) document.body.style.paddingRight = `${scrollbar + (parseFloat(getComputedStyle(document.body).paddingRight) || 0)}px`;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.paddingRight = bodyPadding;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setViewport(current => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = stage.current;
      if (!element) return;
      element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
      element.scrollTop = Math.max(0, (element.scrollHeight - element.clientHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [scale, viewport.width, viewport.height, natural.width, natural.height]);

  function changeZoom(factor: number) { setZoom(clampImageScale(scale * factor)); }
  function keyboard(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Tab") {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      const active = document.activeElement;
      if (event.shiftKey && last && (active === first || !event.currentTarget.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && first && (active === last || !event.currentTarget.contains(active))) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || !loaded) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(1.25); }
    else if (event.key === "-") { event.preventDefault(); changeZoom(0.8); }
    else if (event.key === "0") { event.preventDefault(); setZoom(1); }
    else if (event.key.toLowerCase() === "f") { event.preventDefault(); setZoom(null); }
  }

  return <dialog ref={dialog} className={styles.viewer} aria-label="게재 이미지 전체 화면" aria-labelledby={titleId} aria-describedby={helpId}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={keyboard}>
    <header className={styles.header}>
      <div className={styles.heading}><span>게재 이미지</span><h2 id={titleId}>{image.title}</h2>{image.description && <p>{image.description}</p>}</div>
      <button ref={closeButton} type="button" className={styles.close} aria-label="이미지 닫기" onClick={onClose}>닫기 <kbd>Esc</kbd></button>
    </header>
    <div className={styles.toolbar} role="toolbar" aria-label="이미지 보기 도구">
      <div className={styles.zoomControls}>
        <button type="button" aria-label="축소" disabled={!loaded || scale <= 0.05} onClick={() => changeZoom(0.8)}>−</button>
        <output aria-label="이미지 배율" aria-live="polite">{loaded ? `${Math.round(scale * 100)}%` : "로딩"}</output>
        <button type="button" aria-label="확대" disabled={!loaded || scale >= 8} onClick={() => changeZoom(1.25)}>+</button>
      </div>
      <button type="button" aria-label="화면에 맞춤" aria-pressed={zoom === null} disabled={!loaded} onClick={() => setZoom(null)}>화면에 맞춤</button>
      <button type="button" aria-label="원본 크기" aria-pressed={zoom === 1} disabled={!loaded} onClick={() => setZoom(1)}>원본 크기 100%</button>
      <a href={image.src} target="_blank" rel="noopener noreferrer">원본 열기</a>
    </div>
    <div ref={stage} className={styles.stage} tabIndex={0} aria-label="확대 이미지 영역">
      {!loaded && !failed && <p className={styles.message} role="status">이미지를 불러오는 중입니다.</p>}
      {failed && <div className={styles.message} role="alert"><p>이미지를 불러오지 못했습니다.</p><a href={image.src} target="_blank" rel="noopener noreferrer">원본 이미지 다시 열기</a></div>}
      <div className={styles.surface} style={loaded ? { width: Math.max(viewport.width, natural.width * scale + 32), height: Math.max(viewport.height, natural.height * scale + 32) } : undefined}>
        <img className={styles.image} src={image.src} alt={`${image.title} 확대 이미지`} draggable={false}
          style={loaded ? { width: natural.width * scale, height: natural.height * scale } : { opacity: 0, width: 1, height: 1 }}
          onLoad={event => { const target = event.currentTarget; setNatural({ width: target.naturalWidth, height: target.naturalHeight }); setFailed(false); }}
          onError={() => { setNatural({ width: 0, height: 0 }); setFailed(true); }}
          onDoubleClick={() => setZoom(zoom === null ? (fit < 1 ? 1 : 2) : null)} />
      </div>
    </div>
    <footer id={helpId} className={styles.help}>확대한 이미지는 가로·세로로 스크롤해 볼 수 있습니다. 두 번 클릭: 원본/화면 맞춤 · + / −: 확대/축소 · Esc: 닫기</footer>
  </dialog>;
}
