Synthetic container fixtures (FFmpeg 9.0.2; no downloaded media):

```sh
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.2 silence.m4a
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.2 silence.webm
ffmpeg -i silence.m4a -c:a copy -f mpegts silence.ts.bin
ffmpeg -i silence.webm -map 0:a -map 0:a -c copy two-tracks.webm
ffmpeg -i silence.m4a -c:a libmp3lame silence.mp3
ffmpeg -i silence.m4a -c:a alac alac.m4a
ffmpeg -i silence.m4a -c:a libvorbis vorbis.webm
ffmpeg -i silence.webm -c copy -f webm pipe:1 > streaming.webm
ffmpeg -f lavfi -i color=size=16x16:rate=10 -i silence.m4a -shortest -c:v libx264 -c:a copy muxed.mp4
ffmpeg -i muxed.mp4 -c copy -f mpegts muxed.ts.bin
ffmpeg -i muxed.mp4 -an -c copy video-only.mp4
ffmpeg -i muxed.mp4 -c:v libvpx-vp9 -c:a libopus muxed.webm
ffmpeg -i silence.webm -c copy silence.ogg
ffmpeg -i silence.m4a -c:a flac -metadata_header_padding 0 silence.flac
ffmpeg -i silence.m4a -c:a pcm_s16le silence.wav
ffmpeg -f lavfi -i anullsrc=r=48000:cl=stereo -t 0.1 -c:a libopus stereo.ogg
ffmpeg -f lavfi -i anullsrc=r=48000:cl=5.1 -t 0.1 -c:a libopus 5.1.ogg
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.1 -c:a pcm_s24le extensible.wav
```

In `extensible.wav`, set byte 38 to 16 after encoding: 16 valid bits in a 24-bit silent container.
