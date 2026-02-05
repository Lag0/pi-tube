#!/bin/bash
set -e

# Pi-Tube Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash

REPO="Lag0/pi-tube"
INSTALL_DIR="/usr/local/bin"

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
    python3 -m pip install --user pipx
    python3 -m pipx ensurepath
    export PATH="$HOME/.local/bin:$PATH"
fi

# Install pi-tube
echo "📥 Installing pi-tube..."
pipx install "git+https://github.com/${REPO}.git" --force

echo ""
echo "✅ Pi-Tube installed successfully!"
echo ""
echo "Usage:"
echo "  pi-tube transcribe \"https://youtube.com/watch?v=...\" --provider deepgram"
echo "  pi-tube transcribe \"https://youtube.com/watch?v=...\" --provider groq"
echo "  pi-tube download \"https://youtube.com/watch?v=...\""
echo ""
echo "⚠️  Don't forget to set your API keys:"
echo "  export DEEPGRAM_API_KEY=your_key"
echo "  export GROQ_API_KEY=your_key"
