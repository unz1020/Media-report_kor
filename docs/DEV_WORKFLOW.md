# DEVELOPMENT WORKFLOW

## Source of truth
GitHub `unz1020/Media-report_kor`가 코드의 Single Source of Truth입니다.

## Branches
- `main`: 검수 완료된 기준 버전 / Production 대상
- `dev`: 다음 Preview 버전
- 필요 시 `feature/*`: 큰 기능 단위 작업

## Work cycle
1. ChatGPT에서 요구사항/수정 방향 결정
2. `dev` 또는 feature branch에 구현
3. GitHub Actions에서 Next.js build 검증
4. Vercel Preview에서 UI/동작 확인
5. 사용자 승인
6. `main` 반영

## Multi-PC rule
어느 컴퓨터에서 지시하더라도 로컬 파일을 기준으로 삼지 않고 GitHub 최신 `dev`를 기준으로 작업합니다.

## UI gate
기능 구현 전에 다음 조건을 만족해야 합니다.
- 디자인 토큰/UI_GUIDE 준수
- Desktop + mobile responsive
- Overview / Performance / Creative & Placement / Reports 간 시각 일관성
- Client View에 내부 정보 노출 없음

## Security rule
- 실제 광고주 Excel/게재보고/소재는 Public repo에 절대 커밋하지 않음
- `.env*`, Supabase key, Vercel token 등 비밀값 커밋 금지
- 실제 데이터 연결 전 repository를 Private로 전환
- 실제 원본 파일은 향후 Storage에 저장하고 DB에는 참조/메타데이터만 저장

## Current stage
v0.1 UI Shell
- Mock data only
- Excel parser 미연결
- DB/Auth 미연결
- API 미연결
