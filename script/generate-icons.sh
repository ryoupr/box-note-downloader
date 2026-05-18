#!/bin/bash

# Chrome拡張機能用アイコン生成ツール
# PNGファイルを16x16、48x48、128x128サイズに変換

set -e

# 色付きの出力用関数
print_info() {
    echo -e "\033[34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

print_warning() {
    echo -e "\033[33m[WARNING]\033[0m $1"
}

# 使用方法を表示
show_usage() {
    echo "Chrome拡張機能用アイコン生成ツール"
    echo
    echo "使用方法:"
    echo "  $0 <入力PNGファイル>"
    echo
    echo "例:"
    echo "  $0 source-icon.png"
    echo "  $0 icons/icon.png"
    echo
    echo "出力:"
    echo "  icons/icon16.png  (16x16px)  - 拡張機能のファビコン"
    echo "  icons/icon19.png  (19x19px)  - ツールバーアイコン（旧版対応）"
    echo "  icons/icon32.png  (32x32px)  - Windows等での表示"
    echo "  icons/icon38.png  (38x38px)  - ツールバーアイコン（高解像度）"
    echo "  icons/icon48.png  (48x48px)  - 拡張機能管理ページ"
    echo "  icons/icon128.png (128x128px) - Chrome Web Store表示"
    echo
    echo "注意:"
    echo "  - macOS標準のsipsコマンドを使用します"
    echo "  - 入力ファイルはPNG形式である必要があります"
    echo "  - 正方形の画像を推奨します"
}

# 引数チェック
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

INPUT_FILE="$1"

# 入力ファイルの存在確認
if [ ! -f "$INPUT_FILE" ]; then
    print_error "ファイルが見つかりません: $INPUT_FILE"
    exit 1
fi

# ファイル拡張子の確認
if [[ ! "$INPUT_FILE" =~ \.(png|PNG)$ ]]; then
    print_error "PNGファイルを指定してください: $INPUT_FILE"
    exit 1
fi

# sipsコマンドの存在確認
if ! command -v sips &> /dev/null; then
    print_error "sipsコマンドが見つかりません。macOSでのみ利用可能です。"
    exit 1
fi

# iconsディレクトリの作成
if [ ! -d "icons" ]; then
    print_info "iconsディレクトリを作成中..."
    mkdir icons
fi

print_info "入力ファイル: $INPUT_FILE"

# 元画像の情報を取得
ORIGINAL_INFO=$(sips -g pixelWidth -g pixelHeight "$INPUT_FILE" 2>/dev/null)
ORIGINAL_WIDTH=$(echo "$ORIGINAL_INFO" | grep "pixelWidth" | awk '{print $2}')
ORIGINAL_HEIGHT=$(echo "$ORIGINAL_INFO" | grep "pixelHeight" | awk '{print $2}')

if [ -n "$ORIGINAL_WIDTH" ] && [ -n "$ORIGINAL_HEIGHT" ]; then
    print_info "元画像サイズ: ${ORIGINAL_WIDTH}x${ORIGINAL_HEIGHT}px"
    
    # 正方形でない場合の警告
    if [ "$ORIGINAL_WIDTH" != "$ORIGINAL_HEIGHT" ]; then
        print_warning "画像が正方形ではありません。変換時に歪む可能性があります。"
    fi
    
    # 小さすぎる画像の警告
    if [ "$ORIGINAL_WIDTH" -lt 128 ] || [ "$ORIGINAL_HEIGHT" -lt 128 ]; then
        print_warning "元画像が128px未満です。拡大により画質が劣化する可能性があります。"
    fi
else
    print_warning "元画像の情報を取得できませんでした。"
fi

# 生成するサイズの定義
declare -a SIZES=("16" "19" "32" "38" "48" "128")

print_info "アイコンを生成中..."

# 各サイズのアイコンを生成
for SIZE in "${SIZES[@]}"; do
    OUTPUT_FILE="icons/icon${SIZE}.png"
    
    # 既存ファイルの確認
    if [ -f "$OUTPUT_FILE" ]; then
        print_warning "既存ファイルを上書きします: $OUTPUT_FILE"
    fi
    
    # sipsでリサイズ
    if sips -z "$SIZE" "$SIZE" "$INPUT_FILE" --out "$OUTPUT_FILE" &>/dev/null; then
        print_success "✓ ${SIZE}x${SIZE}px → $OUTPUT_FILE"
    else
        print_error "✗ ${SIZE}x${SIZE}px の生成に失敗しました"
        exit 1
    fi
done

echo
print_success "すべてのアイコンが正常に生成されました！"
print_info "生成されたファイル:"

# 生成されたファイルの情報を表示
for SIZE in "${SIZES[@]}"; do
    OUTPUT_FILE="icons/icon${SIZE}.png"
    if [ -f "$OUTPUT_FILE" ]; then
        FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
        print_info "  $OUTPUT_FILE (${FILE_SIZE})"
    fi
done

echo
print_info "これらのファイルはmanifest.jsonで参照できます："
print_info '  "icons": {'
print_info '    "16": "icons/icon16.png",'
print_info '    "19": "icons/icon19.png",'
print_info '    "32": "icons/icon32.png",'
print_info '    "38": "icons/icon38.png",'
print_info '    "48": "icons/icon48.png",'
print_info '    "128": "icons/icon128.png"'
print_info '  }'
echo
print_info "推奨設定（より良い表示のため）："
print_info "- 16, 48, 128は必須サイズ"
print_info "- 19, 38はツールバーアイコン用"
print_info "- 32はWindows等での表示用"