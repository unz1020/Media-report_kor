import sources from '../public/media-icons/sources.json';
import performanceSources from '../public/media-icons/performance-sources.json';
import executionSources from '../public/media-icons/execution-sources.json';
import { mediaIdentity } from './media-identity';
import { canonicalMedia } from './media-normalization';

export type MediaVisual = { key: string; name: string; kind: 'app' | 'platform'; src: string; sourcePage: string };
const byMedia: Record<string,string> = { '네이버':'naver', '카카오':'kakao', '호갱노노':'hogangnono', '직방':'zigbang', '당근':'karrot', '키즈노트':'kidsnote', '마미톡':'mamitalk', '틱톡':'tiktok', 'DV360':'dv360' };
/** Public identification assets only. A buying platform is not a mobile application. */
export function mediaVisual(media: string, placement?: string): MediaVisual | null {
  const identity = mediaIdentity(media, placement);
  const key = identity.src ? identity.key : byMedia[canonicalMedia(media)];
  const source = [...sources,...performanceSources,...executionSources].find(row => row.key === key);
  return source ? { key: source.key, name: source.name, kind: ('kind' in source && source.kind === 'app') ? 'app' : 'platform', src: source.src, sourcePage: source.sourcePage } : null;
}
