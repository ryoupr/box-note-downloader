# BoxNote DL

Box Notes を Markdown 形式でダウンロードする Chrome 拡張機能です。

> ⚠️ **非公式ツール**: この拡張機能は Box, Inc. とは一切関係のない非公式のサードパーティツールです。Box の商標は機能説明の目的でのみ使用しています。

## 機能

- 📥 開いている Box Note を Markdown (.md) に変換してダウンロード
- 🖼️ 画像付きノートは ZIP（Markdown + assets/）で保存
- ⚙️ 出力フォーマット選択（Markdown / HTML / Plain Text）
- 📝 ファイル名パターンのカスタマイズ
- 🚫 リアルタイム編集カーソル（他ユーザーのアバター等）を自動除外

## インストール

### Chrome Web Store から
[Chrome Web Store](https://chrome.google.com/webstore/detail/xxx) からインストール

### 開発版
1. このリポジトリをクローン
2. `chrome://extensions/` を開く
3. 「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」→ リポジトリフォルダを選択

## 使い方

1. Box Note（`*.app.box.com/notes/*`）を開く
2. 拡張機能アイコンをクリック
3. 「Markdownでダウンロード」ボタンを押す

### 出力形式

| 条件 | 出力 |
|------|------|
| 画像なし | `{ファイル名}.md` を直接ダウンロード |
| 画像あり | `{ファイル名}.zip`（`{ファイル名}/{ファイル名}.md` + `assets/`） |

## 設定

⚙ ボタンから以下を設定可能：

- **言語**: 自動（ブラウザの言語）/ English / 日本語 / 简体中文 / Español / हिन्दी / العربية / Português (Brasil) / Русский / বাংলা
- **ファイル名パターン**: `{title}_{yyyy-mm-dd}` 等
- **添付ファイルを含める**: OFF で画像を無視して単体ファイル出力
- **DL後に自動で開く**: ダウンロードフォルダを自動表示
- **完了通知**: Chrome 通知を表示

<a id="filename-pattern"></a>
### ファイル名パターンで利用できる変数

| 変数 | 置換内容 | 例 |
|------|----------|-----|
| `{title}` | ノートのタイトル | 月次レビュー |
| `{yyyy-mm-dd}` | ダウンロード日の日付 | 2026-09-17 |

タイトルに使えない文字（`<` `>` `:` `"` `/` `\` `|` `?` `*`）は `_` に置き換わります。

## 多言語対応

9言語に対応（`_locales/` + `default_locale: en` の標準 `chrome.i18n` 方式）：

| 言語 | ロケール |
|------|----------|
| English（デフォルト） | `en` |
| 日本語 | `ja` |
| 简体中文 | `zh_CN` |
| Español | `es` |
| हिन्दी | `hi` |
| العربية（RTL） | `ar` |
| Português (Brasil) | `pt_BR` |
| Русский | `ru` |
| বাংলা | `bn` |

- **デフォルト表示言語**: Chrome の UI 言語に自動追従（`chrome.i18n.getUILanguage()`）。未対応言語の場合は英語にフォールバック
- **手動切替**: 設定画面の「言語」から変更可能（`chrome.storage.local` の `uiLanguage` に保存、`lib/i18n.js` が選択言語の `messages.json` を動的読込して即時反映）
- **Chrome Web Store での表明**: `_locales/` を含めて公開すると、Developer Dashboard の Store listing タブで言語ごとの説明文・スクリーンショットを登録可能（詳細: https://developer.chrome.com/docs/webstore/cws-dashboard-listing ）

## 開発

```bash
# アイコン生成
./script/generate-icons.sh source-icon.png

# Chrome Web Store 用 ZIP 作成
./script/build-chrome-extension.sh
```

## 技術仕様

- Manifest V3
- i18n: 標準 `chrome.i18n`（`_locales/` 9言語）+ 設定切替用カスタムレイヤー `lib/i18n.js`
- Content Script: ProseMirror DOM → Markdown 変換
- Background Service Worker: JSZip による ZIP 生成
- 対象: `https://*.app.box.com/notes/*` + `https://notes.services.box.com/*`（iframe）

## ライセンス

MIT License

---

*This extension is an unofficial third-party tool and is not affiliated with, endorsed by, or associated with Box, Inc. "Box" and "Box Notes" are trademarks of Box, Inc.*
