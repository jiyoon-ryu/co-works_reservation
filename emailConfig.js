// Google Apps Script 웹앱 배포 정보를 아래 2개에 채워주세요.
//
// 1. script.google.com 접속 (학생회 공식 구글 계정으로 로그인)
// 2. 새 프로젝트 생성 후, google-apps-script/emailWebApp.gs 내용을 그대로 붙여넣기
// 3. SHARED_SECRET 값을 무작위 문자열로 직접 바꾸기 (아래 secret과 동일하게 유지)
// 4. 배포 > 새 배포 > 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자
// 5. 배포 후 나오는 웹 앱 URL을 webAppUrl에 붙여넣기
export const APPS_SCRIPT_CONFIG = {
  webAppUrl: "https://script.google.com/macros/s/AKfycbycf_ROEn4TBRbm04ZNlQ0Q9nPltg9u2e0mwceDqR4uljpqNNTCpVLdMcvCRBwMgFh6Xw/exec",
  secret: "0a0c2c2bc2685b20cc8fd7ec1ddde6c3",

  calendarWebAppUrl: "https://script.google.com/macros/s/AKfycbxE_FN_pQTRUXwzVkNKNmVeC2r7WMDm2gocQE1omD14UixTw3gVYu_Lry5ve7ONrDo/exec",
  calendarSecret: "b39b83b7d99569a461c3b509adacca868c08bd166324302a"
};
