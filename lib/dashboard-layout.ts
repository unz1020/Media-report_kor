export type DashboardLayout = { version: 1; order: string[]; widths: Record<string, number> };
export const LAYOUT_WIDTHS = [12, 15, 20, 30, 40, 60] as const;
export function emptyDashboardLayout(): DashboardLayout { return { version: 1, order: [], widths: {} }; }
export function orderedPanelIds(layout: DashboardLayout, visible: string[]) {
  return [...layout.order.filter(id => visible.includes(id)), ...visible.filter(id => !layout.order.includes(id))];
}
export function movePanel(layout: DashboardLayout, visible: string[], id: string, target: string, after = false): DashboardLayout {
  if (id === target || !visible.includes(id) || !visible.includes(target)) return layout;
  const order = [...layout.order, ...visible.filter(item => !layout.order.includes(item))].filter(item => item !== id);
  order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id);
  return { ...layout, order };
}
