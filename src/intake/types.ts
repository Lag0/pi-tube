export type SourceClassification = "youtube" | "direct_url" | "local_file" | "unsupported_url";

export type ResolvedSource =
  | {
      kind: "youtube";
      originalInput: string;
      normalizedUrl: string;
      mediaUrl: string;
      title?: string;
    }
  | {
      kind: "direct_url";
      originalInput: string;
      normalizedUrl: string;
      mediaUrl: string;
      extension: string;
    }
  | {
      kind: "local_file";
      originalInput: string;
      absolutePath: string;
      extension: string;
    };
