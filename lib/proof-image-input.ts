export const PROOF_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,.pptx,.ppt';
export const MAX_PROOF_SOURCE_BYTES = 30 * 1024 * 1024;
export type CropArea = { x: number; y: number; width: number; height: number };
export const fullCrop: CropArea = { x: 0, y: 0, width: 100, height: 100 };
export function proofSourceKind(file: File) {
  if (!file.size) throw new Error('비어 있는 파일입니다. 다른 자료를 선택해주세요.');
  if (file.size > MAX_PROOF_SOURCE_BYTES) throw new Error('이미지·PDF·PPTX 자료는 30MB 이하로 넣어주세요.');
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (/\.pptx$/i.test(file.name)) return 'pptx';
  if (/\.ppt$/i.test(file.name)) throw new Error('구형 PPT는 슬라이드에서 화면을 복사해 붙여넣거나 PDF 또는 PPTX로 저장한 뒤 넣어주세요.');
  if (/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) return 'image';
  throw new Error('이미지, PDF 또는 PPTX를 넣어주세요. 화면 캡처를 복사해 붙여넣어도 됩니다.');
}
export async function imageFileFromSource(url: string, filename: string, crop = fullCrop): Promise<File> {
  const image = new Image(); image.src = url; await image.decode();
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width < 1 || crop.height < 1) throw new Error('등록할 영역을 조금 더 크게 선택해주세요.');
  const x = Math.min(99, Math.max(0, crop.x)), y = Math.min(99, Math.max(0, crop.y));
  const width = Math.min(100 - x, crop.width), height = Math.min(100 - y, crop.height);
  const sourceWidth = image.naturalWidth * width / 100, sourceHeight = image.naturalHeight * height / 100;
  let scale = Math.min(1, 2200 / Math.max(sourceWidth, sourceHeight));
  for (let attempt = 0; attempt < 4; attempt++, scale *= .75) {
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('이미지를 만들 수 없습니다. 다른 브라우저에서 다시 시도해주세요.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, image.naturalWidth * x / 100, image.naturalHeight * y / 100, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (blob && blob.size <= 4 * 1024 * 1024) return new File([blob], filename.replace(/\.[^.]+$/, '') + '-지면.jpg', { type: 'image/jpeg' });
  }
  throw new Error('이미지 크기를 줄일 수 없습니다. 게재 화면 영역만 잘라 다시 선택해주세요.');
}
export async function openProofPdf(file: File) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const assets = '/api/reporting/pdf-assets/6.3.289/';
  pdfjs.GlobalWorkerOptions.workerSrc = assets + 'pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: assets + 'cmaps/', cMapPacked: true, standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/' });
  try { return await task.promise; } catch (error) { await task.destroy(); throw error; }
}
export async function renderProofPage(pdf: Awaited<ReturnType<typeof openProofPdf>>, number: number) {
  const page = await pdf.getPage(number), original = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, 2000 / Math.max(original.width, original.height)) });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, background: '#fff' }).promise;
  return canvas.toDataURL('image/jpeg', .92);
}
// Check central directory sizes before decompression, including XML and unused assets.
function checkZipSize(buffer: ArrayBuffer) {
  const view = new DataView(buffer); let end = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset--) if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  if (end < 0) throw new Error('PPTX 파일을 읽을 수 없습니다. PDF로 저장하거나 화면을 복사해 넣어주세요.');
  const count = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true), total = 0;
  if (count > 5000 || count === 65535) throw new Error('PPTX 항목이 너무 많습니다. 필요한 슬라이드만 별도 파일로 넣어주세요.');
  for (let n = 0; n < count; n++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('PPTX 파일 구조를 확인해주세요.');
    const size = view.getUint32(offset + 24, true); total += size;
    if (size > 32 * 1024 * 1024 || total > 100 * 1024 * 1024) throw new Error('PPTX 내부 자료가 너무 큽니다. 필요한 슬라이드만 넣어주세요.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}
function xml(value: string) {
  const result = new DOMParser().parseFromString(value, 'application/xml');
  if (result.getElementsByTagName('parsererror').length) throw new Error('PPTX 내부 정보를 읽을 수 없습니다.');
  return result;
}
function relativePath(base: string, target: string) {
  const parts = (target.startsWith('/') ? target.slice(1) : base + target).split('/'), out: string[] = [];
  for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return out.join('/');
}
export async function pptxProofImages(file: File) {
  const buffer = await file.arrayBuffer(); checkZipSize(buffer);
  const { default: JSZip } = await import('jszip'); const zip = await JSZip.loadAsync(buffer);
  const read = async (name: string) => { const entry = zip.file(name); if (!entry) throw new Error('PPTX 슬라이드 정보를 읽을 수 없습니다.'); return xml(await entry.async('string')); };
  const presentation = await read('ppt/presentation.xml'), relationships = await read('ppt/_rels/presentation.xml.rels');
  const slides = [...presentation.getElementsByTagNameNS('*', 'sldId')];
  if (slides.length > 300) throw new Error('슬라이드가 너무 많습니다. 필요한 슬라이드만 넣어주세요.');
  const candidates: { label: string; filename: string; blob: Blob }[] = [];
  const relationMap = new Map([...relationships.getElementsByTagNameNS('*', 'Relationship')].filter(r => r.getAttribute('TargetMode') !== 'External').map(r => [r.getAttribute('Id'), r.getAttribute('Target') || '']));
  for (const [index, slide] of slides.entries()) {
    const target = relationMap.get(slide.getAttribute('r:id'));
    if (!target) continue;
    const slidePath = relativePath('ppt/', target);
    if (!/^ppt\/slides\/[^/]+\.xml$/.test(slidePath)) continue;
    const name = slidePath.split('/').pop()!, relationsEntry = zip.file(`ppt/slides/_rels/${name}.rels`);
    if (!relationsEntry) continue;
    const document = await read(slidePath), relations = xml(await relationsEntry.async('string'));
    const images = new Set([...document.getElementsByTagNameNS('*', 'blip')].map(node => node.getAttribute('r:embed')));
    let imageNumber = 0;
    for (const rel of [...relations.getElementsByTagNameNS('*', 'Relationship')]) {
      if (!images.has(rel.getAttribute('Id')) || rel.getAttribute('TargetMode') === 'External') continue;
      const imagePath = relativePath('ppt/slides/', rel.getAttribute('Target') || '');
      if (!/^ppt\/media\/[^/]+\.(png|jpe?g|webp|gif|bmp)$/i.test(imagePath)) continue;
      const entry = zip.file(imagePath); if (!entry) continue;
      const extension = imagePath.split('.').pop()!.toLowerCase(), type = extension === 'jpg' ? 'jpeg' : extension;
      const bytes = await entry.async('uint8array');
      candidates.push({ label: `슬라이드 ${index + 1} · 이미지 ${++imageNumber}`, filename: `${file.name}-슬라이드${index + 1}-${imageNumber}`, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: `image/${type}` }) });
      if (candidates.length >= 100) throw new Error('이미지가 100개 이상입니다. 필요한 슬라이드만 별도 PPTX로 넣어주세요.');
    }
  }
  if (!candidates.length) throw new Error('추출할 이미지가 없습니다. 슬라이드 화면을 복사해 붙여넣거나 PDF로 저장해 넣어주세요.');
  return candidates;
}
