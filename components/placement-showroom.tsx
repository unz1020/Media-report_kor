"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import type { PlacementProof } from "@/lib/placement-proof";
import type { MediaPlanFact } from "@/lib/daily-report-parser";
import type { ReportingRow } from "@/lib/reporting-data";
import { buildShowroomItems, showroomEvidenceFor, type ShowroomEnvironment, type ShowroomSurface, type ShowroomItem } from "@/lib/placement-showroom";
import { CreativeUrlPreview } from "./creative-url-preview";
import type { ProofLightboxImage } from "./proof-image-lightbox";
import { safeHttpUrl } from "@/lib/placement-urls";
import styles from "./placement-showroom.module.css";

type Props = {
  proofs: PlacementProof[];
  plans: MediaPlanFact[];
  rows: ReportingRow[];
  onOpenImage: (image: ProofLightboxImage) => void;
};
type PhotoMetadata = { type?: string; layout?: string; sourcePage?: number[]; sourcePhotos?: { page: number; site: string; photoDate?: string }[] };
type ExtraMetrics = ReportingRow & { footTraffic?: number | null; metricLabel?: string; spendLabel?: string };
const environments = [
  { id: "ooh", label: "OOH·공간매체", sub: "옥외 · 영화관 · 생활공간", number: "01" },
  { id: "tv", label: "TV·OTT", sub: "채널 · 프로그램 · 소재", number: "02" },
  { id: "digital", label: "디지털 앱·웹", sub: "앱 · 기기 · 광고 지면", number: "03" },
] as const;
const surfaceLabels: Record<ShowroomSurface, string> = {
  outdoor: "옥외 LED·로드블럭", cinema: "영화관", elevator: "엘리베이터·생활공간", transit: "교통", broadcast: "TV 방송", ott: "OTT", mobile: "모바일", desktop: "PC", mixed: "복수 기기", unknown: "환경 미지정",
};
function imageUrl(proof?: PlacementProof) {
  if (!proof) return "";
  if (proof.manualImagePath) return `/api/reporting/proof-image?${new URLSearchParams({ advertiser: proof.advertiser, path: proof.manualImagePath })}`;
  const image = proof.attachments.find(file => file.kind === "image");
  return image ? `/api/gmail/attachment?${new URLSearchParams({ messageId: proof.messageId, attachmentId: image.attachmentId, filename: image.filename, mimeType: image.mimeType || "image/jpeg" })}` : "";
}
function safeUrl(url = "") { try { return safeHttpUrl(url); } catch { return ""; } }
function valueText(value: number | null | undefined, won = false) {
  return value === null || value === undefined || !Number.isFinite(value) ? "미제공" : `${Math.round(value).toLocaleString("ko-KR")}${won ? "원" : ""}`;
}
function MapScene() {
  return <svg className={styles.cityMap} viewBox="0 0 720 390" role="img" aria-label="서울권 공간 탐색용 아이소메트릭 개념도. 실제 설치 위치나 커버리지를 표시하지 않습니다.">
    <defs><linearGradient id="showroom-land" x2="0" y2="1"><stop stopColor="#f4f2fb"/><stop offset="1" stopColor="#e5e5f0"/></linearGradient></defs>
    <path d="M46 161 393 35 681 220 331 365Z" fill="#d9dce9"/><path d="M46 150 393 24 681 209 331 354Z" fill="url(#showroom-land)" stroke="#d0d1e1"/>
    <g stroke="#fff" strokeWidth="2" opacity=".9"><path d="m113 126 281 182M184 101l281 181M253 76l281 181M323 51l281 181M104 188 450 61M162 225 508 99M218 262 566 137M276 300 624 174"/></g>
    <path d="M83 189C192 117 250 205 335 195S492 139 628 235" fill="none" stroke="#b7c8e6" strokeWidth="27"/>
    <g stroke="#a9abc3" strokeWidth="1.3" strokeLinejoin="round">
      <path d="m175 114 35-13 29 19-35 14z" fill="#fff"/><path d="M175 114V72l35-13v42M210 59l29 19v42M175 72l29 19 35-13M204 91v43" fill="#e1e2ed"/>
      <path d="m301 101 39-14 32 21-39 14z" fill="#fff"/><path d="M301 101V38l39-14v63M340 24l32 21v63M301 38l32 21 39-14M333 59v63" fill="#d7d8e7"/>
      <path d="m445 179 39-14 32 21-39 14z" fill="#fff"/><path d="M445 179v-56l39-14v56M484 109l32 21v56M445 123l32 21 39-14M477 144v56" fill="#dcdeec"/>
      <path d="m270 271 35-13 29 19-35 14z" fill="#fff"/><path d="M270 271v-41l35-13v41M305 217l29 19v41M270 230l29 19 35-13M299 249v42" fill="#d6d9e9"/>
    </g><text x="370" y="210" fill="#657a9d" fontSize="12" transform="rotate(-20 370 210)">한강 · 개념 표현</text>
  </svg>;
}
/** Crop only an explicitly documented, two-column contact sheet. Original asset is never changed. */
function EvidenceImage({ proof, page, title }: { proof: PlacementProof; page?: number; title: string }) {
  const [ratio, setRatio] = useState(0);
  const [failed, setFailed] = useState(false);
  const meta = (proof as PlacementProof & { evidence?: PhotoMetadata }).evidence;
  const pages = meta?.sourcePage;
  const rows = Math.ceil((pages?.length || 0) / 2);
  const index = page === undefined ? -1 : pages?.indexOf(page) ?? -1;
  const crop = Boolean(index >= 0 && rows > 0 && meta?.type === "contact_sheet_of_original_report_photo_pages" && /^원본 p\d+(?:,p\d+)?(?: \/ p\d+(?:,p\d+)?)+ 순서/.test(meta?.layout || "") && Math.abs(ratio - (2 * 16 / (rows * 9))) < .01);
  const src = imageUrl(proof);
  if (!src || failed) return <div className={styles.noImage}>이미지 연결을 확인해주세요.<small>하단 관리·원본 자료에서 확인할 수 있습니다.</small></div>;
  return <div className={crop ? styles.croppedImage : styles.fullImage}>
    <img src={src} alt={`${title}${page ? ` · 원본 ${page}쪽` : ""} 게재 증빙`} draggable={false}
      style={crop ? { width: "200%", maxWidth: "none", height: "auto", position: "absolute", left: `${-(index % 2) * 100}%`, top: `${-Math.floor(index / 2) * 100}%` } : undefined}
      onLoad={event => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} onError={() => setFailed(true)} />
  </div>;
}
function EmptyScreen({ selected }: { selected?: ShowroomItem }) {
  return <div className={styles.noImage}><span className={styles.screenLabel}>{selected?.media || "PLACEMENT SHOWROOM"}</span><strong>{selected?.title || "지면을 선택하세요"}</strong><small>게재 이미지·영상 연결 대기<br/>현재 송출 화면이 아닙니다.</small></div>;
}
export function PlacementShowroom({ proofs, plans, rows, onOpenImage }: Props) {
  const items = useMemo(() => buildShowroomItems(proofs, plans, rows), [proofs, plans, rows]);
  const [environment, setEnvironment] = useState<ShowroomEnvironment>("ooh");
  const [surface, setSurface] = useState<ShowroomSurface | "all">("all");
  const [media, setMedia] = useState("전체");
  const [selectedId, setSelectedId] = useState("");
  const [proofIndex, setProofIndex] = useState(0);
  const [photoPage, setPhotoPage] = useState<number | undefined>();
  const [appOpen, setAppOpen] = useState(false);
  const [deviceOverride, setDeviceOverride] = useState<"mobile" | "desktop" | null>(null);
  const inEnvironment = items.filter(item => item.environment === environment);
  const filteredSurface = inEnvironment.filter(item => surface === "all" || item.surface === surface);
  const medias = Array.from(new Set(filteredSurface.map(item => item.media)));
  const visible = filteredSurface.filter(item => media === "전체" || item.media === media);
  const selected = visible.find(item => item.id === selectedId) || visible[0];
  const selectedProof = selected?.proofs[Math.min(proofIndex, Math.max(0, selected.proofs.length - 1))];
  const metadata = (selectedProof as (PlacementProof & { evidence?: PhotoMetadata }) | undefined)?.evidence;
  const selectedEvidence = showroomEvidenceFor(selected, selectedProof);
  const availablePages = selectedEvidence.pages;
  const activePage = availablePages.includes(photoPage || -1) ? photoPage : availablePages[0];
  const selectedPhoto = metadata?.sourcePhotos?.find(photo => photo.page === activePage);
  const date = selectedPhoto?.photoDate || selectedEvidence.date;
  const unclassified = items.filter(item => item.environment === "unclassified");
  const packageSelected = Boolean(selected?.packageName);
  const digitalDevice = deviceOverride || (selected?.surface === "desktop" ? "desktop" : "mobile");
  const surfaces: ShowroomSurface[] = environment === "ooh" ? ["outdoor", "cinema", "elevator", "transit", "unknown"] : environment === "tv" ? ["broadcast", "ott"] : ["mobile", "desktop", "mixed", "unknown"];
  function chooseEnvironment(next: ShowroomEnvironment) { setEnvironment(next); setSurface("all"); setMedia("전체"); setSelectedId(""); setProofIndex(0); setPhotoPage(undefined); setAppOpen(false); setDeviceOverride(null); }
  function chooseItem(item: ShowroomItem) { setSelectedId(item.id); setProofIndex(0); setPhotoPage(undefined); setDeviceOverride(null); }
  function chooseMedia(next: string) { setMedia(next); setSelectedId(""); setProofIndex(0); setPhotoPage(undefined); setDeviceOverride(null); if (environment === "digital") setAppOpen(true); }
  function tabsKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + direction + 3) % 3;
    chooseEnvironment(environments[next].id); document.getElementById(`showroom-tab-${environments[next].id}`)?.focus();
  }
  function openProof() {
    if (!selectedProof || !imageUrl(selectedProof)) return;
    onOpenImage({ src: imageUrl(selectedProof), title: [selected?.media, selected?.title, selectedProof.creativeName].filter(Boolean).join(" · "), description: `${selectedProof.status}${date ? ` · 자료상 확인일 ${date}` : ""}${activePage ? ` · 선택 페이지 ${activePage}쪽 · 원본 합본 전체 표시` : ""}` });
  }
  const visual = selectedProof && imageUrl(selectedProof) ? <EvidenceImage key={`${selected?.id}:${selectedProof.key || selectedProof.manualImagePath}:${activePage || "full"}`} proof={selectedProof} page={activePage} title={selected?.title || ""} /> : <EmptyScreen selected={selected} />;
  const screen = <button type="button" className={styles.screenButton} onClick={openProof} disabled={!selectedProof || !imageUrl(selectedProof)} aria-label={`${selected?.title || "지면"} 증빙 원본 크게 보기`}>{visual}{selectedProof && imageUrl(selectedProof) && <span className={styles.zoomHint}>원본 확대</span>}</button>;

  return <section className={styles.showroom} aria-label="게재지면 쇼룸">
    <header className={styles.heading}><div><span className={styles.eyebrow}>PLACEMENT SHOWROOM</span><h2>광고가 보이는 곳에서 시작하세요.</h2><p>공간, 채널, 앱을 고르면 해당 지면의 소재와 게재 증빙이 연결됩니다.</p></div><div className={styles.sourceCount}><strong>{proofs.length}</strong><span>등록 자료<br/>원본 기준 · 중복 집계 없음</span></div></header>
    <div className={styles.environmentTabs} role="tablist" aria-label="게재 환경">
      {environments.map((tab, index) => <button key={tab.id} id={`showroom-tab-${tab.id}`} type="button" role="tab" aria-selected={environment === tab.id} aria-controls="showroom-panel" tabIndex={environment === tab.id ? 0 : -1} className={environment === tab.id ? styles.environmentActive : styles.environmentTab} onClick={() => chooseEnvironment(tab.id)} onKeyDown={event => tabsKey(event, index)}><span>{tab.number}</span><div><strong>{tab.label}</strong><small>{tab.sub}</small></div><b>{items.filter(item => item.environment === tab.id).length}</b></button>)}
    </div>
    <div id="showroom-panel" role="tabpanel" aria-labelledby={`showroom-tab-${environment}`}>
      <div className={styles.filters} aria-label="노출 환경 세부 필터"><button type="button" aria-pressed={surface === "all"} onClick={() => { setSurface("all"); setMedia("전체"); }}>전체</button>{surfaces.map(kind => <button type="button" key={kind} aria-pressed={surface === kind} onClick={() => { setSurface(kind); setMedia("전체"); setProofIndex(0); setPhotoPage(undefined); setDeviceOverride(null); }}>{kind === "unknown" && environment === "ooh" ? "패키지·환경 미지정" : surfaceLabels[kind]} <span>{inEnvironment.filter(item => item.surface === kind).length}</span></button>)}</div>
      <div className={styles.explorer}>
        <div className={styles.experience}>
          {environment !== "digital" && <div className={styles.mediaRail} aria-label="매체·채널 선택"><button type="button" aria-pressed={media === "전체"} onClick={() => chooseMedia("전체")}>전체 매체</button>{medias.map(name => <button type="button" key={name} aria-pressed={media === name} onClick={() => chooseMedia(name)}>{name}</button>)}</div>}
          {environment === "ooh" && <div className={styles.spatialStage}>
            {(!selected || selected.surface === "outdoor" || selected.surface === "unknown") && <><MapScene/><div className={styles.mapLegend}>SEOUL · 공간 탐색 개념도<span>좌표·설치망·노선의 실측 지도가 아닙니다.</span></div><div className={styles.billboard}><div className={styles.billboardLabel}>{selected?.locationLabel || selected?.media || "옥외 지면"}</div>{screen}<div className={styles.billboardFeet}/></div></>}
            {selected?.surface === "cinema" && <div className={styles.cinema}><div className={styles.sceneKicker}>CINEMA · 영화관 스크린</div><div className={styles.cinemaScreen}>{screen}</div><div className={styles.cinemaSeats} aria-hidden="true">{Array.from({length: 18}, (_, index) => <i key={index}/>)}</div></div>}
            {selected?.surface === "elevator" && <div className={styles.elevator}><div className={styles.sceneKicker}>LIVING SPACE · 엘리베이터·생활공간</div><div className={styles.elevatorDoors}><span>엘리베이터</span><div className={styles.floorNumber}>12</div></div><div className={styles.elevatorScreen}>{screen}</div></div>}
            {selected?.surface === "transit" && <div className={styles.transit}><div className={styles.sceneKicker}>TRANSIT · 교통 매체</div><div className={styles.busWindows}><i/><i/><i/></div><div className={styles.transitScreen}>{screen}</div><div className={styles.transitSeats} aria-hidden="true"><i/><i/><i/></div></div>}
          </div>}
          {environment === "tv" && <div className={styles.televisionStage}><div className={styles.sceneKicker}>{selected?.surface === "ott" ? "OTT · 등록 증빙" : "TELEVISION · 채널 탐색"}</div><div className={styles.television}>{screen}<span className={styles.tvBrand}>{selected?.media || "TV·OTT"}</span></div><div className={styles.televisionStand}/><p>등록된 소재·게재 증빙을 보여줍니다. 실시간 방송이나 현재 광고 송출이 아닙니다.</p></div>}
          {environment === "digital" && <div className={styles.digitalStage}><div className={styles.deviceBar}><span>앱·매체를 선택해 지면 탐색</span><div><button type="button" aria-pressed={digitalDevice === "mobile"} onClick={() => setDeviceOverride("mobile")}>휴대폰</button><button type="button" aria-pressed={digitalDevice === "desktop"} onClick={() => setDeviceOverride("desktop")}>PC</button></div></div>
            <div className={digitalDevice === "desktop" ? styles.desktop : styles.phone}><div className={styles.deviceHeader}><strong>{appOpen ? selected?.media || "앱·웹" : "앱·매체 선택"}</strong><button type="button" onClick={() => { setAppOpen(false); setMedia("전체"); setSelectedId(""); }}>홈</button></div>{!appOpen ? <div className={styles.appGrid}>{medias.map((name,index) => <button type="button" key={name} onClick={() => chooseMedia(name)}><span aria-hidden="true" data-tone={index % 4}>{name.slice(0,2)}</span><small>{name}</small></button>)}{!medias.length && <p>연결된 앱·매체가 없습니다.</p>}</div> : <><div className={styles.appCaption}>{selected?.title || "지면 선택"}</div><div className={styles.appScreen}>{screen}</div></>}</div>
            <p className={styles.simulationNote}>실제 앱 실행이 아닌 탐색용 목업입니다.{selected?.surface === "mixed" || selected?.surface === "unknown" ? " 기기별 구분이 없으면 목업 선택이 실제 노출 기기를 뜻하지 않습니다." : " 원본의 기기 구분과 비율은 별도로 유지합니다."}</p>
            {appOpen && <div className={styles.mediaRail} aria-label="앱·매체 전환">{medias.map(name => <button key={name} type="button" aria-pressed={media === name} onClick={() => chooseMedia(name)}>{name}</button>)}</div>}
          </div>}
          <div className={styles.inventoryList} aria-label="지면 선택"><div className={styles.inventoryHead}><strong>지면 선택</strong><span>{visible.length}개 탐색 항목 · 캠페인 수 아님</span></div>{visible.length ? visible.map(item => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => { chooseItem(item); if(environment === "digital")setAppOpen(true); }}><span className={styles.inventoryIcon} aria-hidden="true">{item.surface === "cinema" ? "C" : item.surface === "outdoor" ? "O" : item.surface === "elevator" ? "E" : item.surface === "transit" ? "T" : item.media.slice(0,1)}</span><span><small>{item.media}{item.service ? " · 서비스" : ""}</small><strong>{item.title}</strong></span><b>{item.proofs.length ? "증빙" : item.plans.length ? "운영안" : "성과"}</b></button>) : <div className={styles.empty}>이 환경에 연결된 지면이 없습니다.<br/>하단 관리·원본 자료에서 기존 자료를 확인할 수 있습니다.</div>}</div>
        </div>
        <aside className={styles.detail} aria-label="선택 지면 상세" aria-live="polite">
          {selected ? <><div className={styles.detailEyebrow}>{surfaceLabels[selected.surface]}{selected.service && <span className={styles.serviceBadge}>서비스 지면</span>}</div><h3>{selected.title}</h3><p className={styles.mediaName}>{selected.media}</p>{packageSelected && <div className={styles.packageNote}><strong>{selected.packageName}</strong><p>하나의 구매 패키지에 속한 지면입니다. 장소·증빙 페이지를 별도 캠페인으로 합산하지 않습니다.</p></div>}
            <dl className={styles.facts}><div><dt>게재 증빙</dt><dd>{selectedProof?.status || "증빙 미연결"}</dd></div><div><dt>자료상 확인일</dt><dd>{date || "미제공"}</dd></div><div><dt>운영 기간</dt><dd>{selectedProof?.periodStart || selected.plans[0]?.periodStart || "미제공"} ~ {selectedProof?.periodEnd || selected.plans[0]?.periodEnd || "미제공"}</dd></div><div><dt>{environment === "ooh" ? "원본 위치·지면" : environment === "tv" ? "채널·플랫폼" : "원본 기기 구분"}</dt><dd>{environment === "ooh" ? selected.locationLabel || "상세 위치 미등록" : environment === "tv" ? selected.media : selected.surface === "unknown" ? "기기별 구분 미제공" : surfaceLabels[selected.surface]}</dd></div>{activePage && <div><dt>선택한 증빙</dt><dd>원본 {activePage}쪽{selectedPhoto?.site ? ` · ${selectedPhoto.site}` : ""}</dd></div>}</dl>
            {selected.proofs.length > 0 && <div className={styles.creativeSelector}><strong>소재·증빙 선택</strong><div>{selected.proofs.map((proof,index) => <button type="button" key={proof.key || proof.manualImagePath || index} aria-pressed={proof === selectedProof} onClick={() => {setProofIndex(index);setPhotoPage(undefined);}}>{proof.creativeName || `증빙 ${index + 1}`}</button>)}</div></div>}
            {availablePages.length > 1 && <div className={styles.pageSelector} aria-label="증빙 페이지 선택">{availablePages.map(page => <button type="button" key={page} aria-pressed={activePage === page} onClick={() => setPhotoPage(page)}>원본 {page}쪽</button>)}</div>}
            {selectedProof && imageUrl(selectedProof) && <button type="button" className={styles.openOriginal} onClick={openProof}>게재 증빙 원본 크게 보기 <span aria-hidden="true">↗</span></button>}
            <section className={styles.metrics}><div className={styles.metricsHead}><h4>연결된 성과</h4><span>지면 기준 · 임의 배분 없음</span></div>{selected.metrics.length ? selected.metrics.map((raw,index) => {const row=raw as ExtraMetrics;return <div className={styles.metricRecord} key={`${row.sourceFile}:${row.placement}:${index}`}><p>{row.placement}<span>{row.reportDate} 기준</span></p><dl><div><dt>{row.spendLabel || (selected.service ? "원본 서비스 비용 참고값" : "집행액")}</dt><dd>{valueText(row.spend,true)}</dd></div><div><dt>{row.metricLabel || (environment === "ooh" ? "원본 Impression" : "노출")}</dt><dd>{valueText(row.impressions)}</dd></div>{environment !== "ooh" && <div><dt>클릭</dt><dd>{valueText(row.clicks)}</dd></div>}{row.footTraffic !== undefined && <div><dt>유동인구</dt><dd>{valueText(row.footTraffic)}</dd></div>}</dl></div>;}) : <div className={styles.metricsMissing}>이 지면의 개별 성과는 아직 연결되지 않았습니다.<br/>패키지·매체 합계를 이 지면의 성과로 대신 표시하지 않습니다.</div>}{environment === "ooh" && <p className={styles.metricNote}>원본 Impression·송출 횟수·유동인구는 서로 다른 지표입니다. 서비스 지면은 유료 지면의 집행액과 중복 가산하지 않습니다.</p>}</section>
            {selectedProof?.previewUrl && <CreativeUrlPreview compact url={selectedProof.previewUrl} label="등록 매체 미리보기"/>}{selected.plans.map((plan,index) => safeUrl(plan.creativeUrl || plan.previewUrl) ? <CreativeUrlPreview key={`${plan.rowId || index}:${plan.creativeUrl || plan.previewUrl}`} compact url={plan.creativeUrl || plan.previewUrl} label={plan.creativeName || "등록 소재"}/> : null)}
            {selectedProof?.sourceSummary && <details className={styles.evidenceNotes}><summary>증빙 기준·검수 메모</summary><p>{selectedProof.sourceSummary}</p></details>}
            <p className={styles.historicalNote}>게재 상태와 확인일은 원본 자료에 기록된 기준입니다. 현재 실게재 재확인이나 실시간 송출을 뜻하지 않습니다.</p>
          </> : <div className={styles.empty}>지면을 선택하면 소재, 증빙, 연결된 성과를 확인할 수 있습니다.</div>}
        </aside>
      </div>
    </div>
    {unclassified.length > 0 && <details className={styles.unclassified}><summary>환경 분류 확인이 필요한 항목 {unclassified.length}개</summary><ul>{unclassified.map(item => <li key={item.id}>{item.media} · {item.title}</li>)}</ul><p>알 수 없는 지면을 디지털·TV로 임의 분류하지 않습니다. 원본 자료는 하단에서 계속 확인할 수 있습니다.</p></details>}
  </section>;
}
