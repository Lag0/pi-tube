#!/bin/bash
set -e

# Pi-Tube Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash

REPO="Lag0/pi-tube"
SKILL_DIR="$HOME/.agent/skills/pi-tube"

echo "🎬 Installing Pi-Tube (v5 with uv)..."

# Function to check if we have sudo access without password
can_sudo() {
    command -v sudo &> /dev/null && sudo -n true 2> /dev/null
}

# Check for ffmpeg (Still needed as system dependency)
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg not found. Installing..."
    if can_sudo; then
        sudo apt-get update && sudo apt-get install -y ffmpeg
    elif command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo "❌ ffmpeg not found and cannot install via sudo/brew."
        echo "   Please install ffmpeg manually or run as root."
        exit 1
    fi
fi

# Install uv (The blazing fast python package manager)
if ! command -v uv &> /dev/null; then
    echo "⚡ Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    
    # Add to current session path
    if [ -f "$HOME/.cargo/env" ]; then
        . "$HOME/.cargo/env"
    elif [ -f "$HOME/.local/bin/env" ]; then
         . "$HOME/.local/bin/env"
    else
        # Fallback path addition
        export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
    fi
else
    echo "✅ uv is already installed"
fi

# Verify uv installation
if ! command -v uv &> /dev/null; then
     echo "❌ Failed to install or find uv. Please install it manually: curl -LsSf https://astral.sh/uv/install.sh | sh"
     exit 1
fi

# Install pi-tube using uv tool
echo "📥 Installing pi-tube..."
# force reinstall to ensure latest version from git
uv tool install "git+https://github.com/${REPO}.git" --force --python 3.12

# Install yt-dlp as a standalone tool (ensures it's in PATH)
echo "📥 Installing yt-dlp..."
uv tool install yt-dlp --force

# Ensure the bin path is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# Install SKILL.md for AI agents
echo "🤖 Installing AI agent skill..."
mkdir -p "$SKILL_DIR"
curl -fsSL "https://raw.githubusercontent.com/${REPO}/master/.agent/skills/pi-tube/SKILL.md" -o "$SKILL_DIR/SKILL.md"

echo ""
echo "✅ Pi-Tube installed successfully!"
echo ""
echo "Usage:"
echo "  pi-tube deepgram \"https://youtube.com/watch?v=...\""
echo "  pi-tube groq \"https://youtube.com/watch?v=...\""
echo "  pi-tube dl \"https://youtube.com/watch?v=...\""
echo ""
echo "⚠️  Configure your API keys:"
echo "  pi-tube config set deepgram YOUR_KEY"
echo "  pi-tube config set groq YOUR_KEY"
echo ""
echo "🤖 AI agent skill installed at: $SKILL_DIR/SKILL.md"
