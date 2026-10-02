import type { CSSProperties } from 'react';
import { creativeIdentity } from '@/lib/creative-identity';
import styles from './creative-marker.module.css';

export function creativeStyle(name?: string): CSSProperties {
  const identity = creativeIdentity(name);
  return { '--creative-color': identity.color, '--creative-background': identity.background } as CSSProperties;
}
export function CreativeMarker({ name }: { name?: string }) {
  const identity = creativeIdentity(name);
  return <span aria-hidden="true" className={styles.marker} style={creativeStyle(name)} title={`소재 구분: ${identity.key}`} data-creative-key={identity.key} data-creative-color={identity.color}>{identity.emoji}</span>;
}
export function CreativeLegend({ names }: { names: (string | undefined)[] }) {
  const unique = [...new Set(names.map(name => creativeIdentity(name).key))];
  if (!unique.length) return null;
  return <div className={styles.legend} aria-label="소재 색상 및 이모지 범례"><p>소재 구분 · 같은 소재명은 모든 화면에서 같은 색상과 이모지로 표시됩니다.</p><div>{unique.map(name => <span className={styles.item} style={creativeStyle(name)} key={name}><CreativeMarker name={name} />{name}</span>)}</div></div>;
}
