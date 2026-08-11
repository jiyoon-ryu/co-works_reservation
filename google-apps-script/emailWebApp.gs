// Google Apps Script(script.google.com)에 그대로 붙여넣는 코드입니다.
// 배포 방법은 emailConfig.js 상단 주석을 참고하세요.

// emailConfig.js의 secret과 반드시 동일한 값으로 바꿔주세요.
const SHARED_SECRET = "0a0c2c2bc2685b20cc8fd7ec1ddde6c3";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.secret !== SHARED_SECRET) {
      return jsonResponse({ ok: false, message: "Unauthorized" });
    }

    if (data.type === "reservation_confirmed") {
      sendReservationConfirmedEmail(data);
    } else if (data.type === "reservation_cancelled") {
      sendReservationCancelledEmail(data);
    } else {
      return jsonResponse({ ok: false, message: "Unknown type: " + data.type });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, message: String(error) });
  }
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendReservationConfirmedEmail(data) {
  const subject = `[코웍스 예약 확정] ${data.date} ${data.timeRange}`;

  const body = [
    `${data.name}님, 코웍스 공간 예약이 확정되었습니다.`,
    "",
    `- 날짜: ${data.date}`,
    `- 시간: ${data.timeRange}`,
    `- 학번: ${data.studentId}`,
    `- 이용 목적: ${data.purpose}`,
    "",
    "예약을 취소하려면 코웍스 예약 사이트에서 취소해주세요."
  ].join("\n");

  GmailApp.sendEmail(data.to, subject, body);
}

function sendReservationCancelledEmail(data) {
  const subject = `[코웍스 예약 취소] ${data.date} ${data.timeRange}`;

  const body = [
    `${data.name}님, 코웍스 공간 예약이 취소되었습니다.`,
    "",
    `- 날짜: ${data.date}`,
    `- 시간: ${data.timeRange}`,
    `- 학번: ${data.studentId}`,
    `- 취소 사유: ${data.reason || "미입력"}`,
    `- 취소 처리: ${data.cancelledBy}`
  ].join("\n");

  GmailApp.sendEmail(data.to, subject, body);
}
