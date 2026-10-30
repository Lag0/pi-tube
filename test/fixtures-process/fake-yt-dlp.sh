#!/bin/sh
# Stands in for yt-dlp in the cancellation test: writes a partial file into the temp path, records its PID
# and a child's PID in the home path, then waits until it is killed.
home_dir=""
temp_dir=""
previous=""
for arg in "$@"; do
  if [ "$previous" = "-P" ]; then
    case "$arg" in
      home:*) home_dir="${arg#home:}" ;;
      temp:*) temp_dir="${arg#temp:}" ;;
    esac
  fi
  previous="$arg"
done
echo "partial" > "${temp_dir:-$home_dir}/Demo [abc].f401.mp4.part"
sleep 30 &
echo "$$ $!" > "$home_dir/pids.tmp"
mv "$home_dir/pids.tmp" "$home_dir/pids"
wait
