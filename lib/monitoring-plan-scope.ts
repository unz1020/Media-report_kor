import type { ShowroomEnvironment, ShowroomItem, ShowroomSurface } from './placement-showroom';

/** Source presence only. Neither historical proof nor metrics imply current delivery. */
export function hasMonitoringSource(item: ShowroomItem): boolean {
  return item.proofs.length > 0 || item.metrics.length > 0;
}

/** Presentation scope only: retain every original item/reference and never rewrite source data. */
export function monitoringPlanScope(items: readonly ShowroomItem[], includePlans = false) {
  const sourced = items.filter(hasMonitoringSource);
  const planOnly = items.filter(item => !hasMonitoringSource(item) && item.plans.length > 0);
  return { sourced, planOnly, visible: includePlans ? items.filter(item => hasMonitoringSource(item) || item.plans.length > 0) : sourced };
}

/** Resolve stale media/selection after scope, surface, or source changes without a transient empty list. */
export function monitoringSelection(items: readonly ShowroomItem[], environment: ShowroomEnvironment, surface: ShowroomSurface | 'all', media: string, selectedId: string) {
  const inEnvironment = items.filter(item => item.environment === environment);
  const filteredSurface = inEnvironment.filter(item => surface === 'all' || item.surface === surface);
  const medias = Array.from(new Set(filteredSurface.map(item => item.media)));
  const activeMedia = medias.includes(media) ? media : '전체';
  const visible = filteredSurface.filter(item => activeMedia === '전체' || item.media === activeMedia);
  const selected = visible.find(item => item.id === selectedId) || visible[0];
  return { inEnvironment, medias, activeMedia, visible, selected };
}
