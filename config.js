/**
 * Supabase 接続設定ファイル
 */

window.DATE_CONFIG = {
  // Supabase Project URL
  SUPABASE_URL: "https://xxzmrdfroqeflfgszgls.supabase.co",

  // Supabase Anon Key (公開用キー)
  SUPABASE_ANON_KEY: "sb_publishable_sPah3iPPh-CesDyG0hxG_A_ZMu2VTkb",

  // テーブル名
  TABLE_NAME: "date_plans",
  // 通報の記録先（通報3件で自動非表示）
  REPORT_TABLE_NAME: "date_plan_reports",

  /**
   * Google AdMob（画面下部の常時バナー広告）
   *
   * 【本番ID（AdMob 管理画面で 2026-11-15 発行）】
   *   アプリ名            : 15文字デート（iOS）
   *   アプリID            : ca-app-pub-5739782559889389~9293414856
   *                         → Info.plist の GADApplicationIdentifier
   *                            （scripts/configure-ios.js が設定）
   *   バナー広告ユニット  : ca-app-pub-5739782559889389/5354169841
   *                         （15文字デート_バナー）
   *
   * 【テスト広告 / 本番広告の切り替え＝この1行だけ】
   *   USE_TEST_ADS: true  … TestFlight 実機テスト中。Google 公式テスト広告を配信する
   *                         （収益は発生せず、自分のクリックでアカウントが
   *                            「無効トラフィック」判定になる心配もない）
   *   USE_TEST_ADS: false … App Store 提出ビルド。上記の本番バナーから本番広告を配信
   *
   *   本番IDのまま自分の広告を表示・クリックしてしまうと無効トラフィック扱いで
   *   AdMob アカウントが停止され得るため、収益化前の検証中は true に戻す。
   *   ※ 2026-11-21: 荒らし対策とUI改善をあてた本番提出用ビルドのため false。
   *     このビルドを TestFlight で自分で触るときは本番広告のタップを避けること。
   *   切り替えはこのファイルの1行だけでよく、admob.js は触らない。
   */
  ADMOB: {
    APP_ID: "ca-app-pub-5739782559889389~9293414856",
    BANNER_AD_ID: "ca-app-pub-5739782559889389/5354169841",
    USE_TEST_ADS: false
  }
};
