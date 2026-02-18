#!/bin/bash
set -e

# Pi-Tube Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash

REPO="Lag0/pi-tube"
SKILL_DIR="$HOME/.agent/skills/pi-tube"
GUM_VERSION="0.17.0"
GUM=""
GUM_STATUS="skipped"
ID="pi-tube"

# Colors
ACCENT='\033[38;2;255;77;77m'       # coral
INFO='\033[38;2;136;146;176m'       # text-secondary
SUCCESS='\033[38;2;0;229;204m'      # cyan-bright
WARN='\033[38;2;255;176;32m'        # amber
ERROR='\033[38;2;230;57;70m'        # coral-mid
MUTED='\033[38;2;90;100;128m'       # text-muted
NC='\033[0m' # No Color

TMPFILES=()
cleanup_tmpfiles() {
    for f in "${TMPFILES[@]}"; do
        rm -rf "$f" 2>/dev/null || true
    done
}
trap cleanup_tmpfiles EXIT

mktempfile() {
    local f
    f="$(mktemp)"
    TMPFILES+=("$f")
    echo "$f"
}

# --- UI Functions ---

gum_is_tty() {
    [[ -t 1 ]]
}

ui_info() {
    if [[ -n "$GUM" ]]; then "$GUM" log --level info "$@"; else echo -e "${MUTED}·${NC} $*"; fi
}

ui_success() {
    if [[ -n "$GUM" ]]; then
        echo "$("$GUM" style --foreground "#00e5cc" --bold "✓") $*"
    else
        echo -e "${SUCCESS}✓${NC} $*"
    fi
}

ui_error() {
    if [[ -n "$GUM" ]]; then "$GUM" log --level error "$@"; else echo -e "${ERROR}✗${NC} $*"; fi
}

ui_section() {
    if [[ -n "$GUM" ]]; then
        "$GUM" style --bold --foreground "#ff4d4d" --padding "1 0" "$1"
    else
        echo -e "\n${ACCENT}${1}${NC}"
    fi
}

ui_kv() {
    local key="$1"
    local value="$2"
    if [[ -n "$GUM" ]]; then
        "$GUM" join --horizontal "$("$GUM" style --foreground "#5a6480" --width 20 "$key")" "$("$GUM" style --bold "$value")"
    else
        echo -e "${MUTED}${key}:${NC} ${value}"
    fi
}

ui_banner() {
    if [[ -n "$GUM" ]]; then
        local title="$("$GUM" style --foreground "#ff4d4d" --bold "📺 Pi-Tube Installer")"
        local tagline="$("$GUM" style --foreground "#8892b0" "Your personal YouTube archivist")"
        "$GUM" style --border rounded --border-foreground "#ff4d4d" --padding "1 2" "$(printf '%s\n%s' "$title" "$tagline")"
        echo ""
    else
        echo -e "${ACCENT}📺 Pi-Tube Installer${NC}"
    fi
}

# --- Gum Bootstrapping ---

gum_detect_os() {
    case "$(uname -s)" in
        Darwin) echo "Darwin" ;;
        Linux) echo "Linux" ;;
        *) echo "unsupported" ;;
    esac
}

gum_detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) echo "x86_64" ;;
        arm64|aarch64) echo "arm64" ;;
        *) echo "unknown" ;;
    esac
}

bootstrap_gum() {
    if command -v gum &> /dev/null; then
        GUM="gum"
        GUM_STATUS="found"
        return 0
    fi

    if ! gum_is_tty; then return 1; fi

    local os arch asset base gum_tmpdir gum_path
    os="$(gum_detect_os)"
    arch="$(gum_detect_arch)"
    
    [[ "$os" == "unsupported" || "$arch" == "unknown" ]] && return 1

    asset="gum_${GUM_VERSION}_${os}_${arch}.tar.gz"
    base="https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}"
    
    gum_tmpdir="$(mktemp -d)"
    TMPFILES+=("$gum_tmpdir")
    
    if curl -fsSL "${base}/${asset}" -o "$gum_tmpdir/$asset"; then
        tar -xzf "$gum_tmpdir/$asset" -C "$gum_tmpdir"
        gum_path="$(find "$gum_tmpdir" -type f -name gum | head -n1)"
        if [[ -x "$gum_path" ]]; then
            GUM="$gum_path"
            GUM_STATUS="bootstrapped"
            return 0
        fi
    fi
    return 1
}

# --- Main Logic ---

bootstrap_gum || true

ui_banner
ui_info "Initializing installation..."

OS="$(gum_detect_os)"
ARCH="$(gum_detect_arch)"

ui_section "Install Plan"
ui_kv "OS" "$OS"
ui_kv "Arch" "$ARCH"
ui_kv "Repo" "$REPO"
ui_kv "Method" "uv tool"

# 1. Dependency Checks
ui_section "1/3 Checking Dependencies"

if command -v ffmpeg &> /dev/null; then
    ui_success "ffmpeg found"
else
    ui_error "ffmpeg NOT found"
    echo "   Please install ffmpeg first:"
    echo "   MacOS: brew install ffmpeg"
    echo "   Linux: sudo apt install ffmpeg"
    exit 1
fi

if ! command -v uv &> /dev/null; then
    ui_info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    
    # Source env to make uv available immediately
    if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
    if [ -f "$HOME/.local/bin/env" ]; then . "$HOME/.local/bin/env"; fi
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

if command -v uv &> /dev/null; then
    ui_success "uv installed/found"
else
    ui_error "Failed to install uv"
    exit 1
fi

# 2. Install Pi-Tube
ui_section "2/3 Installing Pi-Tube"

ui_info "Installing package via uv tool..."
if uv tool install "git+https://github.com/${REPO}.git" --force --python 3.12 >/dev/null 2>&1; then
    ui_success "pi-tube installed"
else
    ui_error "Failed to install pi-tube"
    exit 1
fi

ui_info "Installing yt-dlp via uv tool..."
if uv tool install yt-dlp --force >/dev/null 2>&1; then
    ui_success "yt-dlp installed"
else
    ui_error "Failed to install yt-dlp"
    # Don't exit, pi-tube might still work if yt-dlp is in path otherwise
fi

# 3. Agent Skill
ui_section "3/3 Installing Agent Skill"

mkdir -p "$SKILL_DIR"
if curl -fsSL "https://raw.githubusercontent.com/${REPO}/master/.agent/skills/pi-tube/SKILL.md" -o "$SKILL_DIR/SKILL.md"; then
    ui_success "Skill installed to $SKILL_DIR"
else
    ui_error "Failed to download SKILL.md"
fi

# Footer
echo ""
if [[ -n "$GUM" ]]; then
    "$GUM" style --border rounded --border-foreground "#00e5cc" --padding "1 2" \
        "$("$GUM" style --foreground "#00e5cc" --bold "Installation Complete!")" \
        "Run 'pi-tube --help' to get started."
else
    echo "✅ Installation Complete! Run 'pi-tube --help' to get started."
fi
echo ""
