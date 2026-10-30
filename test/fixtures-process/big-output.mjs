const chunk = "x".repeat(64 * 1024);
for (let written = 0; written < 5 * 1024 * 1024; written += chunk.length) process.stdout.write(chunk);
