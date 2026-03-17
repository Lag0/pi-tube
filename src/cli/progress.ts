const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

const ANSI_RESET = "\u001b[0m";
const ANSI_CYAN = "\u001b[36m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_DIM = "\u001b[2m";
const ANSI_HIDE_CURSOR = "\u001b[?25l";
const ANSI_SHOW_CURSOR = "\u001b[?25h";
const ANSI_CLEAR_LINE = "\u001b[2K\r";

interface ProgressStep {
  label: string;
  detail?: string;
}

interface ProgressOptions {
  color: boolean;
  stream?: NodeJS.WriteStream;
}

interface ProgressReporter {
  update: (step: ProgressStep) => void;
  succeed: (outputPath: string, durationMs: number) => void;
  fail: (message: string) => void;
}

const paint = (value: string, code: string, enabled: boolean): string =>
  enabled ? `${code}${value}${ANSI_RESET}` : value;

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const truncatePath = (filePath: string, maxLength: number = 60): string => {
  if (filePath.length <= maxLength) return filePath;
  const homeDir = process.env.HOME ?? "";
  if (homeDir && filePath.startsWith(homeDir)) {
    return `~${filePath.slice(homeDir.length)}`;
  }
  return filePath;
};

/** Creates a no-op reporter for non-TTY or machine-readable output. */
const createSilentReporter = (): ProgressReporter => ({
  update: () => {},
  succeed: () => {},
  fail: () => {},
});

/**
 * Creates a progress reporter that displays a spinner and step info on stderr.
 * Keeps stdout clean for machine-readable output contracts.
 */
export const createProgressReporter = (options: ProgressOptions): ProgressReporter => {
  const stream = options.stream ?? process.stderr;
  const isTTY = "isTTY" in stream && stream.isTTY;

  if (!isTTY) return createSilentReporter();

  const { color } = options;
  let frameIndex = 0;
  let currentLabel = "";
  let currentDetail: string | undefined;
  let timer: ReturnType<typeof setInterval> | null = null;
  const completedSteps: string[] = [];

  const renderFrame = () => {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length] ?? "⠋";
    const spinner = paint(frame, ANSI_CYAN, color);
    const detail = currentDetail ? paint(` ${currentDetail}`, ANSI_DIM, color) : "";
    const line = `${spinner} ${currentLabel}${detail}`;
    // Pad to 120 chars then clear to handle terminal width variations
    const padded = line.padEnd(120);
    stream.write(`${ANSI_CLEAR_LINE}${padded}`);
    frameIndex += 1;
  };

  const startSpinner = () => {
    if (timer) return;
    stream.write(ANSI_HIDE_CURSOR);
    renderFrame();
    timer = setInterval(renderFrame, SPINNER_INTERVAL_MS);
  };

  const stopSpinner = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    stream.write(ANSI_CLEAR_LINE);
    stream.write(ANSI_SHOW_CURSOR);
  };

  const flushCompleted = () => {
    if (completedSteps.length > 0) {
      const check = paint("  \u2713", ANSI_GREEN, color);
      for (const step of completedSteps) {
        stream.write(`${check} ${paint(step, ANSI_DIM, color)}\n`);
      }
      completedSteps.length = 0;
    }
  };

  return {
    update(step: ProgressStep) {
      if (currentLabel) {
        completedSteps.push(currentLabel);
      }
      stopSpinner();
      flushCompleted();
      currentLabel = step.label;
      currentDetail = step.detail;
      startSpinner();
    },

    succeed(outputPath: string, durationMs: number) {
      if (currentLabel) {
        completedSteps.push(currentLabel);
      }
      stopSpinner();
      flushCompleted();

      const check = paint("\u2713", `${ANSI_BOLD}${ANSI_GREEN}`, color);
      const duration = paint(formatDuration(durationMs), ANSI_DIM, color);
      const displayPath = paint(truncatePath(outputPath), `${ANSI_BOLD}`, color);
      stream.write(`\n${check} Done ${duration}\n`);
      stream.write(`  ${displayPath}\n`);
    },

    fail(message: string) {
      stopSpinner();
      stream.write(`${ANSI_CLEAR_LINE}`);
      stream.write(`${paint("✗", "\u001b[31m", color)} ${message}\n`);
    },
  };
};
