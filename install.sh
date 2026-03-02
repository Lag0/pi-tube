#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/Lag0/pi-tube.git"
INSTALL_DIR="${PI_TUBE_INSTALL_DIR:-$HOME/.local/share/pi-tube}"
BIN_DIR="${PI_TUBE_BIN_DIR:-$HOME/.local/bin}"
WRAPPER_PATH="$BIN_DIR/pi-tube"

log() {
  printf '%s\n' "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "[ERROR] Missing required command: $1"
    exit 1
  fi
}

install_bun_if_needed() {
  if command -v bun >/dev/null 2>&1; then
    return
  fi

  log "[INFO] Bun not found. Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash

  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1; then
    log "[ERROR] Bun installation finished but bun is still unavailable in PATH."
    log "[ACTION] Add ~/.bun/bin to your PATH, then rerun this installer."
    exit 1
  fi
}

checkout_repo() {
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR/.git" ]; then
    log "[INFO] Updating existing pi-tube checkout..."
    git -C "$INSTALL_DIR" fetch --quiet origin
    git -C "$INSTALL_DIR" pull --ff-only --quiet origin master || true
  else
    log "[INFO] Cloning pi-tube to $INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1
  fi
}

install_dependencies() {
  log "[INFO] Installing Bun dependencies..."
  cd "$INSTALL_DIR"
  bun install >/dev/null 2>&1
}

create_wrapper() {
  mkdir -p "$BIN_DIR"

  cat >"$WRAPPER_PATH" <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${PI_TUBE_INSTALL_DIR:-$HOME/.local/share/pi-tube}"
exec bun run --bun "$INSTALL_DIR/bin/pi-tube.ts" "$@"
WRAP

  chmod +x "$WRAPPER_PATH"
}

print_finish() {
  log ""
  log "[OK] pi-tube installed (Bun + TypeScript runtime)."
  log "[OK] Canonical command: pi-tube --help"
  log "[INFO] Deferred features are labeled as coming soon in help output."

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      log "[ACTION] Add $BIN_DIR to PATH to use pi-tube globally:"
      log "         export PATH=\"$BIN_DIR:\$PATH\""
      ;;
  esac
}

need_cmd curl
need_cmd git
install_bun_if_needed
checkout_repo
install_dependencies
create_wrapper
print_finish
