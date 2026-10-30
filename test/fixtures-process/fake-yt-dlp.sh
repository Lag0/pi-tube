#!/bin/sh
# Stands in for yt-dlp in the cancellation test: records its PID and a child's PID in the -P directory,
# then waits until it is killed.
out_dir=""
previous=""
for arg in "$@"; do
  if [ "$previous" = "-P" ]; then out_dir="$arg"; fi
  previous="$arg"
done
sleep 30 &
echo "$$ $!" > "$out_dir/pids.tmp"
mv "$out_dir/pids.tmp" "$out_dir/pids"
wait
