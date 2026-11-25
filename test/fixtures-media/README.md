Synthetic container fixtures (FFmpeg 9.0.2; no downloaded media):

```sh
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.2 silence.m4a
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.2 silence.webm
ffmpeg -i silence.m4a -c:a copy -f mpegts silence.ts.bin
ffmpeg -i silence.webm -map 0:a -map 0:a -c copy two-tracks.webm
```
