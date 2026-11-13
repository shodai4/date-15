# 15文字デート - App Store 申請・リリース完全手順書（Mac不要・クラウド完結版）

> **概要**: お手元のMac（Monterey）でXcodeを手作業で操作する必要はありません。  
> GitHub Actionsの無料macOS 14ランナー（Xcode 16環境）を活用し、ブラウザとiPhoneだけで完全0円でApp Store申請を突破する手順書です。

---

## 3ステップ・リリースの全体像

1. **Apple Developer Program に登録**（年99ドル / ご本人のApple ID）
2. **App Store Connect で新規アプリを作成＆コピペ登録**（所要約10分）
3. **審査へ提出ボタンを押す**（Appleの審査は通常24〜48時間）

---

## ステップ 1: Apple Developer Program 登録（ご本人作業）

1. iPhoneで「Apple Developer」アプリをApp Storeからインストール。
2. 画面の指示に従い、年額99ドル（約15,000円）の登録を完了します。
   ※日本の個人開発者の場合、iPhoneアプリから登録するのが最も承認が早いです。

---

## ステップ 2: App Store Connect でアプリを作成（ブラウザ作業）

1. ブラウザで [App Store Connect](https://appstoreconnect.apple.com/) にアクセス。
2. 「マイApp」 ＞ 「＋」ボタン ＞ 「新規App」をクリック。
3. 以下の通り入力します：
   - プラットフォーム: `iOS`
   - 名前: `15文字デート`
   - プライマリ言語: `日本語`
   - バンドルID: `com.oekaki.date15`
   - SKU: `date-15-ios`
4. 本リポジトリの `docs/app-store-metadata.md` を開き、以下の項目を順にコピー＆ペーストします：
   - **アプリアイコン**: `resources/icon.png` (1024x1024px)
   - **スクリーンショット**: `resources/screenshots/` 配下の4枚を一括ドラッグ＆ドロップ
   - **説明文・プロモーションテキスト・キーワード**
   - **サポートURL / プライバシーポリシーURL**
   - **App Review審査員向けメモ**

---

## ステップ 3: 手元のMacでテストしたい場合（オプション）

お手元のMacで直接iPhoneにUSB接続して動作確認したい場合は、ターミナルで以下を実行するだけで一発起動します：

```bash
cd date-15
npm install
npm run ios:setup
```

自動的にWebアセットがビルドされ、Info.plistとアイコンカタログが同期され、Xcodeが開きます。
Xcode上部の再生ボタン（▶）を押すだけで、接続したiPhoneにアプリが転送されます。

---

## 整備済みアセット一覧

- `resources/icon.png`: App Store用公式アプリアイコン (1024x1024px, RGB透過なし)
- `resources/splash.png`: iOS用高解像度起動スプラッシュ (2732x2732px)
- `resources/AppIcon.appiconset/`: Xcode用全14解像度アイコンカタログ一式
- `resources/screenshots/`: App Store Connect用 6.7インチスクリーンショット4枚一式
- `privacy.html`: プライバシーポリシー (GitHub Pages公開済み)
- `terms.html`: 利用規約 (GitHub Pages公開済み)
- `support.html`: サポート・FAQ窓口 (GitHub Pages公開済み)
- `ci/ios-build.yml`: macOS 14・Xcode 16自動ビルドCI定義
