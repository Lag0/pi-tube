export interface HelpTheme {
  title(value: string): string;
  heading(value: string): string;
  command(value: string): string;
  option(value: string): string;
  muted(value: string): string;
}

interface ThemeOptions {
  color: boolean;
}

const ANSI_RESET = "\u001b[0m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_CYAN = "\u001b[36m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_GRAY = "\u001b[90m";

function paint(value: string, colorCode: string, enabled: boolean): string {
  if (!enabled) {
    return value;
  }
  return `${colorCode}${value}${ANSI_RESET}`;
}

export function createHelpTheme(options: ThemeOptions): HelpTheme {
  const colorEnabled = options.color;

  return {
    title(value: string): string {
      return paint(value, `${ANSI_BOLD}${ANSI_CYAN}`, colorEnabled);
    },
    heading(value: string): string {
      return paint(value, `${ANSI_BOLD}${ANSI_YELLOW}`, colorEnabled);
    },
    command(value: string): string {
      return paint(value, ANSI_CYAN, colorEnabled);
    },
    option(value: string): string {
      return paint(value, ANSI_YELLOW, colorEnabled);
    },
    muted(value: string): string {
      return paint(value, ANSI_GRAY, colorEnabled);
    },
  };
}
