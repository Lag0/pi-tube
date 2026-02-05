#!/bin/bash
set -e

# Pi-Tube Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash

REPO="Lag0/pi-tube"
SKILL_DIR="$HOME/.agent/skills/pi-tube"

echo "🎬 Installing Pi-Tube (v4)..."

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

# Function to check if we have sudo access without password
can_sudo() {
    command -v sudo &> /dev/null && sudo -n true 2> /dev/null
}

# Check for ffmpeg
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

# Check for git (required for pipx install git+url)
if ! command -v git &> /dev/null; then
    echo "⚠️  git not found. Installing..."
    if can_sudo; then
        sudo apt-get update && sudo apt-get install -y git
    elif command -v brew &> /dev/null; then
        brew install git
    else
        echo "❌ git not found and cannot install via sudo/brew."
        echo "   Please install git manually."
        exit 1
    fi
fi

# Install pipx if not available
if ! command -v pipx &> /dev/null; then
    echo "📦 Installing pipx..."
    INSTALLED_PIPX=false
    
    # Try apt-get ONLY if we are root or have passwordless sudo
    if [ "$EUID" -eq 0 ] || can_sudo; then
        if command -v apt-get &> /dev/null; then
            echo "   Attempting install via system package manager..."
            
            # Use sudo if not root
            CMD_PREFIX=""
            [ "$EUID" -ne 0 ] && CMD_PREFIX="sudo"
            
            if $CMD_PREFIX apt-get update && $CMD_PREFIX apt-get install -y pipx; then
                pipx ensurepath || true
                INSTALLED_PIPX=true
            else
                echo "⚠️  System install failed. Falling back to user install..."
            fi
        fi
    fi

    # Try brew if on macOS/Linuxbrew
    if [ "$INSTALLED_PIPX" = false ] && command -v brew &> /dev/null; then
        echo "   Attempting install via brew..."
        if brew install pipx; then
            pipx ensurepath || true
            INSTALLED_PIPX=true
        fi
    fi

    # Fallback to pip user install (Agent friendly 🤖)
    if [ "$INSTALLED_PIPX" = false ]; then
        echo "ℹ️  Performing user-local installation (Agent friendly mode)..."
        
        # Try standard user install first
        if python3 -m pip install --user pipx > /dev/null 2>&1; then
            echo "✅ pipx installed via pip --user"
        else
            echo "⚠️  Standard pip install failed (likely PEP 668). forcing --break-system-packages..."
            # This is safe for --user installs as it doesn't break system packages, just allows user site-packages to coexist
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
