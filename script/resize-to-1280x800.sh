#!/bin/bash

# 画像を1280x800サイズに調整するツール
# 縦横比を保持して拡大/縮小し、余白を白で埋める

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
    echo "画像を1280x800サイズに調整するツール"
    echo
    echo "使用方法:"
    echo "  $0 [オプション] <入力画像ファイル...>"
    echo
    echo "オプション:"
    echo "  -o <ディレクトリ>  出力ディレクトリを指定"
    echo "  -y                既存ファイルを確認なしで上書き"
    echo "  -h                このヘルプを表示"
    echo
    echo "例:"
    echo "  $0 input.jpg"
    echo "  $0 *.jpg *.png"
    echo "  $0 -o output/ images/*.jpg"
    echo "  $0 -y photo1.jpg photo2.png"
    echo "  $0 images/"
    echo
    echo "機能:"
    echo "  - 複数ファイルの一括処理"
    echo "  - ディレクトリ指定で中の画像ファイルを自動検出"
    echo "  - 縦横比を保持して1280x800に収まるようにリサイズ"
    echo "  - 透明背景で出力（PNG形式）"
    echo "  - 元画像が大きい場合は縮小、小さい場合は拡大"
    echo
    echo "対応形式:"
    echo "  - 入力: JPG, JPEG, PNG, GIF, BMP, TIFF, WEBP等"
    echo "  - 出力: PNG形式（透明背景）"
    echo
    echo "注意:"
    echo "  - ImageMagickが必要です"
    echo "  - インストール: brew install imagemagick"
}

# オプション解析
OUTPUT_DIR=""
FORCE_OVERWRITE=false

while getopts "o:yh" opt; do
    case $opt in
        o)
            OUTPUT_DIR="$OPTARG"
            ;;
        y)
            FORCE_OVERWRITE=true
            ;;
        h)
            show_usage
            exit 0
            ;;
        \?)
            print_error "無効なオプション: -$OPTARG"
            show_usage
            exit 1
            ;;
    esac
done

shift $((OPTIND-1))

# 引数チェック
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

# 出力ディレクトリの作成
if [ -n "$OUTPUT_DIR" ]; then
    if [ ! -d "$OUTPUT_DIR" ]; then
        print_info "出力ディレクトリを作成: $OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
    fi
fi

# ImageMagickの存在確認（magick優先、convertフォールバック）
MAGICK_CMD=""
IDENTIFY_CMD=""
if command -v magick &> /dev/null; then
    MAGICK_CMD="magick"
    IDENTIFY_CMD="magick identify"
elif command -v convert &> /dev/null; then
    MAGICK_CMD="convert"
    IDENTIFY_CMD="identify"
else
    print_error "ImageMagickが見つかりません。"
    print_info "インストール方法:"
    print_info "  macOS: brew install imagemagick"
    print_info "  Ubuntu: sudo apt-get install imagemagick"
    exit 1
fi
print_info "使用コマンド: $MAGICK_CMD"

# 画像ファイルかどうかを判定する関数
is_image_file() {
    local file="$1"
    local extension="${file##*.}"
    local extension_lower=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
    case "$extension_lower" in
        jpg|jpeg|png|gif|bmp|tiff|tif|webp)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# ファイルリストを収集する関数
collect_files() {
    local files=()
    
    for arg in "$@"; do
        if [ -f "$arg" ]; then
            # ファイルが存在する場合
            if is_image_file "$arg"; then
                files+=("$arg")
            else
                print_warning "画像ファイルではありません: $arg"
            fi
        elif [ -d "$arg" ]; then
            # ディレクトリの場合、中の画像ファイルを検索
            print_info "ディレクトリ内の画像ファイルを検索: $arg"
            while IFS= read -r -d '' file; do
                files+=("$file")
            done < <(find "$arg" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.bmp" -o -iname "*.tiff" -o -iname "*.tif" -o -iname "*.webp" \) -print0)
        else
            print_warning "ファイルまたはディレクトリが見つかりません: $arg"
        fi
    done
    
    printf '%s\n' "${files[@]}"
}

# 出力ファイル名を生成する関数
generate_output_filename() {
    local input_file="$1"
    local basename="${input_file%.*}"
    local filename=$(basename "$basename")
    
    if [ -n "$OUTPUT_DIR" ]; then
        echo "${OUTPUT_DIR}/${filename}_1280x800.png"
    else
        echo "${basename}_1280x800.png"
    fi
}

# ファイルリストを収集
INPUT_FILES=()
while IFS= read -r file; do
    [ -n "$file" ] && INPUT_FILES+=("$file")
done < <(collect_files "$@")

if [ ${#INPUT_FILES[@]} -eq 0 ]; then
    print_error "処理対象の画像ファイルが見つかりません。"
    exit 1
fi

print_info "処理対象ファイル数: ${#INPUT_FILES[@]}"

# 統計変数
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0

# 各ファイルを処理
for INPUT_FILE in "${INPUT_FILES[@]}"; do
    echo
    print_info "処理中: $INPUT_FILE"
    
    # 出力ファイル名を生成
    OUTPUT_FILE=$(generate_output_filename "$INPUT_FILE")
    
    # 既存ファイルの確認
    if [ -f "$OUTPUT_FILE" ] && [ "$FORCE_OVERWRITE" = false ]; then
        print_warning "既存ファイルが存在します: $OUTPUT_FILE"
        read -p "上書きしますか？ (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "スキップしました: $INPUT_FILE"
            ((SKIPPED_COUNT++))
            continue
        fi
    fi

    # 元画像の情報を取得
    ORIGINAL_INFO=$($IDENTIFY_CMD "$INPUT_FILE" 2>/dev/null)
    if [ $? -eq 0 ]; then
        ORIGINAL_SIZE=$(echo "$ORIGINAL_INFO" | awk '{print $3}')
        print_info "  元画像サイズ: $ORIGINAL_SIZE"
        
        # サイズを分解
        ORIGINAL_WIDTH=$(echo "$ORIGINAL_SIZE" | cut -d'x' -f1)
        ORIGINAL_HEIGHT=$(echo "$ORIGINAL_SIZE" | cut -d'x' -f2 | cut -d'+' -f1)
        
        # 元画像と目標サイズの比較
        if [ "$ORIGINAL_WIDTH" -gt 1280 ] || [ "$ORIGINAL_HEIGHT" -gt 800 ]; then
            print_info "  処理: 縮小してリサイズ"
        elif [ "$ORIGINAL_WIDTH" -lt 1280 ] && [ "$ORIGINAL_HEIGHT" -lt 800 ]; then
            print_info "  処理: 拡大してリサイズ"
        else
            print_info "  処理: サイズ調整"
        fi
    fi
    
    # ImageMagickで画像をリサイズ
    if $MAGICK_CMD "$INPUT_FILE" \
        -resize 1280x800 \
        -background transparent \
        -gravity center \
        -extent 1280x800 \
        "$OUTPUT_FILE" 2>/dev/null; then
        
        print_success "  ✓ 完了: $OUTPUT_FILE"
        ((SUCCESS_COUNT++))
        
        # 出力ファイルの情報を表示
        OUTPUT_INFO=$($IDENTIFY_CMD "$OUTPUT_FILE" 2>/dev/null)
        if [ $? -eq 0 ]; then
            FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
            print_info "  ファイルサイズ: $FILE_SIZE"
        fi
        
    else
        print_error "  ✗ 失敗: $INPUT_FILE"
        ((FAILED_COUNT++))
    fi
done

echo
print_success "処理が完了しました！"
print_info "結果:"
print_info "  成功: ${SUCCESS_COUNT}件"
if [ $FAILED_COUNT -gt 0 ]; then
    print_warning "  失敗: ${FAILED_COUNT}件"
fi
if [ $SKIPPED_COUNT -gt 0 ]; then
    print_info "  スキップ: ${SKIPPED_COUNT}件"
fi

if [ -n "$OUTPUT_DIR" ]; then
    print_info "出力ディレクトリ: $OUTPUT_DIR"
fi