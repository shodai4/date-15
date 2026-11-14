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

## TestFlight で詰まらないための先回り設定（テリトリーウォークの実機検証より）

### 1. 輸出コンプライアンス（ITSAppUsesNonExemptEncryption）

このアプリは HTTPS（Apple の暗号化）を使うだけで、独自の暗号化は実装していません。そのため輸出コンプライアンスは「免除」＝ `ITSAppUsesNonExemptEncryption = false` です。

これを `Info.plist` に入れておかないと、TestFlight にアップロードしたビルドが「輸出コンプライアンス情報がありません」で **配信保留** になり、自動配信されません。

`scripts/configure-ios.js` が `npm run cap:sync` / `npm run ios:config` / `npm run ios:setup` のたびに自動で次を実行します（何度実行しても結果は同じ＝冪等、重複キーは作りません）:

1. `<key>ITSAppUsesNonExemptEncryption</key><false/>` をルートの `<dict>` へ注入
2. 既に `<true/>` で入っていれば `<false/>` に訂正
3. 同じキーが複数あれば1件にまとめる
4. 書き込んだ後に読み直して検証（キー1件・値が `<false/>`・`<dict>` の対応・XML が壊れていないか）

手作業で Info.plist を触る必要はありません。万一 App Store Connect 側で「輸出コンプライアンス」の質問が出た場合も、「独自の暗号化は使っていない（免除対象）」を選べば OK です。

### 2. Dynamic Island / セーフエリア

`capacitor.config.json` の `ios.contentInset` は `"never"`（ネイティブ側で余白を足さない）。余白は CSS だけで1回だけ確保します。

- 上（Dynamic Island・ノッチ）: `header { padding-top: calc(env(safe-area-inset-top, 0px) + 0.5rem) !important; }`
- 下（ホームインジケータ）: `body { padding-bottom: env(safe-area-inset-bottom); }`

`contentInset` が `"always"` のままだと、ネイティブの余白と CSS の `env(safe-area-inset-top)` が二重にかかり、ヘッダーが不自然に下がります。`"never"` にすることで Web 表示（env = 0px）と見た目が一致します。

### 3. 変更後の確認コマンド（無料・Mac不要）

```bash
npm test        # 輸出コンプライアンス注入の冪等性・セーフエリア・www同期を検証（全てPASSでOK）
npm run build   # www/ へ Web アセットを同期
```

---

## 整備済みアセット一覧

- `resources/icon.png`: App Store用公式アプリアイコン (1024x1024px, RGB透過なし)
- `resources/splash.png`: iOS用高解像度起動スプラッシュ (2732x2732px)
- `resources/AppIcon.appiconset/`: Xcode用全14解像度アイコンカタログ一式
- `resources/screenshots/`: App Store Connect用 6.7インチスクリーンショット4枚一式
- `privacy.html`: プライバシーポリシー (GitHub Pages公開済み)
- `terms.html`: 利用規約 (GitHub Pages公開済み)
- `support.html`: サポート・FAQ窓口 (GitHub Pages公開済み)
- `ci/ios-build.yml`: macOS 14・Xcode 16自動ビルドCI定義（`npm test` → www 同期 → Info.plist 設定 → ビルドの順）
- `tests/`: Node標準 `node:test` による無料の回帰テスト（`npm test`）
