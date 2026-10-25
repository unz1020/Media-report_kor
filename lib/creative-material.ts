import { normalizeCreativeMaterialIdentity, type CreativeMaterialIdentity } from '../supabase/functions/reporting-store/creative-material-input';
export { normalizeCreativeMaterialIdentity };
export type { CreativeMaterialIdentity };
/** Invalid or omitted persisted annotations are not usable identities. Does not infer replacements. */
export function readCreativeMaterialIdentity(value: unknown): CreativeMaterialIdentity | null {
  try { return normalizeCreativeMaterialIdentity(value); } catch { return null; }
}
export function materialIdentityKey(value: unknown): string | null {
  const identity = readCreativeMaterialIdentity(value);
  return identity ? JSON.stringify([identity.assetId, identity.version]) : null;
}
function filenamePart(value: string, fallback: string): string {
  const safe = value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_')
    .replace(/\s+/g, '_').replace(/[. ]+$/g, '').replace(/^\.+/g, '');
  return safe || fallback;
}
/** A copyable suggestion only. Never renames, writes, allocates an ID or creates a source link. */
export function suggestedCreativeFilename(advertiser: string, value: unknown): string | null {
  const identity = readCreativeMaterialIdentity(value);
  if (!identity) return null;
  const ext = identity.reportedFilename?.match(/\.([a-z0-9]{1,10})$/i)?.[1].toLowerCase() || '확장자';
  return [filenamePart(advertiser, '광고주'), identity.assetId, filenamePart(identity.displayName, '소재'), identity.version,
    filenamePart(identity.format || '', '규격')].join('_') + '.' + ext;
}
