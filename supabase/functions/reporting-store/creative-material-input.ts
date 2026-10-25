/** Declared by an AE. Never allocated from filenames, proof names or performance rows. */
export type CreativeMaterialIdentity = {
  assetId: string;
  version: string;
  displayName: string;
  format?: string;
  reportedFilename?: string;
};
const controls = /[\u0000-\u001f\u007f-\u009f]/;
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || controls.test(value)) {
    throw new Error('INVALID_CREATIVE_MATERIAL_TEXT');
  }
  return value.trim();
}
/** null explicitly clears an annotation; undefined is not a valid update. */
export function normalizeCreativeMaterialIdentity(value: unknown): CreativeMaterialIdentity | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CREATIVE_MATERIAL_INPUT');
  const input = value as Record<string, unknown>;
  const required = ['assetId', 'version', 'displayName'];
  const allowed = [...required, 'format', 'reportedFilename'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || required.some(key => !Object.prototype.hasOwnProperty.call(input, key))) {
    throw new Error('INVALID_CREATIVE_MATERIAL_KEYS');
  }
  const assetId = text(input.assetId, 64).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{2,31}$/.test(assetId)) throw new Error('INVALID_CREATIVE_MATERIAL_ID');
  const rawVersion = text(input.version, 16);
  if (!/^v\d{1,4}$/i.test(rawVersion) || Number(rawVersion.slice(1)) < 1) throw new Error('INVALID_CREATIVE_MATERIAL_VERSION');
  const version = 'v' + String(Number(rawVersion.slice(1))).padStart(2, '0');
  const result: CreativeMaterialIdentity = { assetId, version, displayName: text(input.displayName, 80) };
  if (Object.prototype.hasOwnProperty.call(input, 'format')) result.format = text(input.format, 60);
  if (Object.prototype.hasOwnProperty.call(input, 'reportedFilename')) {
    const filename = text(input.reportedFilename, 180);
    if (/[\/\\]/.test(filename) || filename === '.' || filename === '..') throw new Error('INVALID_CREATIVE_MATERIAL_FILENAME');
    result.reportedFilename = filename;
  }
  return result;
}
