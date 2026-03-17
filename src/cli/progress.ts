const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

const ANSI_RESET = "\u001b[0m";
const ANSI_CYAN = "\u001b[36m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_DIM = "\u001b[2m";
const ANSI_HIDE_CURSOR = "\u001b[?25l";
const ANSI_SHOW_CURSOR = "\u001b[?25h";
const ANSI_CLEAR_LINE = "\r\u001b[K";

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

const truncateDetail = (detail: string, maxLength: number = 50): string => {
  if (detail.length <= maxLength) return detail;
  return `${detail.slice(0, maxLength - 3)}...`;
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

    // Get terminal width, default to 80 if unavailable
    const terminalWidth = ("columns" in stream && typeof (stream as any).columns === "number")
      ? (stream as any).columns
      : 80;

    // Build content and ensure it fits in terminal width
    const maxWidth = Math.max(30, terminalWidth - 2);
    let content = `${frame} ${currentLabel}`;

    if (currentDetail) {
      const detailWithSpace = ` ${currentDetail}`;
      if (content.length + detailWithSpace.length <= maxWidth) {
        content += detailWithSpace;
      } else {
        // Truncate detail to fit
        const availableForDetail = maxWidth - content.length - 3; // -3 for "..."
        if (availableForDetail > 0) {
          content += ` ${currentDetail.slice(0, availableForDetail)}...`;
        }
      }
    }

    // Apply colors to the frame only
    const displayLine = content.replace(frame, spinner);
    stream.write(`${ANSI_CLEAR_LINE}${displayLine}`);
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
