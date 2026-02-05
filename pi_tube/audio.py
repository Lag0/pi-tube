"""Audio extraction and conversion using ffmpeg."""

from pathlib import Path
from typing import Optional

import ffmpeg
from rich.console import Console

from .config import Config

console = Console()


def extract_audio(
    input_path: Path,
    output_path: Optional[Path] = None,
    sample_rate: int = Config.AUDIO_SAMPLE_RATE,
    channels: int = Config.AUDIO_CHANNELS,
) -> Path:
    """
    Extract and convert audio from a video/audio file to WAV format.
    
    Optimized for speech recognition: 16kHz mono WAV.
    
    Args:
        input_path: Path to input video/audio file
        output_path: Path for output WAV file (optional)
        sample_rate: Audio sample rate (default: 16000)
        channels: Number of audio channels (default: 1 for mono)
    
    Returns:
        Path to the extracted audio file
    """
    input_path = Path(input_path)
    
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    # Generate output path if not provided
    if output_path is None:
        temp_dir = Config.ensure_temp_dir()
        output_path = temp_dir / f"{input_path.stem}_audio.wav"
    
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    console.print(f"[blue]Extracting audio from:[/blue] {input_path.name}")
    
    try:
        # Use ffmpeg to extract and convert audio
        (
            ffmpeg
            .input(str(input_path))
            .output(
                str(output_path),
                acodec="pcm_s16le",
                ar=sample_rate,
                ac=channels,
            )
            .overwrite_output()
            .run(quiet=True)
        )
        
        console.print(f"[green]✓ Audio extracted:[/green] {output_path}")
        return output_path
        
    except ffmpeg.Error as e:
        console.print(f"[red]Error extracting audio:[/red] {e}")
        raise


def get_audio_info(input_path: Path) -> dict:
    """Get audio stream information from a media file."""
    try:
        probe = ffmpeg.probe(str(input_path))
        audio_streams = [
            stream for stream in probe["streams"]
            if stream["codec_type"] == "audio"
        ]
        
        if not audio_streams:
            return {}
        
        return audio_streams[0]
    except ffmpeg.Error:
        return {}


def is_audio_file(file_path: Path) -> bool:
    """Check if a file is an audio-only file."""
    file_path = Path(file_path)
    return file_path.suffix.lower() in Config.SUPPORTED_AUDIO_FORMATS


def is_video_file(file_path: Path) -> bool:
    """Check if a file is a video file."""
    file_path = Path(file_path)
    return file_path.suffix.lower() in Config.SUPPORTED_VIDEO_FORMATS


def needs_conversion(file_path: Path) -> bool:
    """
    Check if the audio file needs conversion for optimal transcription.
    
    Returns True if the file is not already in the optimal format
    (16kHz mono WAV).
    """
    file_path = Path(file_path)
    
    # Videos always need audio extraction
    if is_video_file(file_path):
        return True
    
    # Check if already WAV
    if file_path.suffix.lower() != ".wav":
        return True
    
    # Check audio properties
    info = get_audio_info(file_path)
    if not info:
        return True
    
    sample_rate = int(info.get("sample_rate", 0))
    channels = int(info.get("channels", 0))
    
    return sample_rate != Config.AUDIO_SAMPLE_RATE or channels != Config.AUDIO_CHANNELS
