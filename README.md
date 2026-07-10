# moizyo — 모임 시간 조율 도구

타임테이블 기반 히트맵을 활용한 모임 시간 조율 MVP. 투표를 만들어 링크를 공유하면,
참석자들은 서로의 응답을 보지 못한 채 각자 가능한 시간을 표시하고, 히트맵과
추천 시간 후보를 바탕으로 최종 모임 시간을 확정합니다.

## 구조

- `server/` — Express + SQLite API. 투표/응답 데이터를 저장해 참석자별로 다른 기기에서도
  같은 링크로 접속할 수 있게 합니다.
- `client/` — React + TypeScript + Vite 프런트엔드.
- `project/`, `chats/` — Claude Design에서 내보낸 원본 디자인 프로토타입(참고용, 실행 대상 아님).

## 실행 방법

두 개의 터미널에서 각각 실행합니다.

```bash
cd server
npm install
npm run dev      # http://localhost:8787
```

```bash
cd client
npm install
npm run dev       # http://localhost:5173 (개발 서버가 /api를 8787로 프록시)
```

브라우저에서 `http://localhost:5173`을 엽니다.

## 프로덕션 빌드

```bash
cd server && npm run build && npm start
cd client && npm run build && npm run preview
```
