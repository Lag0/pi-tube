export type SourceClassification = "youtube" | "instagram" | "direct_url" | "local_file" | "unsupported_url";

export type ResolvedSource =
  | {
      kind: "youtube";
      originalInput: string;
      normalizedUrl: string;
      mediaUrl: string;
      title?: string;
      publishedAt?: string;
      description?: string;
      descriptionLinks?: string[];
    }
  | {
      kind: "instagram";
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

/** Audio handed to a speech-to-text provider: a local file or a URL the provider fetches itself. */
export type AudioInput =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "url"; readonly url: string };
