#!/bin/bash
set -e

# Pi-Tube Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash

REPO="Lag0/pi-tube"
SKILL_DIR="$HOME/.agent/skills/pi-tube"

echo "🎬 Installing Pi-Tube..."

# Check for Python 3.11+
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Please install Python 3.11+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if [[ $(echo "$PYTHON_VERSION < 3.11" | bc -l) -eq 1 ]]; then
    echo "❌ Python 3.11+ is required. Found: $PYTHON_VERSION"
    exit 1
fi

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg not found. Installing..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y ffmpeg
    elif command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo "❌ Please install ffmpeg manually"
        exit 1
    fi
fi

# Install pipx if not available
if ! command -v pipx &> /dev/null; then
    echo "📦 Installing pipx..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y pipx
        pipx ensurepath || true
    elif command -v brew &> /dev/null; then
        brew install pipx
        pipx ensurepath || true
    else
        echo "⚠️  System package manager not found. Attempting pip install..."
        if ! python3 -m pip install --user pipx; then
            echo "⚠️  Standard pip install failed. Retrying with --break-system-packages..."
            python3 -m pip install --user pipx --break-system-packages
        fi
        python3 -m pipx ensurepath
    fi
    export PATH="$HOME/.local/bin:$PATH"
fi

# Install pi-tube
echo "📥 Installing pi-tube..."
pipx install "git+https://github.com/${REPO}.git" --force

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
