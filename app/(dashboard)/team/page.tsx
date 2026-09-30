"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useWorkspace } from "@/components/workspace-context";
import styles from "./team.module.css";

type Member = { email: string; display_name: string; role: string; is_active: boolean; last_seen_at?: string;
  memberships: { advertiser_id: string; access_level: string }[] };
type Activity = { id: string; actor_email: string; action: string; created_at: string; detail: { sourceFile?: string; reportDate?: string } };
const errors: Record<string,string> = { TEAM_ADMIN_REQUIRED: "관리자만 팀 계정을 변경할 수 있습니다.", SELF_CHANGE_DENIED: "본인 권한은 변경할 수 없습니다.", ADMIN_CHANGE_DENIED: "관리자 계정은 이 화면에서 변경할 수 없습니다.", INVALID_EMAIL: "이메일 주소를 확인해주세요.", ADVERTISER_ACCESS_DENIED: "담당 광고주를 선택해주세요.", WORKSPACE_ACCESS_DENIED: "계정 접근이 해제됐습니다." };
async function request(body: Record<string,unknown>) {
  const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(errors[result.error] || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
  return result;
}
const dateLabel = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
export default function TeamPage() {
  const { session } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [access, setAccess] = useState("editor");
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [revokeEmail, setRevokeEmail] = useState("");
  const isAdmin = session?.user.role === "admin";
  const reload = useCallback(async () => {
    try {
      const [team, history] = await Promise.all([isAdmin ? request({ action: "list_members" }) : Promise.resolve({ members: [] }), request({ action: "activity" })]);
      setMembers(team.members); setActivity(history.activity); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "팀 정보를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [isAdmin]);
  useEffect(() => { void reload(); }, [reload]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(""); setError("");
    try {
      await request({ action: "save_member", email, displayName: name, accessLevel: access, advertiserIds: ids });
      setNotice("팀 계정을 등록했습니다. 아래 접속 링크를 동료에게 전달하세요.");
      setEmail(""); setName(""); setIds([]); setEditing(false); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "등록 실패"); }
    finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setError("");
    try { await request({ action: "revoke_member", email: revokeEmail }); setRevokeEmail(""); setNotice("계정 접근을 해제했습니다. 저장된 리포트는 유지됩니다."); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "해제 실패"); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-head"><div><h1 className="page-title">팀 관리</h1><p className="page-desc">각자의 Google 계정으로 로그인하고, 담당 광고주의 리포트를 함께 관리합니다.</p></div><button className="btn" onClick={() => void reload()} disabled={busy}>새로고침</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section className={styles.card}><h2>내 계정</h2><p>{session?.user.display_name} · {session?.user.email}</p><p>Gmail에서 가져온 자료는 검수 후 팀 DB에 저장됩니다. 동료는 저장된 자료를 확인하며, 메일 수집이 필요한 사람만 본인의 Gmail을 연결합니다.</p><a className="btn" href="/api/gmail/connect">내 Gmail 연결 · 계정 선택</a></section>
    {isAdmin ? <div className={styles.grid}>
      <form className={styles.card} onSubmit={save}><h2>{editing ? "팀 계정 수정" : "동료 계정 추가"}</h2>
        <label>Google 계정 이메일<input type="email" required value={email} disabled={editing} onChange={e => setEmail(e.target.value)} placeholder="colleague@gmail.com" /></label>
        <label>표시 이름<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>관리 권한<select value={access} onChange={e => setAccess(e.target.value)}><option value="editor">편집 가능 · 자료 업로드 및 반영</option><option value="viewer">조회만 · 리포트 확인</option></select></label>
        <fieldset><legend>담당 광고주</legend>{session?.advertisers.filter(a => a.accessLevel === "owner").map(a => <label className={styles.check} key={a.id}><input type="checkbox" checked={ids.includes(a.id)} onChange={e => setIds(old => e.target.checked ? [...old,a.id] : old.filter(id => id !== a.id))} />{a.name}</label>)}</fieldset>
        <button className="btn primary" disabled={busy || !ids.length}>{busy ? "저장 중…" : editing ? "권한 저장" : "팀 계정 등록"}</button>
        {editing && <button className="btn" type="button" onClick={() => { setEditing(false); setEmail(""); setName(""); setIds([]); }}>취소</button>}
      </form>
      <section className={styles.card}><h2>동료 접속 방법</h2><ol><li>관리자가 이메일·담당 광고주·권한을 등록합니다.</li><li>아래 링크를 동료에게 전달합니다.</li><li>동료가 등록된 Google 계정으로 로그인합니다.</li></ol><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + "/overview"); setNotice("접속 링크를 복사했습니다."); } catch { setError("링크를 복사하지 못했습니다. 브라우저 주소를 직접 복사해주세요."); } }}>접속 링크 복사</button><p>메일 수집이 필요하면 Gmail을 추가로 연결하세요. Google 앱이 테스트 상태라면 해당 이메일을 Google OAuth 테스트 사용자에도 추가해야 합니다.</p></section>
    </div> : <section className={styles.card}><p>동료 추가와 권한 변경은 관리자에게 요청하세요.</p></section>}
    {isAdmin && <section className={styles.card}><h2>팀 계정 {members.length}개</h2>{loading ? <p>불러오는 중…</p> : <div className={styles.tableWrap}><table><thead><tr><th>이름 · 이메일</th><th>담당 광고주</th><th>상태</th><th>최근 접속</th><th>관리</th></tr></thead><tbody>{members.map(member => <tr key={member.email}>
      <td><strong>{member.display_name || member.email}</strong><br/>{member.email}</td><td>{member.memberships.map(m => <div key={m.advertiser_id}>{session?.advertisers.find(a => a.id === m.advertiser_id)?.name || "광고주"} · {m.access_level === "owner" ? "관리자" : m.access_level === "editor" ? "편집" : "조회"}</div>)}</td><td>{member.is_active ? member.last_seen_at ? "활성" : "접속 대기" : "접근 해제"}</td><td>{member.last_seen_at ? dateLabel(member.last_seen_at) : "—"}</td><td>{member.role === "admin" ? "관리자" : <div className={styles.actions}><button className="btn" disabled={busy} onClick={() => { setEmail(member.email); setName(member.display_name || ""); setAccess(member.memberships.some(m => m.access_level === "editor") ? "editor" : "viewer"); setIds(member.memberships.map(m => m.advertiser_id)); setEditing(true); window.scrollTo({ top:0, behavior:"smooth" }); }}>{member.is_active ? "수정" : "재등록"}</button>{member.is_active && <button className="btn" disabled={busy} onClick={() => setRevokeEmail(member.email)}>접근 해제</button>}</div>}</td>
    </tr>)}</tbody></table></div>}</section>}
    {revokeEmail && <section className={styles.card} role="alert"><p>{revokeEmail} 계정의 접근을 해제할까요?</p><button className="btn primary" disabled={busy} onClick={() => void revoke()}>접근 해제</button><button className="btn" disabled={busy} onClick={() => setRevokeEmail("")}>취소</button></section>}
    <section className={styles.card}><h2>최근 공동 작업</h2>{activity.length ? <ul className={styles.history}>{activity.map(item => <li key={item.id}><strong>{item.action === "report_published" ? "리포트 반영" : "인사이트 반영"} · {item.detail.reportDate}</strong><span>{item.detail.sourceFile}</span><span>{item.actor_email} · {dateLabel(item.created_at)}</span></li>)}</ul> : <p>앞으로 반영하는 리포트와 인사이트의 작업자가 여기에 기록됩니다.</p>}</section>
  </>;
}
