"""YouTube video downloader using yt-dlp."""

import re
from pathlib import Path
from typing import Optional

import yt_dlp
from rich.console import Console

from .config import Config

console = Console()


def is_youtube_url(url: str) -> bool:
    """Check if the given string is a valid YouTube URL."""
    youtube_patterns = [
        r"(https?://)?(www\.)?youtube\.com/watch\?v=[\w-]+",
        r"(https?://)?(www\.)?youtu\.be/[\w-]+",
        r"(https?://)?(www\.)?youtube\.com/shorts/[\w-]+",
    ]
    return any(re.match(pattern, url) for pattern in youtube_patterns)


def get_video_info(url: str) -> dict:
    """Get video metadata without downloading."""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def download_audio(
    url: str,
    output_dir: Optional[Path] = None,
    filename: Optional[str] = None,
) -> Path:
    """
    Download audio from a YouTube video.
    
    Args:
        url: YouTube video URL
        output_dir: Directory to save the audio file
        filename: Custom filename (without extension)
    
    Returns:
        Path to the downloaded audio file
    """
    output_dir = output_dir or Config.ensure_temp_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Get video info first for the title
    if not filename:
        info = get_video_info(url)
        filename = info.get("title", "audio")
        # Sanitize filename
        filename = re.sub(r'[<>:"/\\|?*]', "_", filename)
    
    output_template = str(output_dir / f"{filename}.%(ext)s")
    
    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "outtmpl": output_template,
        "quiet": False,
        "no_warnings": False,
    }
    
    console.print(f"[blue]Downloading audio from:[/blue] {url}")
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    # Find the downloaded file
    output_path = output_dir / f"{filename}.mp3"
    
    if output_path.exists():
        console.print(f"[green]✓ Downloaded:[/green] {output_path}")
        return output_path
    
    # If mp3 not found, look for other formats
    for ext in ["m4a", "webm", "opus"]:
        alt_path = output_dir / f"{filename}.{ext}"
        if alt_path.exists():
            console.print(f"[green]✓ Downloaded:[/green] {alt_path}")
            return alt_path
    
    raise FileNotFoundError(f"Downloaded file not found in {output_dir}")


def download_video(
    url: str,
    output_dir: Optional[Path] = None,
    filename: Optional[str] = None,
) -> Path:
    """
    Download video from YouTube.
    
    Args:
        url: YouTube video URL
        output_dir: Directory to save the video file
        filename: Custom filename (without extension)
    
    Returns:
        Path to the downloaded video file
    """
    output_dir = output_dir or Config.ensure_temp_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if not filename:
        info = get_video_info(url)
        filename = info.get("title", "video")
        filename = re.sub(r'[<>:"/\\|?*]', "_", filename)
    
    output_template = str(output_dir / f"{filename}.%(ext)s")
    
    ydl_opts = {
        "format": "best[ext=mp4]/best",
        "outtmpl": output_template,
        "quiet": False,
        "no_warnings": False,
    }
    
    console.print(f"[blue]Downloading video from:[/blue] {url}")
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    # Find the downloaded file
    for ext in ["mp4", "webm", "mkv"]:
        output_path = output_dir / f"{filename}.{ext}"
        if output_path.exists():
            console.print(f"[green]✓ Downloaded:[/green] {output_path}")
            return output_path
    
    raise FileNotFoundError(f"Downloaded file not found in {output_dir}")
