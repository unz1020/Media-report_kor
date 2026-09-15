import { CreativeGallery } from "@/components/creative-gallery";

export default function CreativePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Creative & placement</div>
          <h1 className="page-title">소재 · 게재지면</h1>
          <p className="page-desc">원본 소재보다 실제 노출 형태를 우선으로 보고, 디지털과 ATL을 같은 흐름에서 확인합니다.</p>
        </div>
        <div className="page-meta"><span className="badge live">24 LIVE</span><span className="badge review">3 확인 필요</span></div>
      </div>
      <CreativeGallery />
    </>
  );
}
