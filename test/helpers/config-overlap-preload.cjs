// Preload only in the two acceptance-test children, before the CLI imports fs/promises.
const fs = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");
const file = process.env.PI_TUBE_CONFIG_PATH;
if (process.env.TEST_WRITER === "A") {
  const read = fs.readFile;
  fs.readFile = async (...args) => {
    const result = await read(...args);
    if (args[0] === file) {
      await fs.writeFile(`${file}.paused`, "");
      while (!(await fs.stat(`${file}.release`).catch(() => false))) await delay(10);
    }
    return result;
  };
} else {
  const mkdir = fs.mkdir;
  fs.mkdir = async (...args) => {
    try {
      return await mkdir(...args);
    } catch (error) {
      if (args[0] === `${file}.lock` && error.code === "EEXIST") await fs.writeFile(`${file}.contended`, "");
      throw error;
    }
  };
}
