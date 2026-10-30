process.stdout.write("out");
process.stderr.write("err");
process.exit(Number(process.argv[2] ?? 0));
