/**
 * Supabase 接続設定ファイル
 * 
 * 笹部画材ガチャで使っているSupabaseのURLとanon keyを設定すると、
 * 全ユーザーの投稿・いいねがリアルタイムに共有されます。
 * 
 * ※未設定の場合は、ローカルストレージと初期プリセット10件で即座に動作します。
 */

window.DATE_CONFIG = {
  // Supabase Project URL (例: 'https://xxx.supabase.co')
  SUPABASE_URL: '',

  // Supabase Anon Key (公開用キー)
  SUPABASE_ANON_KEY: '',

  // テーブル名
  TABLE_NAME: 'date_plans'
};
