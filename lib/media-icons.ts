import sources from '../public/media-icons/sources.json';
import { canonicalMedia } from './media-normalization';

export type MediaVisual = { key: string; name: string; kind: 'app' | 'platform'; src: string; sourcePage: string };
const byMedia: Record<string,string> = { '네이버':'naver', '카카오':'kakao', '호갱노노':'hogangnono', '직방':'zigbang', '당근':'karrot', '키즈노트':'kidsnote', '마미톡':'mamitalk', '틱톡':'tiktok', 'DV360':'dv360' };
/** Public identification assets only. A buying platform is not a mobile application. */
export function mediaVisual(media: string): MediaVisual | null {
  const key = byMedia[canonicalMedia(media)];
  const source = sources.find(row => row.key === key);
  return source ? { key: source.key, name: source.name, kind: source.kind === 'app' ? 'app' : 'platform', src: source.src, sourcePage: source.sourcePage } : null;
}
