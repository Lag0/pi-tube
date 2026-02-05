"""Pi-Tube CLI interface."""

from enum import Enum
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from . import __version__
from .audio import extract_audio, is_audio_file, is_video_file, needs_conversion
from .config import Config
from .downloader import download_audio, is_youtube_url
from .transcribe import DeepgramProvider, GroqProvider

app = typer.Typer(
    name="pi-tube",
    help="YouTube video download and transcription CLI",
    add_completion=True,
)
console = Console()


class Provider(str, Enum):
    """Available transcription providers."""
    deepgram = "deepgram"
    groq = "groq"


def get_provider(provider: Provider):
    """Get the transcription provider instance."""
    if provider == Provider.deepgram:
        return DeepgramProvider()
    elif provider == Provider.groq:
        return GroqProvider()
    else:
        raise ValueError(f"Unknown provider: {provider}")


@app.command()
def transcribe(
    input_source: str = typer.Argument(
        ...,
        help="YouTube URL or path to local video/audio file",
    ),
    provider: Provider = typer.Option(
        Provider.groq,
        "--provider", "-p",
        help="Transcription provider to use",
    ),
    output: Optional[Path] = typer.Option(
        None,
        "--output", "-o",
        help="Output path for transcription (default: same as input with .txt)",
    ),
    language: Optional[str] = typer.Option(
        None,
        "--language", "-l",
        help="Language code (e.g., 'pt' for Portuguese, 'en' for English)",
    ),
    keep_audio: bool = typer.Option(
        False,
        "--keep-audio", "-k",
        help="Keep downloaded/extracted audio file",
    ),
):
    """
    Transcribe audio from YouTube URL or local file.
    
    Examples:
    
        pi-tube transcribe "https://youtube.com/watch?v=..." --provider deepgram
        
        pi-tube transcribe /path/to/video.mp4 --provider groq
        
        pi-tube transcribe audio.mp3 -o transcript.txt
    """
    try:
        # Get transcription provider
        transcriber = get_provider(provider)
        
        if not transcriber.is_configured():
            console.print(
                f"[red]Error:[/red] {provider.value} API key not configured.\n"
                f"Set {provider.value.upper()}_API_KEY environment variable."
            )
            raise typer.Exit(1)
        
        audio_path: Path
        cleanup_audio = False
        
        # Handle YouTube URL
        if is_youtube_url(input_source):
            console.print(Panel(
                f"[bold]Processing YouTube video[/bold]\n{input_source}",
                title="Pi-Tube",
                border_style="blue",
            ))
            audio_path = download_audio(input_source)
            cleanup_audio = not keep_audio
        
        # Handle local file
        else:
            input_path = Path(input_source)
            
            if not input_path.exists():
                console.print(f"[red]Error:[/red] File not found: {input_path}")
                raise typer.Exit(1)
            
            if not (is_audio_file(input_path) or is_video_file(input_path)):
                console.print(
                    f"[red]Error:[/red] Unsupported file format: {input_path.suffix}\n"
                    f"Supported formats: {Config.get_supported_formats()}"
                )
                raise typer.Exit(1)
            
            console.print(Panel(
                f"[bold]Processing local file[/bold]\n{input_path}",
                title="Pi-Tube",
                border_style="blue",
            ))
            
            # Extract/convert audio if needed
            if needs_conversion(input_path):
                audio_path = extract_audio(input_path)
                cleanup_audio = not keep_audio
            else:
                audio_path = input_path
        
        # Perform transcription
        result = transcriber.transcribe(audio_path, language=language)
        
        # Determine output path
        if output is None:
            if is_youtube_url(input_source):
                output = audio_path.with_suffix(".txt")
            else:
                output = Path(input_source).with_suffix(".txt")
        
        # Save transcription
        result.save(output)
        console.print(f"[green]✓ Saved transcription:[/green] {output}")
        
        # Cleanup temporary audio
        if cleanup_audio and audio_path.exists():
            audio_path.unlink()
            console.print(f"[dim]Cleaned up temporary audio file[/dim]")
        
        # Show summary
        console.print(Panel(
            f"[bold green]Transcription Complete[/bold green]\n\n"
            f"Provider: {result.provider}\n"
            f"Language: {result.language or 'auto'}\n"
            f"Output: {output}\n"
            f"Length: {len(result.text)} characters",
            border_style="green",
        ))
        
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)


@app.command()
def download(
    url: str = typer.Argument(
        ...,
        help="YouTube URL to download",
    ),
    output: Optional[Path] = typer.Option(
        None,
        "--output", "-o",
        help="Output directory for downloaded file",
    ),
    audio_only: bool = typer.Option(
        True,
        "--audio-only/--video",
        help="Download audio only (default) or full video",
    ),
):
    """
    Download audio/video from YouTube.
    
    Examples:
    
        pi-tube download "https://youtube.com/watch?v=..." --output ./downloads
        
        pi-tube download "https://youtube.com/watch?v=..." --video
    """
    try:
        if not is_youtube_url(url):
            console.print(f"[red]Error:[/red] Invalid YouTube URL: {url}")
            raise typer.Exit(1)
        
        console.print(Panel(
            f"[bold]Downloading from YouTube[/bold]\n{url}",
            title="Pi-Tube",
            border_style="blue",
        ))
        
        if audio_only:
            output_path = download_audio(url, output_dir=output)
        else:
            from .downloader import download_video
            output_path = download_video(url, output_dir=output)
        
        console.print(Panel(
            f"[bold green]Download Complete[/bold green]\n\n"
            f"File: {output_path}",
            border_style="green",
        ))
        
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)


@app.command()
def providers():
    """List available transcription providers and their status."""
    table = Table(title="Transcription Providers")
    table.add_column("Provider", style="cyan")
    table.add_column("Model", style="magenta")
    table.add_column("Status", style="green")
    
    # Check Deepgram
    deepgram = DeepgramProvider()
    table.add_row(
        "deepgram",
        "Nova 3",
        "✓ Configured" if deepgram.is_configured() else "✗ Not configured",
    )
    
    # Check Groq
    groq = GroqProvider()
    table.add_row(
        "groq",
        "Whisper Large V3 Turbo",
        "✓ Configured" if groq.is_configured() else "✗ Not configured",
    )
    
    console.print(table)
    
    console.print("\n[dim]Set API keys via environment variables:[/dim]")
    console.print("  DEEPGRAM_API_KEY=your_key")
    console.print("  GROQ_API_KEY=your_key")


@app.command()
def version():
    """Show Pi-Tube version."""
    console.print(f"Pi-Tube v{__version__}")


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
