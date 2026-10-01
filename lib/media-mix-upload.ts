import type { MediaPlanFact } from "./daily-report-parser";
import { validateMediaMixFile } from "./media-mix-upload-validation";
export async function parseMediaMixFile(file: File, month: string, signal: AbortSignal): Promise<MediaPlanFact[]> {
  validateMediaMixFile(file);
  const bytes = await file.arrayBuffer();
  if (signal.aborted) throw new Error("파일 분석을 취소했습니다.");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./media-mix-worker.ts", import.meta.url), { type: "module" });
    const finish = () => { worker.terminate(); clearTimeout(timer); signal.removeEventListener("abort", cancel); };
    const cancel = () => { finish(); reject(new Error("파일 분석을 취소했습니다.")); };
    const timer = setTimeout(() => { finish(); reject(new Error("파일 분석 시간이 초과됐습니다. 미디어믹스 시트만 별도 저장해 다시 올려주세요.")); }, 90000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<{ rows?: MediaPlanFact[]; error?: string }>) => {
      finish(); if (event.data.error || !event.data.rows) reject(new Error(event.data.error || "파일 분석에 실패했습니다.")); else resolve(event.data.rows);
    };
    worker.onerror = () => { finish(); reject(new Error("파일 분석에 실패했습니다. 파일을 확인하고 다시 올려주세요.")); };
    worker.postMessage({ bytes, month }, [bytes]);
  });
}
