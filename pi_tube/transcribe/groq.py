"""Groq Whisper transcription provider."""

from pathlib import Path
from typing import Optional

from groq import Groq
from rich.console import Console

from ..config import Config
from .base import TranscriptionProvider, TranscriptionResult

console = Console()


class GroqProvider(TranscriptionProvider):
    """Transcription provider using Groq Whisper Large V3."""
    
    name = "groq"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or Config.GROQ_API_KEY
        self._client: Optional[Groq] = None
    
    @property
    def client(self) -> Groq:
        """Get or create Groq client."""
        if self._client is None:
            if not self.api_key:
                raise ValueError(
                    "Groq API key not configured. "
                    "Set GROQ_API_KEY environment variable."
                )
            self._client = Groq(api_key=self.api_key)
        return self._client
    
    def is_configured(self) -> bool:
        """Check if Groq API key is set."""
        return bool(self.api_key)
    
    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio using Groq Whisper Large V3.
        
        Args:
            audio_path: Path to the audio file
            language: Optional language code (e.g., "pt", "en")
        
        Returns:
            TranscriptionResult with the transcribed text
        """
        audio_path = Path(audio_path)
        
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        console.print(f"[blue]Transcribing with Groq Whisper Large V3...[/blue]")
        
        # Read audio file
        with open(audio_path, "rb") as audio_file:
            # Perform transcription
            transcription = self.client.audio.transcriptions.create(
                file=(audio_path.name, audio_file.read()),
                model="whisper-large-v3-turbo",
                language=language or "pt",
                response_format="verbose_json",
            )
        
        # Extract text
        text = transcription.text
        duration = getattr(transcription, "duration", None)
        detected_language = getattr(transcription, "language", language)
        
        console.print(f"[green]✓ Transcription complete[/green]")
        
        return TranscriptionResult(
            text=text,
            duration=duration,
            language=detected_language,
            provider=self.name,
        )
