// C0 controls (line breaks and ESC included), DEL and C1 controls: what a terminal or a Markdown line acts on.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;

/**
 * Untrusted text (a title, a chapter, a description) as one printable line: control characters, line breaks
 * included, become a space, so the text cannot drive a terminal or forge Markdown lines.
 */
export const toSafeLine = (value: string): string =>
  value.replace(CONTROL_CHARACTERS, " ").replace(/ {2,}/g, " ").trim();
