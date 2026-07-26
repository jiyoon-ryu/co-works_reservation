// Google Apps Script 웹앱 배포 정보를 아래 2개에 채워주세요.
//
// 1. script.google.com 접속 (학생회 공식 구글 계정으로 로그인)
// 2. 새 프로젝트 생성 후, google-apps-script/emailWebApp.gs 내용을 그대로 붙여넣기
// 3. SHARED_SECRET 값을 무작위 문자열로 직접 바꾸기 (아래 secret과 동일하게 유지)
// 4. 배포 > 새 배포 > 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자
// 5. 배포 후 나오는 웹 앱 URL을 webAppUrl에 붙여넣기
export const APPS_SCRIPT_CONFIG = {
  webAppUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
  secret: "REPLACE_WITH_A_RANDOM_SECRET"
};
