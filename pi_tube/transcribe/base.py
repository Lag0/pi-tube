"""Base transcription provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class TranscriptionResult:
    """Result from a transcription operation."""
    
    text: str
    duration: Optional[float] = None
    language: Optional[str] = None
    confidence: Optional[float] = None
    provider: Optional[str] = None
    
    def save(self, output_path: Path) -> Path:
        """Save transcription to a text file."""
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(self.text, encoding="utf-8")
        return output_path


class TranscriptionProvider(ABC):
    """Abstract base class for transcription providers."""
    
    name: str = "base"
    
    @abstractmethod
    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe an audio file.
        
        Args:
            audio_path: Path to the audio file
            language: Optional language code (e.g., "pt", "en")
        
        Returns:
            TranscriptionResult with the transcribed text
        """
        pass
    
    @abstractmethod
    def is_configured(self) -> bool:
        """Check if the provider is properly configured (API key set)."""
        pass
