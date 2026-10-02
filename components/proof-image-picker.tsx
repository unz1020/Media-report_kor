"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { PROOF_IMAGE_ACCEPT, fullCrop, imageFileFromSource, openProofPdf, pptxProofImages, proofSourceKind, renderProofPage, type CropArea } from '@/lib/proof-image-input';
import styles from './proof-image-picker.module.css';
type Pdf = Awaited<ReturnType<typeof openProofPdf>>;
type Candidate = { label: string; filename: string; url: string };
export function ProofImagePicker({ initialFile, disabled = false, onChange, onPendingChange }: {
  initialFile?: File; disabled?: boolean; onChange: (file: File | undefined) => void; onPendingChange: (pending: boolean) => void;
}) {
  const [source, setSource] = useState(''), [sourceName, setSourceName] = useState(''), [previewWidth, setPreviewWidth] = useState(620);
  const [crop, setCrop] = useState<CropArea>(fullCrop), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
  const [pdf, setPdf] = useState<Pdf>(), [pageNumber, setPageNumber] = useState(1), [candidates, setCandidates] = useState<Candidate[]>([]), [notice, setNotice] = useState('');
  const sequence = useRef(0), pdfRef = useRef<Pdf>(undefined), urls = useRef<string[]>([]), cropStart = useRef<{ x: number; y: number }>(undefined);
  const clearResources = useCallback(() => { const old = pdfRef.current; pdfRef.current = undefined; if (old) void old.loadingTask.destroy(); for (const url of urls.current) URL.revokeObjectURL(url); urls.current = []; }, []);
  useEffect(() => () => { sequence.current++; clearResources(); }, [clearResources]);
  const objectUrl = (file: Blob) => { const url = URL.createObjectURL(file); urls.current.push(url); return url; };
  const receive = useCallback(async (file?: File) => {
    if (!file || disabled) return;
    const token = ++sequence.current; clearResources(); setError(''); setNotice(''); setBusy(true); onPendingChange(true); setPdf(undefined); setCandidates([]); setSource(''); setCrop(fullCrop); setSourceName(file.name);
    try {
      const kind = proofSourceKind(file);
      if (kind === 'image') {
        const url = objectUrl(file); setSource(url);
        // Ordinary images stay compatible with the previous single-step file input.
        if (/^image\/(png|jpeg|webp)$/.test(file.type) && file.size <= 4 * 1024 * 1024) { onChange(file); onPendingChange(false); setNotice('이미지가 선택됐습니다. 필요하면 영역을 잘라 적용하세요.'); }
        else { const output = await imageFileFromSource(url, file.name); if (sequence.current !== token) return; onChange(output); onPendingChange(false); setNotice('이미지를 등록 가능한 크기로 준비했습니다.'); }
      } else if (kind === 'pdf') {
        const document = await openProofPdf(file);
        if (sequence.current !== token) { void document.loadingTask.destroy(); return; }
        pdfRef.current = document; setPdf(document); setPageNumber(1);
        const image = await renderProofPage(document, 1); if (sequence.current !== token) return; setSource(image);
      } else {
        const images = await pptxProofImages(file); if (sequence.current !== token) return;
        const items = images.map(item => ({ ...item, url: objectUrl(item.blob) })); setCandidates(items); setSource(items[0].url); setSourceName(items[0].filename);
      }
    } catch (failure) {
      if (sequence.current !== token) return;
      setError(failure instanceof Error ? failure.message : '자료를 읽을 수 없습니다. 화면을 복사해 붙여넣어주세요.'); onPendingChange(false);
    } finally { if (sequence.current === token) setBusy(false); }
  }, [disabled, clearResources, onChange, onPendingChange]);
  // The open editor owns this paste handler; plain text and URL pastes keep normal behavior.
  useEffect(() => {
    if (disabled) return;
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
      if (file) { event.preventDefault(); void receive(file); }
    };
    document.addEventListener('paste', paste); return () => document.removeEventListener('paste', paste);
  }, [disabled, receive]);
  useEffect(() => { if (initialFile) void receive(initialFile); }, [initialFile]);
  async function changePage(number: number) {
    if (!pdf || busy) return; const token = sequence.current; setBusy(true); setError(''); onPendingChange(true);
    try { const image = await renderProofPage(pdf, number); if (sequence.current !== token) return; setSource(image); setPageNumber(number); setCrop(fullCrop); }
    catch { if (sequence.current === token) setError('이 페이지를 읽을 수 없습니다. 다른 페이지를 선택해주세요.'); }
    finally { if (sequence.current === token) setBusy(false); }
  }
  async function applyImage() {
    const token = sequence.current; setBusy(true); setError('');
    try { const output = await imageFileFromSource(source, `${sourceName}${pdf ? `-페이지${pageNumber}` : ''}`, crop); if (sequence.current !== token) return; onChange(output); onPendingChange(false); setNotice('선택한 영역을 이미지로 준비했습니다. 지면 저장을 누르면 등록됩니다.'); }
    catch (failure) { if (sequence.current === token) setError(failure instanceof Error ? failure.message : '이미지를 만들 수 없습니다.'); }
    finally { if (sequence.current === token) setBusy(false); }
  }
  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
  }
  function drawCrop(event: PointerEvent<HTMLDivElement>) {
    const start = cropStart.current; if (!start || busy || disabled) return;
    const end = point(event); setCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) }); onPendingChange(true); setNotice('');
  }
  function reset() { sequence.current++; clearResources(); setSource(''); setCandidates([]); setPdf(undefined); setError(''); setNotice(''); setBusy(false); setCrop(fullCrop); onChange(undefined); onPendingChange(false); }
  return <section className={styles.picker} aria-label="게재 이미지 입력">
    <div className={`${styles.drop} ${dragging ? styles.dragging : ''}`} onDragOver={event => { if (disabled) return; event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (disabled) return; const files = [...event.dataTransfer.files]; if (files.length > 1) { setError('한 번에 한 파일을 넣어주세요.'); return; } void receive(files[0]); }}>
      <strong>이미지·PDF·PPTX를 여기에 놓으세요</strong><p>화면을 복사한 뒤 Ctrl+V / ⌘V로 바로 붙여넣을 수 있습니다.</p>
      <label>미리보기 / 게재 이미지<input type="file" aria-label="미리보기 / 게재 이미지" accept={PROOF_IMAGE_ACCEPT} disabled={disabled || busy} onChange={event => { void receive(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
      <small>원본 최대 30MB · PDF 페이지 선택 · PPTX에 포함된 이미지 선택 · 이미지 자동 크기 조정</small>
    </div>
    {busy && <p role="status">자료를 읽고 이미지를 준비하고 있습니다…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {source && <div className={styles.editor}>
      {pdf && <div className={styles.navigation}><button className="btn" type="button" disabled={disabled || busy || pageNumber <= 1} onClick={() => void changePage(pageNumber - 1)}>이전 페이지</button><label>PDF 페이지<select aria-label="PDF 페이지" value={pageNumber} disabled={disabled || busy} onChange={e => void changePage(Number(e.target.value))}>{Array.from({length:pdf.numPages},(_,i)=><option value={i+1} key={i}>{i+1} / {pdf.numPages}</option>)}</select></label><button className="btn" type="button" disabled={disabled || busy || pageNumber >= pdf.numPages} onClick={() => void changePage(pageNumber + 1)}>다음 페이지</button></div>}
      {candidates.length > 0 && <><p>PPTX에 포함된 이미지를 선택하세요. 슬라이드 전체 화면은 PDF로 넣거나 복사해 붙여넣을 수 있습니다.</p><div className={styles.candidates} aria-label="PPTX 포함 이미지">{candidates.map(item=><button type="button" key={item.filename} disabled={disabled || busy} aria-pressed={source===item.url} onClick={()=>{setSource(item.url);setSourceName(item.filename);setCrop(fullCrop);onPendingChange(true);setNotice('');}}><img alt="" src={item.url}/><span>{item.label}</span></button>)}</div></>}
      <p>페이지 전체를 사용하거나, 아래 화면에서 드래그해 게재 영역만 선택하세요.</p>
      <div className={styles.canvas} style={{width:previewWidth}} aria-label="게재 이미지 자르기" onPointerDown={e=>{if(disabled || busy || e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);cropStart.current=point(e);}} onPointerMove={drawCrop} onPointerUp={e=>{if(cropStart.current)drawCrop(e);cropStart.current=undefined;}} onPointerCancel={()=>{cropStart.current=undefined;setCrop(fullCrop);}}>
        <img src={source} alt="보고서 이미지 미리보기" draggable={false} onLoad={e=>setPreviewWidth(Math.min(e.currentTarget.naturalWidth,e.currentTarget.naturalWidth/e.currentTarget.naturalHeight*620))}/><div className={styles.selection} style={{left:`${crop.x}%`,top:`${crop.y}%`,width:`${crop.width}%`,height:`${crop.height}%`}}/>
      </div>
      <div className={styles.cropFields}>{([['x','왼쪽'],['y','위쪽'],['width','너비'],['height','높이']] as const).map(([key,label])=><label key={key}>{label} (%)<input type="number" aria-label={`자르기 ${label} (%)`} min={key==='width'||key==='height'?1:0} max={100} value={Math.round(crop[key])} disabled={disabled || busy} onChange={e=>{setCrop(current=>({...current,[key]:Number(e.target.value)}));onPendingChange(true);setNotice('');}}/></label>)}</div>
      <div className={styles.actions}><button className="btn" type="button" disabled={disabled || busy} onClick={()=>{setCrop(fullCrop);onPendingChange(true);setNotice('');}}>전체 영역</button><button className="btn primary" type="button" disabled={disabled || busy || crop.width<1 || crop.height<1} onClick={()=>void applyImage()}>이 이미지 사용</button><button className="btn" type="button" disabled={disabled || busy} onClick={reset}>선택 취소</button></div>
    </div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
