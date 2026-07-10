# moizyo 배포 가이드 (Cloudflare Workers + D1, 무료)

Worker 하나가 SPA(`client/dist`)와 `/api/*`를 함께 서빙한다.
DB는 Cloudflare D1(SQLite 호환), 주소는 무료 `*.workers.dev` 서브도메인.

무료 한도(2026년 기준): Workers 하루 10만 요청, D1 5GB 저장 / 하루 500만 row 읽기 / 10만 row 쓰기.
콜드 스타트 없음, HTTPS 자동. 신용카드 등록 없이 시작 가능.

## 최초 1회 설정

1. [Cloudflare 가입](https://dash.cloudflare.com/sign-up) (무료 플랜).

2. 의존성 설치 및 로그인:

   ```bash
   cd worker
   npm install
   npx wrangler login   # 브라우저가 열리면 허용
   ```

3. D1 데이터베이스 생성:

   ```bash
   npx wrangler d1 create moizyo
   ```

   출력에 나오는 `database_id`를 복사해서 `worker/wrangler.jsonc`의
   `REPLACE_WITH_D1_DATABASE_ID` 자리에 붙여넣는다.

4. 스키마 적용 (원격 DB):

   ```bash
   npx wrangler d1 migrations apply moizyo --remote
   ```

## 배포 (이후 코드 바뀔 때마다 이 두 단계만)

```bash
cd client && npm run build   # SPA 빌드 → client/dist
cd ../worker && npx wrangler deploy
```

배포가 끝나면 `https://moizyo.<계정서브도메인>.workers.dev` 주소가 출력된다.
그 링크를 그대로 공유하면 된다.

## 로컬 개발

두 가지 방법:

- **API + 빌드된 SPA 한 번에** (프로덕션과 동일한 구성):

  ```bash
  cd worker
  npx wrangler d1 migrations apply moizyo --local   # 최초 1회
  npm run dev                                        # http://localhost:8787
  ```

- **클라이언트 HMR 개발**: 위의 `wrangler dev`(8787)를 띄워둔 채
  `cd client && npm run dev` — vite가 `/api`를 8787로 프록시한다.
  (기존 Express 서버 대신 wrangler dev가 8787을 담당한다.)

로컬 D1 데이터는 `worker/.wrangler/` 아래에 저장되며 커밋되지 않는다.

## 운영 팁

- 로그: `npx wrangler tail` (실시간), 또는 Cloudflare 대시보드 → Workers → moizyo → Observability.
- DB 백업: `npx wrangler d1 export moizyo --remote --output backup.sql` — SQLite 방언 그대로라
  나중에 Fly.io/VPS의 better-sqlite3로 옮길 때 이 파일을 그대로 복원하면 된다.
- 스키마 변경: `worker/migrations/`에 `0002_*.sql`을 추가하고 `migrations apply`를 다시 실행.
- 커스텀 도메인을 붙일 때: 대시보드 → Workers → moizyo → Settings → Domains & Routes.

## 참고: 기존 server/ 디렉토리

`server/`(Express + better-sqlite3)는 Workers 포팅 전의 백엔드로, 이제 사용하지 않는다.
`worker/`가 안정적으로 돌아가는 걸 확인한 뒤 삭제해도 된다.
(`worker/src/{constants,scheduling,types}.ts`는 server에서 그대로 복사한 것이라 유실되는 로직 없음.)
