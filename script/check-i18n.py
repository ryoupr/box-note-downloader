#!/usr/bin/env python3
"""i18n coverage check for box-note-downloader.

多言語対応の設定漏れをPR段階で検出する。以下を検証し、1件でも
違反があれば非ゼロ終了する（GitHub Actions の i18n-check から実行）。

 1. public/_locales/*/messages.json が正しいJSONで、既定ロケール(en)と
    キー集合が一致し、各メッセージが空でなく、placeholders の形式が正しい
 2. popup HTML の data-i18n / data-i18n-ph / data-i18n-aria で参照する
    キーが既定ロケールに存在する
 3. popup JS の t("key") およびエラーマップの titleKey/descKey/actionKey が
    既定ロケールに存在する
 4. popup HTML 内のCJKテキストが data-i18n 要素内か、JS_MANAGED_IDS の
    いずれかに属する（＝ロケール切替で必ず上書きされる）
 5. entrypoints/popup/i18n.js の SUPPORTED と _locales 配下のディレクトリ、
    wxt.config.ts の default_locale が一致する
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES_DIR = ROOT / "public" / "_locales"
POPUP_HTML = ROOT / "entrypoints" / "popup" / "index.html"
I18N_JS = ROOT / "entrypoints" / "popup" / "i18n.js"
MAIN_JS = ROOT / "entrypoints" / "popup" / "main.js"
WXT_CONFIG = ROOT / "wxt.config.ts"
DEFAULT_LOCALE = "en"

# 実行時にJSが必ず textContent を上書きする動的要素（静的 data-i18n 不可）。
# 注意: これらに data-i18n を付けてはならない。i18n.js の applyToDOM は
# [data-i18n] を無条件上書きするため、設定画面での言語切替時に取得済みの
# ノートタイトル等が初期文言に戻り、誤ったファイル名の原因になる
# （main.js: init時は意図的に data-i18n 外で t() 設定している）。
# 例: filename-preview はファイル名パターンの生成例であり固定訳文を持てない。
JS_MANAGED_IDS = {
    "filename-preview",
    "note-title",
    "note-meta-text",
    "error-title",
    "error-action-btn",
}

# CJK検出範囲。CJK記号・約物ブロック（U+3000〜303F: 、。「」・等）は
# 翻訳対象の文章ではないため除外し、ひらがな・カタカナ本体のみ対象とする。
CJK = re.compile(r"[ぁ-ヶ㐀-䶿一-鿿豈-﫿가-힯]")
I18N_ATTRS = ("data-i18n", "data-i18n-ph", "data-i18n-aria")

errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


# --- 1. messages.json の妥当性とキー一致 -------------------------------------
locale_files = sorted(LOCALES_DIR.glob("*/messages.json"))
if not locale_files:
    fail(f"no messages.json found under {LOCALES_DIR}")
    locale_files = []

messages_by_locale: dict[str, dict] = {}
for path in locale_files:
    locale = path.parent.name
    try:
        messages_by_locale[locale] = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        fail(f"{path.relative_to(ROOT)}: invalid JSON ({exc})")

default = messages_by_locale.get(DEFAULT_LOCALE, {})
for key, value in default.items():
    if not isinstance(value, dict) or not isinstance(value.get("message"), str):
        fail(f"_locales/{DEFAULT_LOCALE}: '{key}' must be an object with a 'message' string")
    elif value["message"] == "":
        fail(f"_locales/{DEFAULT_LOCALE}: '{key}' has an empty message")
    for ph_name, ph in (value.get("placeholders") or {}).items():
        content = (ph or {}).get("content", "")
        if not re.fullmatch(r"\$\d+", content):
            fail(f"_locales/{DEFAULT_LOCALE}: '{key}' placeholder '{ph_name}' "
                 f"content must be like '$1' (got {content!r})")

for locale, messages in sorted(messages_by_locale.items()):
    if locale == DEFAULT_LOCALE:
        continue
    missing = sorted(set(default) - set(messages))
    extra = sorted(set(messages) - set(default))
    if missing:
        fail(f"_locales/{locale}: missing keys vs {DEFAULT_LOCALE}: {', '.join(missing)}")
    if extra:
        fail(f"_locales/{locale}: extra keys vs {DEFAULT_LOCALE}: {', '.join(extra)}")
    for key in sorted(set(default) & set(messages)):
        value = messages[key]
        if not isinstance(value, dict) or not isinstance(value.get("message"), str):
            fail(f"_locales/{locale}: '{key}' must be an object with a 'message' string")
        elif value["message"] == "":
            fail(f"_locales/{locale}: '{key}' has an empty message")
        # placeholders のプレースホルダ名・content は既定ロケールと一致させる
        #（$1 と $TITLE$ の混在など、置換漏れの原因になる差異を検出）。
        default_ph = (default[key].get("placeholders") or {}) if isinstance(default.get(key), dict) else {}
        locale_ph = (value.get("placeholders") or {}) if isinstance(value, dict) else {}
        if sorted(default_ph) != sorted(locale_ph):
            fail(f"_locales/{locale}: '{key}' placeholders {sorted(locale_ph)} "
                 f"!= {DEFAULT_LOCALE} {sorted(default_ph)}")
        for ph_name, ph in default_ph.items():
            if (locale_ph.get(ph_name) or {}).get("content") != (ph or {}).get("content"):
                fail(f"_locales/{locale}: '{key}' placeholder '{ph_name}' content "
                     f"differs from {DEFAULT_LOCALE}")

# --- 2. HTML の data-i18n 参照 -----------------------------------------------
html = POPUP_HTML.read_text(encoding="utf-8")
used_in_html: set[str] = set()
for attr in I18N_ATTRS:
    used_in_html.update(re.findall(rf'{attr}="([^"]+)"', html))
for key in sorted(used_in_html):
    if key not in default:
        fail(f"index.html: data-i18n key '{key}' not found in _locales/{DEFAULT_LOCALE}")

# --- 3. JS の t("key") / エラーマップ参照 --------------------------------------
# 注意: 正規表現ベースの静的検出のため、リテラルで書かれたキー参照のみ検出
# できる。動的キー（変数経由の t(variable) 等）は対象外。将来的に動的キーを
# 導入する場合は本チェックの拡張が必要。
js = MAIN_JS.read_text(encoding="utf-8")
used_in_js = set(re.findall(r'\bt\(\s*["\']([^"\']+)["\']', js))
used_in_js.update(
    re.findall(r'(?:titleKey|descKey|actionKey)\s*:\s*["\']([^"\']+)["\']', js)
)
for key in sorted(used_in_js):
    if key not in default:
        fail(f"main.js: i18n key '{key}' not found in _locales/{DEFAULT_LOCALE}")


# --- 4. data-i18n の付いていないCJK決め打ち ------------------------------------
class CjkScanner(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[dict] = []
        self.tag_stack: list[str] = []
        self.in_ignorable = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        self.stack.append(dict(attrs))
        self.tag_stack.append(tag)
        if tag in ("script", "style"):
            self.in_ignorable += 1

    def handle_endtag(self, tag: str) -> None:
        if self.stack:
            self.stack.pop()
        if self.tag_stack:
            self.tag_stack.pop()
        if tag in ("script", "style") and self.in_ignorable:
            self.in_ignorable -= 1

    def handle_data(self, data: str) -> None:
        if self.in_ignorable or not CJK.search(data):
            return
        text = data.strip()
        if not text:
            return
        # <option> のラベルは言語のネイティブ表記（日本語・简体中文など）や
        # 技術定数（OFF/Error/…）という管理語彙であり、翻訳対象外が正規。
        # ただし value="auto" の項目（languageAuto）は data-i18n 必須のため
        # 免除せず、下の covered 判定に落として検証する。
        if "option" in self.tag_stack:
            idx = len(self.tag_stack) - 1 - self.tag_stack[::-1].index("option")
            if self.stack[idx].get("value") != "auto":
                return
        covered = any("data-i18n" in el for el in self.stack)
        managed = any(el.get("id") in JS_MANAGED_IDS for el in self.stack)
        if not (covered or managed):
            snippet = (text[:24] + "…") if len(text) > 24 else text
            fail(f"index.html: CJK text without data-i18n: {snippet!r} "
                 f"(add data-i18n or register the id in JS_MANAGED_IDS)")


CjkScanner().feed(html)

# --- 5. SUPPORTED / ディレクトリ / default_locale の一致 ----------------------
i18n_js = I18N_JS.read_text(encoding="utf-8")
match = re.search(r"SUPPORTED\s*=\s*\[(.*?)\]", i18n_js, re.S)
supported = sorted(re.findall(r'''["']([^"']+)["']''', match.group(1))) if match else []
dirs = sorted(p.parent.name for p in locale_files)
if supported != dirs:
    fail(f"i18n.js SUPPORTED {supported} != _locales dirs {dirs}")

config = WXT_CONFIG.read_text(encoding="utf-8")
match = re.search(r"default_locale\s*:\s*['\"]([^'\"]+)['\"]", config)
if not match or match.group(1) != DEFAULT_LOCALE:
    fail(f"wxt.config.ts default_locale must be '{DEFAULT_LOCALE}'")

# --- 結果 ----------------------------------------------------------------------
print(f"locales: {len(messages_by_locale)} "
      f"({', '.join(sorted(messages_by_locale)) or 'none'}), "
      f"keys in {DEFAULT_LOCALE}: {len(default)}, "
      f"data-i18n refs: {len(used_in_html)}, js refs: {len(used_in_js)}")
if errors:
    print(f"FAILED: {len(errors)} problem(s)")
    for msg in errors:
        print(f"  - {msg}")
    sys.exit(1)
print("OK: i18n coverage looks good")
