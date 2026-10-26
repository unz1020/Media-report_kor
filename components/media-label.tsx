'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { mediaIdentity } from '@/lib/media-identity';
import styles from './media-label.module.css';

/** Decorative identity mark plus unchanged source label. Never used for grouping or export. */
export function MediaLabel({ media, placement, children, size='sm', className }: { media:string; placement?:string; children?:ReactNode; size?:'sm'|'md'|'lg'; className?:string }) {
  const identity=mediaIdentity(media, placement);
  const [failedSource,setFailedSource]=useState<string|null>(null);
  const showLogo=Boolean(identity.src && failedSource!==identity.src);
  return <span className={[styles.label,styles[size],className].filter(Boolean).join(' ')} data-media-label={media}>
    <span className={styles.mark} aria-hidden="true" data-media-icon={identity.key} data-kind={identity.kind} data-monogram={identity.short} data-mark-length={Array.from(identity.short).length} data-logo-format={identity.logoFormat} data-logo={showLogo?'true':'false'} style={{'--media-ink':identity.color,'--media-tint':identity.background} as CSSProperties}>
      {showLogo&&<img src={identity.src!} width={36} height={36} alt="" decoding="async" onError={()=>setFailedSource(identity.src)}/>}
    </span><span className={styles.text}>{children??identity.name}</span>
  </span>;
}
