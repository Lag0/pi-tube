import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

function readSkillFile(path: string): string {
  return readFileSync(path, "utf8");
}

describe("pi-tube skill docs", () => {
  test("document the v2 command surface instead of legacy config/provider-status flows", () => {
    const skill = readSkillFile("skills/pi-tube/SKILL.md");
    const install = readSkillFile("skills/pi-tube/rules/install.md");
    const security = readSkillFile("skills/pi-tube/rules/security.md");
    const combined = [skill, install, security].join("\n");

    expect(combined).toContain("pi-tube auth login <deepgram|groq|elevenlabs>");
    expect(combined).toContain("pi-tube auth status");
    expect(combined).toContain("pi-tube defaults provider <deepgram|groq|elevenlabs>");
    expect(combined).toContain("pi-tube transcribe <input>");
    expect(combined).toContain("pi-tube download <url>");
    expect(combined).not.toContain("pi-tube provider-status");
    expect(combined).not.toContain("pi-tube <input>");
    expect(combined).not.toContain("config provider env");
  });
});
