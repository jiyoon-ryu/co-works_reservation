# Co-Works Reservation System

자유전공학부 학생회 코웍스(Co-Works) 공간 예약 시스템입니다.  
기존 Google Calendar 기반 예약 방식의 불편함을 개선하기 위해 제작되었습니다.

---

## 배포 링크

- https://co-works-reservation-system.web.app/
- 관리자 페이지: https://co-works-reservation-system.web.app/admin.html

---

## 프로젝트 소개

기존 예약 시스템은 Google Calendar를 기반으로 운영되어 다음과 같은 문제가 존재했습니다.

- 전체 예약 현황을 한눈에 보기 어려움
- 중복 예약 발생 가능
- 예약 착오 발생
- 장시간 예약 관리의 어려움

본 프로젝트는 이러한 문제를 해결하기 위해 개발된 웹 기반 회의실/공간 예약 시스템입니다.

---

## 주요 기능

### 예약 기능

- 드래그(PC) / 터치 드래그(모바일) 기반 시간 선택
- 최대 6시간 예약 제한 (1인 하루 최대 6시간)
- 24시간제 지원
- 중복 예약 방지
- 예약 취소 기능 (취소 사유 입력 가능)
- 예약/취소 시 이메일 알림 발송

### 사용자 입력 정보

- 학번
- 이름
- Gmail 계정
- 이용 목적

### 예약 현황 시각화

달력에서 날짜별 예약 현황을 색상으로 표시합니다.

| 상태 | 색상 |
|---|---|
| 예약 없음 | 🔵 파란색 |
| 예약 적음 | 🟢 초록색 |
| 절반 이상 예약 | 🟠 주황색 |
| 거의 마감 | 🔴 빨간색 |

### 관리자 페이지 (`admin.html`)

- Firebase Auth 로그인 (지정된 관리자 이메일만 접근 가능)
- 전체 예약 목록 조회 (마스킹 없이 학번/이름/이메일/목적 표시)
- 통계 (전체/오늘/이번 달 예약 수, 날짜별 예약 수)
- 날짜/이름/학번 검색·필터
- 비밀번호 없이 강제 취소 (취소 사유 입력 필수, `cancellationLogs` 컬렉션에 기록)

### 기타 기능

- 예약자 이름 마스킹 표시 (예: 이*원)
- 새로고침 후에도 예약 유지
- 월별 달력 이동
- 모바일 반응형 레이아웃

---

## 기술 스택

### Frontend

- HTML / CSS / Vanilla JavaScript (빌드 도구 없이 정적 파일로 동작)

### Backend / Infra

- Firebase Hosting — 정적 파일 배포
- Firebase Firestore — 예약 데이터 저장 (별도 백엔드 서버 없이 클라이언트에서 직접 접근)
- Firebase Authentication — 관리자 페이지 로그인
- Google Apps Script — 예약/취소 이메일 발송 (`google-apps-script/emailWebApp.gs`)

### CI/CD

- GitHub Actions — PR 시 미리보기 배포, `main` 머지 시 Firebase Hosting 자동 배포

> `server/` 디렉터리는 초기에 검토했던 Node.js/Express/MySQL 백엔드 구조이며, 현재 배포된 서비스에서는 사용하지 않습니다.

---

## 프로젝트 구조

```text
co-works_reservation/
├─ index.html              # 예약 페이지
├─ script.js
├─ admin.html               # 관리자 페이지
├─ admin.js
├─ admin.css
├─ style.css
├─ emailConfig.js           # Google Apps Script 웹앱 URL / 시크릿 설정
├─ google-apps-script/
│  └─ emailWebApp.gs        # 이메일 발송용 Apps Script 소스 (script.google.com에 붙여넣는 코드)
├─ firebase.json
├─ firestore.rules
└─ server/                  # 미사용 (레거시 백엔드 초안)
```

---

## Firestore 컬렉션 구조

### `reservations`

| 필드 | 설명 |
|---|---|
| date | 예약 날짜 (`YYYY-MM-DD`) |
| time / endTime | 시작/종료 시간 (`HH:00`) |
| studentId | 학번 |
| name | 이름 |
| email | Gmail 주소 |
| purpose | 이용 목적 |
| passwordHash | 취소 비밀번호 해시(SHA-256) |
| createdAt | 생성 시각 |

### `reservationSlots`

시간 단위(`{date}_{hour}`) 중복 예약 방지를 위한 보조 컬렉션입니다.

### `cancellationLogs`

관리자 강제 취소 시 기록되는 로그입니다 (취소 사유, 취소한 관리자 이메일, 원본 예약 정보 포함). 관리자만 read/create 가능합니다.

---

## 실행 방법

### 로컬 실행

`index.html` 또는 `admin.html`을 Live Server 등으로 실행합니다. 별도 백엔드 서버 실행이 필요 없습니다.

### 배포

`main` 브랜치에 머지되면 GitHub Actions가 자동으로 Firebase Hosting에 배포합니다. Firestore 보안 규칙은 별도로 배포해야 합니다.

```bash
firebase deploy --only firestore:rules
```

---

## 관리자 페이지 설정

1. Firebase 콘솔 → Authentication → 이메일/비밀번호 로그인 활성화 후 관리자 계정 생성
2. `admin.js`의 `ADMIN_EMAILS`와 `firestore.rules`의 `isAdmin()` 이메일 목록을 관리자 이메일로 맞추기
3. `firestore.rules` 배포

---

## 이메일 알림 설정

예약 확정 / 취소 시 학생 회 공식 구글 계정으로 발송되는 Google Apps Script 웹앱을 사용합니다.

1. 학생회 공식 구글 계정으로 [script.google.com](https://script.google.com) 접속 후 새 프로젝트 생성
2. `google-apps-script/emailWebApp.gs` 내용을 그대로 붙여넣고, `SHARED_SECRET` 값을 임의의 문자열로 변경
3. 배포 → 새 배포 → 웹 앱 (실행 계정: 나, 액세스 권한: 모든 사용자)로 배포
4. 발급된 웹 앱 URL과 2번에서 정한 시크릿을 `emailConfig.js`의 `webAppUrl` / `secret`에 입력

---

## 향후 개발 예정 기능

- Google Calendar API 연동
- 예약 승인 시스템
- 실시간 예약 반영(Socket.IO 등)

---

## 제작 목적

학생회 공간 예약 과정을 보다 효율적으로 관리하고,  
중복 예약 및 예약 착오를 최소화하기 위해 개발하였습니다.
