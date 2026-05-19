export type DownloadMediaKind = "video" | "audio";
export type DownloadSourceKind = "youtube" | "instagram";

export interface DownloadOptions {
  media?: DownloadMediaKind;
  outputDir?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  executor?: DownloadExecutor;
}

export interface DownloadExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type DownloadExecutor = (args: string[]) => Promise<DownloadExecutionResult>;

export interface DownloadResult {
  sourceKind: DownloadSourceKind;
  media: DownloadMediaKind;
  outputDir: string;
  outputPath: string;
  outputUri: string;
}
