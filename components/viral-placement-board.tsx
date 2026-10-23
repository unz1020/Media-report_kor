"use client";

import { useId, useMemo, useState } from "react";
import type { PlacementProof } from "@/lib/placement-proof";
import { viralPostInfo, type ShowroomItem } from "@/lib/placement-showroom";
import type { ProofLightboxImage } from "./proof-image-lightbox";
import styles from "./viral-placement-board.module.css";

type Props = {
  items: ShowroomItem[];
  imageUrl: (proof: PlacementProof) => string;
  onOpenImage: (image: ProofLightboxImage) => void;
};
type Post = {
  id: string;
  proof: PlacementProof;
  info: ReturnType<typeof viralPostInfo>;
};
const statuses = ["게재 확인", "확인 필요", "사전 세팅"] as const;
const dateLabel = (value: string) => value || "?";
const cafeLabel = (post: Post) => post.info.cafeName || "카페 미제공";
const titleLabel = (post: Post) => post.info.title || "게시글 제목 미제공";
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function sourcePages(proof: PlacementProof): number[] {
  const source = proof as PlacementProof & { evidence?: unknown; sourceDocument?: unknown };
  const evidence = object(source.evidence);
  const document = object(source.sourceDocument) || object(evidence?.sourceDocument);
  return [...new Set([evidence?.sourcePage, document?.sourcePage].flatMap(value =>
    (Array.isArray(value) ? value : [value]).filter((page): page is number =>
      typeof page === "number" && Number.isInteger(page) && page > 0)))].sort((a, b) => a - b);
}
function ProofThumbnail({ src, title }: { src: string; title: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <span className={styles.thumbnail}>
    {src && failedSrc !== src
      // The supplied URL is the original report page, never a cropped article screenshot.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt={`${title} · 원본 증빙 썸네일`} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      : <span className={styles.missingImage}>{src ? "증빙 이미지를 불러올 수 없습니다" : "증빙 이미지 미제공"}</span>}
    <span className={styles.thumbnailLabel}>원본 증빙 썸네일</span>
  </span>;
}
function statusClass(status: PlacementProof["status"]): string {
  return status === "게재 확인" ? styles.confirmed : status === "사전 세팅" ? styles.setup : styles.needsReview;
}

/** Read-only, scope-local projection of report evidence, not a live café feed. */
export function ViralPlacementBoard({ items, imageUrl, onOpenImage }: Props) {
  const id = useId();
  const [cafe, setCafe] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const posts = useMemo(() => items.flatMap(item => item.proofs.map((proof, index): Post => ({
    id: JSON.stringify([item.id, index, proof.key || ""]), proof, info: viralPostInfo(proof),
  }))).sort((a, b) => {
    const left = a.info.reportedPlacementDate;
    const right = b.info.reportedPlacementDate;
    if (!left) return right ? 1 : 0;
    if (!right) return -1;
    return right.localeCompare(left);
  }), [items]);
  const pendingItems = items.filter(item => !item.proofs.length);
  const cafes = useMemo(() => [...new Set(posts.map(cafeLabel))].sort((a, b) => a.localeCompare(b, "ko")), [posts]);
  const activeCafe = cafes.includes(cafe) ? cafe : "";
  const query = search.trim().normalize("NFKC").toLocaleLowerCase("ko");
  const cafeScope = posts.filter(post => (!activeCafe || cafeLabel(post) === activeCafe) && (!query ||
    [post.info.cafeName, post.info.title, post.info.topic, post.info.reportedPlacementDate, post.proof.status]
      .join(" ").normalize("NFKC").toLocaleLowerCase("ko").includes(query)));
  const visible = cafeScope.filter(post => !status || post.proof.status === status);
  const selected = visible.find(post => post.id === selectedId) || visible[0];
  const pages = selected ? sourcePages(selected.proof) : [];
  const selectedSrc = selected ? imageUrl(selected.proof) : "";
  const openProof = (post: Post) => {
    const src = imageUrl(post.proof);
    if (!src) return;
    onOpenImage({
      src,
      title: `${cafeLabel(post)} · ${titleLabel(post)}`,
      description: `원본 보고서 증빙 · 자료상 게재일 ${dateLabel(post.info.reportedPlacementDate)} · 자료상 확인일 ${dateLabel(post.info.verificationDate)} · 보고서 기준일 ${dateLabel(post.info.reportDate)} · 자료상 상태 ${post.proof.status}. 현재 게시 상태를 독립적으로 확인한 자료가 아닙니다.`,
    });
  };
  return <section className={styles.board} aria-label="바이럴 게시글 탐색">
    <header className={styles.header}>
      <div className={styles.brandMark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 4h14v12H9l-4 4V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 8h6M9 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></div>
      <div className={styles.heading}><p className={styles.eyebrow}>COMMUNITY / SOURCE ARCHIVE</p><h2>바이럴 · 카페 게시글</h2><p>카페별 게시글과 보고서 원본 증빙을 함께 살펴보세요.</p></div>
      <div className={styles.total}><strong>{posts.length}</strong><span>게시글 증빙</span></div>
    </header>
    <div className={styles.scopeNote}>선택한 쇼룸 범위의 자료입니다. 자료상 상태와 날짜이며, 현재 게시 여부를 독립적으로 확인한 결과가 아닙니다.</div>
    <div className={styles.filters}>
      <label className={styles.field} htmlFor={`${id}-cafe`}><span>카페</span><select id={`${id}-cafe`} aria-label="카페 선택" value={activeCafe} onChange={event => { setCafe(event.target.value); setSelectedId(null); }}><option value="">전체 카페 ({cafes.length})</option>{cafes.map(name => <option key={name} value={name}>{name} ({posts.filter(post => cafeLabel(post) === name).length})</option>)}</select></label>
      <label className={`${styles.field} ${styles.searchField}`} htmlFor={`${id}-search`}><span>게시글 검색</span><input id={`${id}-search`} type="search" aria-label="바이럴 게시글 검색" placeholder="카페, 제목, 주제로 검색" value={search} onChange={event => { setSearch(event.target.value); setSelectedId(null); }} /></label>
      <button type="button" className={styles.resetButton} onClick={() => { setCafe(""); setSearch(""); setStatus(""); setSelectedId(null); }}>필터 초기화</button>
    </div>
    <div className={styles.statusFilters} role="group" aria-label="자료상 상태 필터">
      <button type="button" aria-pressed={!status} onClick={() => { setStatus(""); setSelectedId(null); }}>전체 <span>{cafeScope.length}</span></button>
      {statuses.map(value => <button type="button" key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setSelectedId(null); }}>{value} <span>{cafeScope.filter(post => post.proof.status === value).length}</span></button>)}
    </div>
    <div className={styles.resultsHeading}><p aria-live="polite">게시글 증빙 <strong>{visible.length}</strong>건 · 카페 {new Set(visible.map(cafeLabel)).size}곳</p><span>자료상 게재일 최신순 · 미제공은 마지막</span></div>
    <div className={styles.workspace}>
      <div className={styles.cardGrid}>
        {visible.map(post => {
          const src = imageUrl(post.proof);
          const active = selected?.id === post.id;
          return <article className={`${styles.card} ${active ? styles.selectedCard : ""}`} key={post.id} data-viral-post-id={post.id}>
            <button type="button" className={styles.selectCard} aria-pressed={active} aria-label={`${cafeLabel(post)} · ${titleLabel(post)} · ${post.info.topic || "주제 미제공"} · 자료상 게재일 ${dateLabel(post.info.reportedPlacementDate)} · 자료상 상태 ${post.proof.status}`} onClick={() => setSelectedId(post.id)}>
              <ProofThumbnail src={src} title={titleLabel(post)} />
              <span className={styles.cardContent}><span className={styles.cardCafe}>{cafeLabel(post)}</span><span className={styles.cardTitle}>{titleLabel(post)}</span><span className={styles.topic}>{post.info.topic || "주제 미제공"}</span><span className={styles.cardMeta}><span>자료상 게재일 {dateLabel(post.info.reportedPlacementDate)}</span><span className={`${styles.badge} ${statusClass(post.proof.status)}`}>{post.proof.status}</span></span></span>
            </button>
            <footer className={styles.cardFooter}>{post.info.articleUrl ? <a href={post.info.articleUrl} target="_blank" rel="noopener noreferrer" aria-label={`${titleLabel(post)} 원문 게시글 새 창에서 열기`}>원문 게시글 ↗</a> : <span>원문 링크 미제공</span>}<button type="button" disabled={!src} onClick={() => openProof(post)} aria-label={`${titleLabel(post)} 증빙 크게 보기`}>증빙 크게 보기</button></footer>
          </article>;
        })}
        {!visible.length && <div className={styles.empty}><strong>{posts.length ? "조건에 맞는 게시글이 없습니다" : "등록된 게시글 증빙이 없습니다"}</strong><p>{posts.length ? "카페와 검색어, 상태 필터를 조정해 보세요." : "선택한 범위에 게시글 증빙이 추가되면 표시됩니다."}</p></div>}
      </div>
      <aside className={styles.detail} aria-label="바이럴 게시글 상세">
        <div className={styles.detailHeader}><span className={styles.eyebrow}>POST DETAILS</span><h3>게시글 상세</h3></div>
        {selected ? <>
          <p className={styles.detailCafe}>{cafeLabel(selected)}</p><h4 className={styles.detailTitle}>{titleLabel(selected)}</h4><p className={styles.detailTopic}>{selected.info.topic || "주제 미제공"}</p>
          <span className={`${styles.badge} ${statusClass(selected.proof.status)}`}>자료상 상태 · {selected.proof.status}</span>
          <dl className={styles.facts}>
            <div><dt>자료상 게재일</dt><dd>{dateLabel(selected.info.reportedPlacementDate)}</dd></div>
            <div><dt>자료상 확인일</dt><dd>{dateLabel(selected.info.verificationDate)}</dd></div>
            <div><dt>보고서 기준일</dt><dd>{dateLabel(selected.info.reportDate)}</dd></div>
            <div><dt>원본 자료 페이지</dt><dd>{pages.length ? pages.map(page => `${page}쪽`).join(", ") : "?"}</dd></div>
          </dl>
          <p className={styles.dateHelp}>자료상 게재일은 원본 자료에 기재된 날짜입니다. 보고서 기준일이나 확인일을 게재일로 대신하지 않습니다. ?는 미제공입니다.</p>
          <div className={styles.detailEvidence}><ProofThumbnail key={selected.id} src={selectedSrc} title={titleLabel(selected)} /><p>카페 캡처가 포함된 원본 보고서 페이지입니다. 게시글 화면만 분리한 이미지가 아닙니다.</p></div>
          <button type="button" className={styles.openEvidence} disabled={!selectedSrc} onClick={() => openProof(selected)} aria-label={`${titleLabel(selected)} 원본 증빙 크게 보기`}>원본 증빙 크게 보기</button>
          {selected.info.articleUrl ? <a className={styles.originalLink} href={selected.info.articleUrl} target="_blank" rel="noopener noreferrer">원문 게시글 새 창에서 열기 ↗</a> : <p className={styles.unavailable}>원문 링크 미제공</p>}
          <p className={styles.verificationNote}>캡처와 상태는 원본 자료 기준입니다. 현재 게시 여부, 수정·삭제 여부는 별도로 확인하지 않았습니다.</p>
          <details className={styles.sourceDetails} key={selected.id}><summary>자료 요약 보기</summary><p>{selected.proof.sourceSummary?.trim() || "자료 요약 미제공"}</p></details>
        </> : <p className={styles.unavailable}>표시할 게시글이 없습니다.</p>}
      </aside>
    </div>
    {pendingItems.length > 0 && <section className={styles.pending} aria-label="바이럴 증빙 미연결 항목">
      <h3>게재 증빙 연결 전 항목 {pendingItems.length}개</h3>
      <p>게시글 필터와 별도인 운영안·성과입니다. 등록된 게시글이나 실제 게재 확인을 뜻하지 않습니다.</p>
      <div className={styles.pendingGrid}>{pendingItems.map(item => <article className={styles.pendingCard} key={item.id} data-viral-pending-id={item.id}>
        <span className={styles.pendingBadge}>게재 증빙 미연결</span><h4>{item.title}</h4><p>{item.media}</p>
        {item.plans.length > 0 && <section aria-label="증빙 미연결 운영안"><h5>운영안</h5>{item.plans.map((plan,index) => <dl key={index} className={styles.pendingFacts}>
          <div><dt>계획 기간</dt><dd>{plan.periodStart || "?"} ~ {plan.periodEnd || "?"}</dd></div>
          <div><dt>계획 예산</dt><dd>{sourceValue(plan.budget, true)}</dd></div>
        </dl>)}</section>}
        {item.metrics.length > 0 && <section aria-label="증빙 미연결 성과"><h5>연결된 성과 · 게재 증빙 아님</h5>{item.metrics.map((row,index) => <dl key={index} className={styles.pendingFacts}>
          <div><dt>보고서 기준일</dt><dd>{row.reportDate || "?"}</dd></div><div><dt>집행액</dt><dd>{sourceValue(row.spend, true)}</dd></div>
          <div><dt>노출</dt><dd>{sourceValue(row.impressions)}</dd></div><div><dt>클릭</dt><dd>{sourceValue(row.clicks)}</dd></div>
        </dl>)}</section>}
      </article>)}</div>
    </section>}
  </section>;
}
function sourceValue(value: number | null | undefined, currency = false): string {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("ko-KR").format(value) + (currency ? "원" : "") : "?";
}
