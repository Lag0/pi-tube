import { createHelpTheme } from "./help-theme.ts";

interface HelpRow {
  term: string;
  description: string;
}

interface HelpGroup {
  title: string;
  rows: HelpRow[];
}

export interface HelpDocument {
  title: string;
  summary?: string;
  usage: string[];
  commandGroups?: HelpGroup[];
  options?: HelpRow[];
  examples?: string[];
  notes?: string[];
}

interface RenderHelpOptions {
  color: boolean;
}

function renderRows(rows: HelpRow[], styleTerm: (value: string) => string): string[] {
  if (rows.length === 0) {
    return [];
  }

  const maxWidth = rows.reduce((width, row) => Math.max(width, row.term.length), 0);
  return rows.map((row) => {
    const term = styleTerm(row.term.padEnd(maxWidth, " "));
    return `  ${term}  ${row.description}`;
  });
}

export function renderHelpDocument(document: HelpDocument, options: RenderHelpOptions): string {
  const theme = createHelpTheme({ color: options.color });
  const lines: string[] = [];

  lines.push(theme.title(document.title));
  if (document.summary) {
    lines.push(theme.muted(document.summary));
  }

  lines.push("");
  lines.push(theme.heading("Usage"));
  lines.push(...document.usage.map((line) => `  ${theme.command(line)}`));

  if (document.commandGroups && document.commandGroups.length > 0) {
    lines.push("");
    lines.push(theme.heading("Commands"));

    for (const group of document.commandGroups) {
      lines.push(`  ${theme.muted(group.title)}`);
      lines.push(...renderRows(group.rows, theme.command));
      lines.push("");
    }

    if (lines[lines.length - 1] === "") {
      lines.pop();
    }
  }

  if (document.options && document.options.length > 0) {
    lines.push("");
    lines.push(theme.heading("Global options"));
    lines.push(...renderRows(document.options, theme.option));
  }

  if (document.examples && document.examples.length > 0) {
    lines.push("");
    lines.push(theme.heading("Examples"));
    lines.push(...document.examples.map((example) => `  ${theme.command(example)}`));
  }

  if (document.notes && document.notes.length > 0) {
    lines.push("");
    lines.push(theme.heading("Notes"));
    lines.push(...document.notes.map((note) => `  ${theme.muted(note)}`));
  }

  return lines.join("\n");
}
