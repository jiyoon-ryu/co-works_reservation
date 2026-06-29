import { google } from "googleapis";

const GOOGLE_MANAGER_EMAIL = (
  process.env.GOOGLE_MANAGER_EMAIL || "umkemebegin@gmail.com"
).toLowerCase();

const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email"
];

function createOAuthClient() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth 환경변수가 설정되지 않았습니다.");
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function getAuthorizedOAuthClient() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_REFRESH_TOKEN이 설정되지 않았습니다.");
  }

  const oauth2Client = createOAuthClient();

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  return oauth2Client;
}

function getCalendarClient() {
  return google.calendar({
    version: "v3",
    auth: getAuthorizedOAuthClient()
  });
}

function makeGoogleDateTime(date, time) {
  return `${date}T${String(time).slice(0, 5)}:00+09:00`;
}

/*
  Google Calendar event ID는 소문자 a-v와 숫자만 쓰는 편이 안전하다.
  reservation은 모두 a-v 범위 문자라서 사용 가능하다.
*/
function makeDeterministicEventId(reservationId) {
  return `reservation${reservationId}`;
}

function getErrorStatus(error) {
  return error?.code || error?.response?.status;
}

export function isGoogleCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

export function getGoogleAuthorizationUrl(state) {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state
  });
}

export async function exchangeGoogleAuthorizationCode(code) {
  const oauth2Client = createOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Google access token을 받지 못했습니다.");
  }

  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({
    version: "v2",
    auth: oauth2Client
  });

  const { data } = await oauth2.userinfo.get();

  const signedInEmail = (data.email || "").toLowerCase();

  if (signedInEmail !== GOOGLE_MANAGER_EMAIL) {
    throw new Error(
      `관리 계정은 ${GOOGLE_MANAGER_EMAIL}이어야 합니다. 현재 로그인 계정: ${signedInEmail || "확인 불가"}`
    );
  }

  if (!tokens.refresh_token) {
    throw new Error(
      "Refresh token을 받지 못했습니다. Google 계정의 연결된 앱 권한을 삭제한 뒤 다시 연결해 주세요."
    );
  }

  return {
    managerEmail: signedInEmail,
    refreshToken: tokens.refresh_token
  };
}

export async function ensureReservationCalendarEvent(reservation) {
  const calendar = getCalendarClient();

  const eventId =
    reservation.google_event_id ||
    makeDeterministicEventId(reservation.id);

  const event = {
    id: eventId,

    summary: "[CO-WORKS] 회의실 예약",

    description: [
      `예약자: ${reservation.name}`,
      `학번: ${reservation.student_id}`,
      `이메일: ${reservation.email}`,
      `이용 목적: ${reservation.purpose || "미입력"}`,
      `예약 ID: ${reservation.id}`
    ].join("\n"),

    start: {
      dateTime: makeGoogleDateTime(reservation.date, reservation.time),
      timeZone: "Asia/Seoul"
    },

    end: {
      dateTime: makeGoogleDateTime(
        reservation.date,
        reservation.end_time
      ),
      timeZone: "Asia/Seoul"
    },

    attendees: [
      {
        email: reservation.email
      }
    ],

    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,

    extendedProperties: {
      private: {
        reservationId: String(reservation.id)
      }
    }
  };

  try {
    const response = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: event,
      sendUpdates: "all"
    });

    return response.data.id;
  } catch (error) {
    /*
      서버가 이벤트 생성 직후 응답을 받기 전에 끊겼다면,
      재시도 때 동일한 event ID로 409 Conflict가 날 수 있다.
      그 경우 기존 이벤트를 가져와 event ID를 복구한다.
    */
    if (getErrorStatus(error) !== 409) {
      throw error;
    }

    const existing = await calendar.events.get({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId
    });

    return existing.data.id;
  }
}

export async function deleteReservationCalendarEvent(reservation) {
  const calendar = getCalendarClient();

  const eventId =
    reservation.google_event_id ||
    makeDeterministicEventId(reservation.id);

  try {
    await calendar.events.delete({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId,
      sendUpdates: "all"
    });
  } catch (error) {
    /*
      이벤트가 없다는 404는 이미 삭제된 것으로 간주한다.
    */
    if (getErrorStatus(error) === 404) {
      return;
    }

    throw error;
  }
}