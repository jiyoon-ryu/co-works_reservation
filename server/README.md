# Co-Works Reservation System

자유전공학부 학생회 코웍스(Co-Works) 공간 예약 시스템입니다.  
기존 Google Calendar 기반 예약 방식의 불편함을 개선하기 위해 제작되었습니다.

---

## 배포 링크

- https://co-worksreservation-production.up.railway.app/

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

- 드래그 기반 시간 선택
- 최대 6시간 예약 제한
- 24시간제 지원
- 중복 예약 방지
- 예약 취소 기능

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

### 기타 기능

- 예약자 이름 마스킹 표시 (예: 이*원)
- 새로고침 후에도 예약 유지
- 월별 달력 이동
- 드래그 기반 다중 시간 예약

---

## 기술 스택

### Frontend

- HTML
- CSS
- Vanilla JavaScript

### Backend

- Node.js
- Express.js

### Database

- MySQL

### Deployment

- GitHub Pages (Frontend)
- Render (Backend)
- Railway MySQL (Database)

---

## 프로젝트 구조

```text
co-works/
├─ index.html
├─ style.css
├─ script.js
└─ server/
   ├─ server.js
   ├─ package.json
   └─ .env
```

---

## 데이터베이스 구조

```sql
CREATE TABLE reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(20) NOT NULL,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  purpose TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 실행 방법

### Frontend 실행

`index.html`을 Live Server로 실행합니다.

### Backend 실행

```bash
cd server
npm install
node server.js
```

---

## API

### 예약 조회

```http
GET /api/reservations
```

### 예약 생성

```http
POST /api/reservations
```

### 예약 취소

```http
DELETE /api/reservations/:id
```

---

## 향후 개발 예정 기능

- Google Calendar API 연동
- 관리자 페이지
- 예약 승인 시스템
- 이메일 알림 기능
- 모바일 반응형 UI 개선
- 실시간 예약 반영(Socket.IO)

---

## 제작 목적

학생회 공간 예약 과정을 보다 효율적으로 관리하고,  
중복 예약 및 예약 착오를 최소화하기 위해 개발하였습니다.
