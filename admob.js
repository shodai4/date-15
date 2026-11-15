/**
 * 15文字デート - admob.js
 * 画面下部の常時バナー広告（Google AdMob / iOS・Capacitor）
 *
 * 【本番ID（AdMob 管理画面で 2026-11-15 発行）】
 *   アプリID  : ca-app-pub-5739782559889389~9293414856
 *               … Info.plist の GADApplicationIdentifier（scripts/configure-ios.js が設定）
 *   バナー    : ca-app-pub-5739782559889389/5354169841（15文字デート_バナー）
 *
 * 【テスト広告 / 本番広告の切り替え＝config.js の1行だけ】
 *   window.DATE_CONFIG.ADMOB.USE_TEST_ADS
 *     true  … TestFlight 実機テスト中。リクエストに isTesting: true を載せると、
 *             @capacitor-community/admob の iOS 側 getAdId() が Google 公式の
 *             テスト用ユニット（プラグイン内蔵の固定値）へ自動差し替えする。
 *             収益は発生せず、自分のクリックが無効トラフィックにもならない。
 *     false … App Store 提出ビルド。isTesting: false で本番ユニットから本番広告を配信。
 *
 *   USE_TEST_ADS が無い環境（単体テスト・設定漏れ）は安全側＝テスト広告に倒す。
 *   本番IDのまま自分の広告を踏むと AdMob アカウント停止になり得るため、
 *   広告リクエストは必ず buildAdOptions() / buildInitializeOptions() を経由させる。
 *
 * 【表示位置と下部余白】
 *   バナーは BOTTOM_CENTER / ADAPTIVE_BANNER で画面下端に固定表示する。
 *   ネイティブのバナーは WebView の「上に」重なるので、その高さぶん
 *   body の padding-bottom を確保しないと、投稿ボタンやフッターが
 *   バナーの下に隠れてタップできなくなる。
 *   そのため表示時は body[data-native-banner="true"] を立て、
 *   実際のバナー高さ（bannerAdSizeChanged）を --admob-banner-height に入れて
 *   index.html の CSS がその分だけ余白を作る。
 *
 * 【Webブラウザ】ネイティブ（Capacitor iOS）でなければ何もせず、エラーも出さない。
 */

(function (global) {
  'use strict';

  /**
   * 本番広告ユニット（config.js が読めない場合のフォールバック）。
   * 値は AdMob 管理画面の発行値そのもの。Info.plist の App ID は
   * scripts/configure-ios.js の GADApplicationIdentifier と一致させる。
   */
  const ADMOB_AD_UNITS = Object.freeze({
    appId: 'ca-app-pub-5739782559889389~9293414856',
    banner: 'ca-app-pub-5739782559889389/5354169841'
  });

  /** Google 公式の iOS テスト用バナーIDは admob.js に書き込まない。
   *  プラグインの isTesting: true が内部で自動的にそのユニットへ差し替えるため、
   *  ここに残すと「テストIDのまま出荷」の事故につながる。 */

  /** バナー高さの初期値（px）。実際の高さは bannerAdSizeChanged で上書きする。 */
  const DEFAULT_BANNER_HEIGHT = 50;

  /** config.js の window.DATE_CONFIG（無ければ null） */
  function readConfig() {
    if (typeof global === 'undefined' || !global) return null;
    const config = global.DATE_CONFIG;
    return config && typeof config === 'object' ? config : null;
  }

  /** window.DATE_CONFIG.ADMOB（無ければ null） */
  function readAdMobConfig() {
    const config = readConfig();
    return config && config.ADMOB && typeof config.ADMOB === 'object' ? config.ADMOB : null;
  }

  /**
   * いま「テスト広告モード」で動くべきか。
   * 設定が無い・型が違う環境は安全側（テスト広告）に倒す。
   * @returns {boolean}
   */
  function isAdMobTestingMode() {
    const admob = readAdMobConfig();
    if (admob && typeof admob.USE_TEST_ADS === 'boolean') return admob.USE_TEST_ADS;
    return true;
  }

  /** 本番バナー広告ユニットID（config.js 優先・無ければ定数） */
  function resolveBannerAdId() {
    const admob = readAdMobConfig();
    const fromConfig = admob && typeof admob.BANNER_AD_ID === 'string' ? admob.BANNER_AD_ID.trim() : '';
    return fromConfig || ADMOB_AD_UNITS.banner;
  }

  /** 本番アプリID（config.js 優先・無ければ定数） */
  function resolveAppId() {
    const admob = readAdMobConfig();
    const fromConfig = admob && typeof admob.APP_ID === 'string' ? admob.APP_ID.trim() : '';
    return fromConfig || ADMOB_AD_UNITS.appId;
  }

  class AdMobManager {
    /**
     * @param {{ deferInit?: boolean }} options
     */
    constructor(options = {}) {
      this.admob = null;
      this.initStarted = false;
      this.listenersAttached = false;
      this.bannerRequested = false;

      this.isNative = typeof global !== 'undefined'
        && !!global.Capacitor
        && typeof global.Capacitor.isNativePlatform === 'function'
        && !!global.Capacitor.isNativePlatform();

      if (!options.deferInit) this.init();
    }

    /** テスト広告モードか（config.js のフラグを毎回読み直すので実行中でも切り替わる） */
    get isTesting() {
      return isAdMobTestingMode();
    }

    /** 本番バナー広告ユニットID */
    get bannerAdId() {
      return resolveBannerAdId();
    }

    /** 本番アプリID（Info.plist と突き合わせる用） */
    get appId() {
      return resolveAppId();
    }

    /**
     * 広告リクエスト共通オプション。isTesting を必ず載せることで、
     * 実機テスト中のクリックが本番広告の無効トラフィックとして計上されるのを防ぐ。
     * @returns {{ isTesting: boolean }}
     */
    buildAdOptions() {
      return { isTesting: this.isTesting };
    }

    /**
     * initialize に渡すオプション。
     * requestTrackingAuthorization は ATT（許可ダイアログ）を出す宣言。
     * @returns {{ requestTrackingAuthorization: boolean, initializeForTesting: boolean }}
     */
    buildInitializeOptions() {
      return {
        requestTrackingAuthorization: true,
        initializeForTesting: this.isTesting
      };
    }

    /**
     * ネイティブ側の AdMob プラグインを取得する。
     * Capacitor は window.Capacitor.Plugins に登録済みプラグインのプロキシを生やす。
     * 生えていない環境では registerPlugin でプロキシを作る（どちらも無ければ null）。
     */
    resolvePlugin() {
      if (typeof global === 'undefined' || !global.Capacitor) return null;
      const capacitor = global.Capacitor;
      if (capacitor.Plugins && capacitor.Plugins.AdMob) return capacitor.Plugins.AdMob;
      if (typeof capacitor.registerPlugin === 'function') {
        try {
          return capacitor.registerPlugin('AdMob');
        } catch (err) {
          return null;
        }
      }
      return null;
    }

    /** body の下部余白（バナーぶん）を確保／解除する。ネイティブ以外では何もしない。 */
    setBannerPadding(visible) {
      if (typeof document === 'undefined' || !document || !document.body) return false;
      if (!this.isNative) {
        document.body.removeAttribute('data-native-banner');
        return false;
      }
      if (visible) {
        document.body.setAttribute('data-native-banner', 'true');
      } else {
        document.body.removeAttribute('data-native-banner');
      }
      return !!visible;
    }

    /**
     * 実際のバナー高さ（px）を CSS 変数へ入れる。
     * index.html の body[data-native-banner="true"] がこの値＋下セーフエリアを余白にする。
     */
    setBannerHeight(height) {
      if (typeof document === 'undefined' || !document || !document.documentElement) return;
      const px = Math.round(Number(height));
      if (!Number.isFinite(px) || px <= 0) return;
      const style = document.documentElement.style;
      if (style && typeof style.setProperty === 'function') {
        style.setProperty('--admob-banner-height', `${px}px`);
      }
    }

    /** 読み込み完了・サイズ確定・失敗のイベントを一度だけ購読する */
    attachBannerListeners() {
      if (this.listenersAttached || !this.admob || typeof this.admob.addListener !== 'function') return;
      this.listenersAttached = true;

      try {
        this.admob.addListener('bannerAdLoaded', () => {
          // 読み込み完了までは余白を確保済み。念のため再度立てる。
          this.setBannerPadding(true);
        });
        this.admob.addListener('bannerAdSizeChanged', (size) => {
          const height = size && typeof size.height === 'number' ? size.height : 0;
          if (height > 0) {
            this.setBannerHeight(height);
            this.setBannerPadding(true);
          }
        });
        this.admob.addListener('bannerAdFailedToLoad', (error) => {
          // 広告が出ないのに余白だけ空くと投稿ボタンの位置が不自然になるため解除する
          console.warn('[AdMob] Banner failed to load:', error);
          this.setBannerPadding(false);
        });
      } catch (err) {
        console.warn('[AdMob] Failed to subscribe banner events:', err);
      }
    }

    /**
     * 初期化 → ATT（必要なら）→ 下部バナー表示。
     * Web ブラウザ・プラグイン未搭載では静かにスキップする（例外は投げない）。
     */
    async init() {
      // 二重初期化（ATT の二重要求）を防ぐ
      if (this.initStarted) return false;
      this.initStarted = true;

      if (!this.isNative) {
        console.log('[AdMob] Web ブラウザではネイティブ広告を呼びません（安全にスキップ）。');
        return false;
      }

      this.admob = this.resolvePlugin();
      if (!this.admob) {
        console.log('[AdMob] AdMob プラグインが見つかりません（ネイティブ未同期）。スキップします。');
        return false;
      }

      try {
        await this.admob.initialize(this.buildInitializeOptions());
        console.log(`[AdMob] initialized (testing=${this.isTesting})`);
      } catch (err) {
        console.warn('[AdMob] Initialization warning:', err);
        return false;
      }

      await this.requestTrackingAuthorizationIfNeeded();
      return this.showBanner();
    }

    /**
     * ATT（App Tracking Transparency）。未回答のときだけ iOS の許可ダイアログを出す。
     * 拒否されても広告は非パーソナライズで配信され、アプリの機能は変わらない。
     */
    async requestTrackingAuthorizationIfNeeded() {
      if (!this.admob) return false;
      if (typeof this.admob.trackingAuthorizationStatus !== 'function') return false;
      try {
        const info = await this.admob.trackingAuthorizationStatus();
        const status = info && typeof info.status === 'string' ? info.status : 'notDetermined';
        if (status === 'notDetermined' && typeof this.admob.requestTrackingAuthorization === 'function') {
          await this.admob.requestTrackingAuthorization();
          return true;
        }
      } catch (err) {
        console.warn('[AdMob] ATT warning:', err);
      }
      return false;
    }

    /** 画面下部に常時バナーを表示する（失敗しても例外を投げない） */
    async showBanner() {
      if (!this.isNative || !this.admob) return false;

      try {
        await this.admob.showBanner({
          ...this.buildAdOptions(),
          adId: this.bannerAdId,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 0
        });
        this.bannerRequested = true;
        // バナーが届く前から高さぶんを空けておく（あとから内容が飛び跳ねない）
        this.setBannerHeight(DEFAULT_BANNER_HEIGHT);
        this.setBannerPadding(true);
        this.attachBannerListeners();
        console.log('[AdMob] 下部バナーを表示しました。');
        return true;
      } catch (err) {
        console.warn('[AdMob] Failed to show banner:', err);
        this.setBannerPadding(false);
        return false;
      }
    }

    /** バナーを隠して下部余白も戻す（審査・デバッグ用） */
    async hideBanner() {
      this.setBannerPadding(false);
      if (!this.admob) return false;
      try {
        if (typeof this.admob.hideBanner === 'function') await this.admob.hideBanner();
        if (typeof this.admob.removeBanner === 'function') await this.admob.removeBanner();
        return true;
      } catch (err) {
        console.warn('[AdMob] Failed to hide banner:', err);
        return false;
      }
    }
  }

  const api = {
    AdMobManager,
    ADMOB_AD_UNITS,
    DEFAULT_BANNER_HEIGHT,
    isAdMobTestingMode,
    resolveBannerAdId,
    resolveAppId
  };

  if (typeof global !== 'undefined' && global) {
    global.Date15AdMob = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
