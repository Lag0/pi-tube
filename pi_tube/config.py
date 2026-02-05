"""Configuration management for Pi-Tube."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Load config from ~/.config/pi-tube/config
_config_file = Path.home() / ".config" / "pi-tube" / "config"
if _config_file.exists():
    for line in _config_file.read_text().strip().split("\n"):
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            if key not in os.environ:  # Don't override env vars
                os.environ[key] = value


class Config:
    """Application configuration."""
    
    # API Keys
    DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    
    # Default paths
    DEFAULT_OUTPUT_DIR: Path = Path.cwd() / "output"
    DEFAULT_TEMP_DIR: Path = Path("/tmp/pi-tube")
    
    # Audio settings for transcription (optimized for speech recognition)
    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_CHANNELS: int = 1
    AUDIO_FORMAT: str = "wav"
    
    # Supported input formats
    SUPPORTED_VIDEO_FORMATS: set = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv"}
    SUPPORTED_AUDIO_FORMATS: set = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"}
    
    @classmethod
    def get_supported_formats(cls) -> set:
        """Get all supported media formats."""
        return cls.SUPPORTED_VIDEO_FORMATS | cls.SUPPORTED_AUDIO_FORMATS
    
    @classmethod
    def ensure_temp_dir(cls) -> Path:
        """Ensure temp directory exists and return path."""
        cls.DEFAULT_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        return cls.DEFAULT_TEMP_DIR
