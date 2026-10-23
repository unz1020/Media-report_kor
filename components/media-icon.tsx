"use client";
import { useEffect, useState } from 'react';
import { mediaVisual } from '@/lib/media-icons';

export function MediaIcon({ media, className }: { media: string; className?: string }) {
  const asset=mediaVisual(media);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[asset?.src]);
  return <span className={className} aria-hidden="true" data-media-icon={asset?.key || 'web'}>{asset&&!failed
    ? <img src={asset.src} alt="" width={48} height={48} loading="lazy" onError={()=>setFailed(true)} style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}}/>
    : <svg viewBox="0 0 48 48" fill="none" width="100%" height="100%"><rect x="7" y="9" width="34" height="29" rx="7" fill="#f4f5f8" stroke="#a4adbd" strokeWidth="2"/><path d="M8 17h32M16 12h.1M21 12h.1M17 25l-4 3 4 3M31 25l4 3-4 3M27 23l-6 11" stroke="#657088" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>;
}
