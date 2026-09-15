import { NextRequest, NextResponse } from "next/server";
import { parseLookerPdf } from "@/lib/looker-pdf-parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const advertiser = String(form.get("advertiser") || "").trim();
    const reportUrl = String(form.get("reportUrl") || "").trim();
    const month = String(form.get("month") || "").trim();

    if (!(file instanceof File)) return NextResponse.json({ error: "PDF 파일이 필요합니다." }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "PDF 형식만 지원합니다." }, { status: 400 });
    if (!advertiser) return NextResponse.json({ error: "광고주 Workspace가 필요합니다." }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const result = await parseLookerPdf({ buffer, filename: file.name, advertiser, reportUrl: reportUrl || undefined, month: month || undefined });
    if (!result.bundles.length) {
      return NextResponse.json({ error: "선택한 월의 DV360 / Netflix 캠페인 페이지를 찾지 못했습니다.", ...result }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF 분석에 실패했습니다." }, { status: 500 });
  }
}
