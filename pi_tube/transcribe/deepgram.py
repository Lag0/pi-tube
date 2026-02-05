"""Deepgram Nova 3 transcription provider."""

from pathlib import Path
from typing import Optional

from deepgram import DeepgramClient
from deepgram.core.api_error import ApiError
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
            language: Optional language code (e.g., "pt", "en", "es")
        
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
            "diarize": True,
            "summarize": "v2",
        }
        
        # Only set language if explicitly provided, otherwise let Deepgram detect
        if language:
            options["language"] = language
        else:
            options["detect_language"] = True
        
        try:
            # Perform transcription using SDK v5 API
            response = self.client.listen.v1.media.transcribe_file(**options)
            
            # Extract results
            if not response.results or not response.results.channels:
                raise ValueError("No transcription results returned")
            
            channel = response.results.channels[0]
            if not channel.alternatives:
                raise ValueError("No transcription alternatives returned")
            
            alternative = channel.alternatives[0]
            
            # Function to format transcript with speaker labels
            final_transcript = ""
            
            # Add summary if available
            if hasattr(response.results, 'summary') and response.results.summary:
                summary_text = response.results.summary.short
                final_transcript += f"📝 SUMMARY:\n{summary_text}\n\n{'='*40}\n\n"
            
            # Format paragraphs with speakers
            if hasattr(alternative, 'paragraphs') and alternative.paragraphs:
                for paragraph in alternative.paragraphs.paragraphs:
                    speaker = paragraph.speaker
                    # Format sentences for better readability
                    formatted_text = ""
                    for sentence in paragraph.sentences:
                        formatted_text += sentence.text + " "
                    
                    final_transcript += f"[Speaker {speaker}]: {formatted_text.strip()}\n\n"
            else:
                # Fallback to plain transcript if no paragraphs
                final_transcript += alternative.transcript
            
            # Get detected language if available
            detected_language = language or "auto"
            if hasattr(channel, 'detected_language') and channel.detected_language:
                detected_language = channel.detected_language
            
            console.print(f"[green]✓ Transcription complete (Diarization + Summary)[/green]")
            
            return TranscriptionResult(
                text=final_transcript.strip(),
                confidence=alternative.confidence,
                language=detected_language,
                provider=self.name,
            )
            
        except ApiError as e:
            # Handle specific API errors
            if e.status_code == 401:
                raise ValueError("Invalid Deepgram API key. Check your configuration.")
            elif e.status_code == 429:
                raise ValueError("Rate limit exceeded. Please try again later.")
            elif e.status_code >= 500:
                raise ValueError(f"Deepgram server error. Please try again. (Status {e.status_code})")
            else:
                raise ValueError(f"Deepgram API error: {e.body}")
