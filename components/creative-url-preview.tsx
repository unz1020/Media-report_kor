"use client";
import { useState } from "react";
import { creativePreview } from "@/lib/creative-preview";
import styles from "./creative-url-preview.module.css";
export function CreativeUrlPreview({ url = "", label = "운영 소재", compact = false }: { url?: string; label?: string; compact?: boolean }) {
  const preview = creativePreview(url);
  if (!preview) return null;
  return <Preview key={preview.embedUrl || preview.url} preview={preview} label={label} compact={compact} />;
}
function Preview({ preview, label, compact }: { preview: NonNullable<ReturnType<typeof creativePreview>>; label: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  return <section className={styles.preview} aria-label={`${label} 미리보기 및 링크`}>
    <div className={styles.actions}><strong>{label}</strong>{preview.embedUrl && <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "미리보기 닫기" : `${preview.provider} 미리보기`}</button>}<a className="btn" href={preview.url} target="_blank" rel="noopener noreferrer">{label} 열기 ↗</a></div>
    {!compact && <a className={styles.url} href={preview.url} target="_blank" rel="noopener noreferrer">{preview.url}</a>}
    {open && <div className={preview.portrait ? styles.portrait : styles.video}><iframe title={`${preview.provider} ${label} 미리보기`} src={preview.embedUrl} loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>}
    {!compact && <small>{preview.embedUrl ? "소재 영상을 미리 봅니다. 실제 광고 지면은 매체 미리보기 링크 또는 게재 캡처로 확인하세요. 재생이 제한되면 원본을 열어주세요." : "링크를 열어 매체 지면 또는 운영 소재를 확인하세요. 로그인이나 매체 접근 권한이 필요할 수 있습니다."}</small>}
  </section>;
}
