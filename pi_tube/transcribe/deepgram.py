"""Deepgram Nova 3 transcription provider."""

from pathlib import Path
from typing import Optional

from deepgram import DeepgramClient
from rich.console import Console

from ..config import Config
from .base import TranscriptionProvider, TranscriptionResult

console = Console()


class DeepgramProvider(TranscriptionProvider):
    """Transcription provider using Deepgram Nova 3."""
    
    name = "deepgram"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or Config.DEEPGRAM_API_KEY
        self._client: Optional[DeepgramClient] = None
    
    @property
    def client(self) -> DeepgramClient:
        """Get or create Deepgram client."""
        if self._client is None:
            if not self.api_key:
                raise ValueError(
                    "Deepgram API key not configured. "
                    "Run: pi-tube config set deepgram YOUR_API_KEY"
                )
            self._client = DeepgramClient(api_key=self.api_key)
        return self._client
    
    def is_configured(self) -> bool:
        """Check if Deepgram API key is set."""
        return bool(self.api_key)
    
    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """
        Transcribe audio using Deepgram Nova 3.
        
        Args:
            audio_path: Path to the audio file
            language: Optional language code (e.g., "pt-BR", "en-US")
        
        Returns:
            TranscriptionResult with the transcribed text
        """
        audio_path = Path(audio_path)
        
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        console.print(f"[blue]Transcribing with Deepgram Nova 3...[/blue]")
        
        # Read audio file
        with open(audio_path, "rb") as f:
            buffer_data = f.read()
        
        # Build transcription options
        options = {
            "request": buffer_data,
            "model": "nova-3",
            "smart_format": True,
            "punctuate": True,
            "paragraphs": True,
        }
        
        # Only set language if explicitly provided, otherwise let Deepgram detect
        if language:
            options["language"] = language
        else:
            options["detect_language"] = True
        
        # Perform transcription using the new SDK v5 API
        response = self.client.listen.v1.media.transcribe_file(**options)
        
        # Extract results
        if not response.results or not response.results.channels:
            raise ValueError("No transcription results returned")
        
        channel = response.results.channels[0]
        if not channel.alternatives:
            raise ValueError("No transcription alternatives returned")
        
        alternative = channel.alternatives[0]
        
        # Get detected language if available
        detected_language = language
        if hasattr(response.results, 'language') and response.results.language:
            detected_language = response.results.language
        
        console.print(f"[green]✓ Transcription complete[/green]")
        
        return TranscriptionResult(
            text=alternative.transcript,
            confidence=alternative.confidence,
            language=detected_language,
            provider=self.name,
        )

