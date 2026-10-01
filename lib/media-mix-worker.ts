import { analyzeMediaMixWorkbook } from "./media-mix-workbook";
const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<{ bytes: ArrayBuffer; month: string }>) => void) | null; postMessage: (value: unknown) => void };
worker.onmessage = (event) => {
  try { worker.postMessage({ analysis: analyzeMediaMixWorkbook(event.data.bytes, event.data.month) }); }
  catch (error) { worker.postMessage({ error: error instanceof Error ? error.message : "파일 분석에 실패했습니다." }); }
};
