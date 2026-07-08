# MVP 제작 요청

_Started 2026-07-07 14:51 UTC_

---

## User

"기능명세서_2026-07-07.md"와 디자인 시스템 "design-notion.md" 파일에 기반하여 동작하는 MVP를 제작해.

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: read_file]_

_[tool: eval_js_user_view]_

_[tool: write_file]_

_[tool: show_to_user]_

_[tool: eval_js_user_view]_

_[tool: eval_js_user_view]_

_[tool: dc_write]_

_[tool: delete_file]_

_[tool: ready_for_verification]_

기능명세서 기반 MVP **언제볼까 MVP.dc.html**을 완성했습니다 (Notion 디자인 시스템 적용).

- **생성자 플로우**: 투표 생성 폼(종류·목적·날짜·시간대·소요시간, 유효성 검사) → 고유 링크 생성·복사
- **참석자 플로우**: 이름 입력(중복 검사) → 드래그로 '가장 좋은 시간'/'가능하지만 비선호' 표시(터치 지원, 타인 응답 숨김, 미표시=불가능)
- **결과**: 히트맵 + 호버/탭 상세(가능·비선호·불가능 명단), 비선호 주의 안내, 필수 참석자 지정 반영한 추천 시간 1~3순위 → 확정 시 근거 요약 메시지 자동 생성·수정·복사

데이터는 브라우저에 저장되며, "데모 응답 7명 채우기" 버튼으로 결과 화면을 바로 체험할 수 있습니다. Tweaks에서 블록 단위(30/60분)와 히트맵 색상 스케일을 바꿀 수 있어요.

