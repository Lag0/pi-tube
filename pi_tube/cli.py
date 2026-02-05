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

@app.callback()
def main_callback(ctx: typer.Context):
    """
    Pi-Tube: AI-powered YouTube transcription.
    """
    # Check for updates only if not running 'pi-tube version' or 'config'
    # to keep fast commands fast, though async check would be better.
    # For now, we do a quick synchronous check with short timeout.
    from .utils import check_latest_version
    
    # Skip check for version command to avoid circular logic or double printing
    if ctx.invoked_subcommand != "version":
        latest = check_latest_version(__version__)
        if latest:
            console.print(
                Panel(
                    f"New version available: [bold green]{latest}[/bold green]\n"
                    f"Current version: {__version__}\n\n"
                    f"Run [bold cyan]pipx upgrade pi-tube[/bold cyan] to update.",
                    title="Update Available",
                    border_style="yellow",
                )
            )


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

from .utils import slugify

# ... imports ...


def _transcribe_with_provider(
    provider: Provider,
    input_source: str,
    output: Optional[Path] = None,
    language: Optional[str] = None,
    keep_audio: bool = False,
):
    """Common transcription logic for all providers."""
    try:
        transcriber = get_provider(provider)
        
        if not transcriber.is_configured():
            console.print(
                f"[red]Error:[/red] {provider.value} API key not configured.\n"
                f"Run: pi-tube config set {provider.value} YOUR_API_KEY"
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
            
            # Smart check: Check if transcription already exists BEFORE download
            if output is None:
                from .downloader import get_video_info
                info = get_video_info(input_source)
                title = info.get("title", "video")
                slug_name = slugify(title)
                
                output_dir = Config.ensure_output_dir()
                # Check for any file ending with the slugified name
                # format is YYYY-MM-DD-slug-name.md
                existing_files = list(output_dir.glob(f"*-{slug_name}.md"))
                
                if existing_files:
                    console.print(f"[green]✓ Transcription already exists:[/green] {existing_files[0]}")
                    return

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
        
        # Determine output path - save in ~/pi-tube/ with date prefix
        if output is None:
            from datetime import datetime
            
            date_prefix = datetime.now().strftime("%Y-%m-%d")
            output_dir = Config.ensure_output_dir()
            
            # Normalize filename using shared utility
            normalized_name = slugify(audio_path.stem)
            
            filename = f"{date_prefix}-{normalized_name}.md"
            output = output_dir / filename
        
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
def deepgram(
    input_source: str = typer.Argument(
        ...,
        help="YouTube URL or path to local video/audio file",
    ),
    output: Optional[Path] = typer.Option(
        None,
        "--output", "-o",
        help="Output path for transcription",
    ),
    language: Optional[str] = typer.Option(
        None,
        "--language", "-l",
        help="Language code (e.g., 'pt', 'en')",
    ),
    keep_audio: bool = typer.Option(
        False,
        "--keep-audio", "-k",
        help="Keep downloaded/extracted audio file",
    ),
):
    """
    Transcribe using Deepgram Nova 3.
    
    Examples:
    
        pi-tube deepgram "https://youtube.com/watch?v=..."
        
        pi-tube deepgram video.mp4 -o transcricao.txt
    """
    _transcribe_with_provider(Provider.deepgram, input_source, output, language, keep_audio)


@app.command()
def groq(
    input_source: str = typer.Argument(
        ...,
        help="YouTube URL or path to local video/audio file",
    ),
    output: Optional[Path] = typer.Option(
        None,
        "--output", "-o",
        help="Output path for transcription",
    ),
    language: Optional[str] = typer.Option(
        None,
        "--language", "-l",
        help="Language code (e.g., 'pt', 'en')",
    ),
    keep_audio: bool = typer.Option(
        False,
        "--keep-audio", "-k",
        help="Keep downloaded/extracted audio file",
    ),
):
    """
    Transcribe using Groq Whisper Large V3 Turbo.
    
    Examples:
    
        pi-tube groq "https://youtube.com/watch?v=..."
        
        pi-tube groq video.mp4 -o transcricao.txt
    """
    _transcribe_with_provider(Provider.groq, input_source, output, language, keep_audio)


@app.command()
def dl(
    url: str = typer.Argument(
        ...,
        help="YouTube URL to download",
    ),
    output: Optional[Path] = typer.Option(
        None,
        "--output", "-o",
        help="Output directory for downloaded file",
    ),
    audio: bool = typer.Option(
        False,
        "--audio",
        help="Download audio only",
    ),
    video: bool = typer.Option(
        False,
        "--video",
        help="Download video",
    ),
):
    """
    Download audio or video from YouTube.
    
    Examples:
    
        pi-tube dl "https://youtube.com/watch?v=..."
        
        pi-tube dl "https://youtube.com/watch?v=..." --audio
        
        pi-tube dl "https://youtube.com/watch?v=..." --video
    """
    try:
        if not is_youtube_url(url):
            console.print(f"[red]Error:[/red] Invalid YouTube URL: {url}")
            raise typer.Exit(1)
        
        # Default to audio if neither specified
        download_video_flag = video and not audio
        
        console.print(Panel(
            f"[bold]Downloading from YouTube[/bold]\n{url}",
            title="Pi-Tube",
            border_style="blue",
        ))
        
        if download_video_flag:
            from .downloader import download_video
            output_path = download_video(url, output_dir=output)
        else:
            output_path = download_audio(url, output_dir=output)
        
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
    dg = DeepgramProvider()
    table.add_row(
        "deepgram",
        "Nova 3",
        "✓ Configured" if dg.is_configured() else "✗ Not configured",
    )
    
    # Check Groq
    gq = GroqProvider()
    table.add_row(
        "groq",
        "Whisper Large V3 Turbo",
        "✓ Configured" if gq.is_configured() else "✗ Not configured",
    )
    
    console.print(table)
    
    console.print("\n[dim]Configure with: pi-tube config set <provider> <api_key>[/dim]")


@app.command()
def version():
    """Show Pi-Tube version."""
    console.print(f"Pi-Tube v{__version__}")


# Config subcommand app
config_app = typer.Typer(help="Manage API keys configuration")
app.add_typer(config_app, name="config")


def _get_config_path() -> tuple[Path, Path]:
    """Get config directory and file paths."""
    config_dir = Path.home() / ".config" / "pi-tube"
    config_file = config_dir / "config"
    return config_dir, config_file


def _load_config() -> dict:
    """Load current config from file."""
    _, config_file = _get_config_path()
    current_config = {}
    if config_file.exists():
        for line in config_file.read_text().strip().split("\n"):
            if "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                current_config[key] = value
    return current_config


def _save_config(config: dict):
    """Save config to file."""
    config_dir, config_file = _get_config_path()
    config_dir.mkdir(parents=True, exist_ok=True)
    config_file.write_text("\n".join(f"{k}={v}" for k, v in config.items()) + "\n")


@config_app.command("set")
def config_set(
    provider: str = typer.Argument(
        ...,
        help="Provider name (deepgram or groq)",
    ),
    api_key: str = typer.Argument(
        ...,
        help="API key value",
    ),
):
    """
    Set an API key for a provider.
    
    Examples:
    
        pi-tube config set deepgram YOUR_DEEPGRAM_KEY
        
        pi-tube config set groq YOUR_GROQ_KEY
    """
    provider_lower = provider.lower()
    key_map = {
        "deepgram": "DEEPGRAM_API_KEY",
        "groq": "GROQ_API_KEY",
    }
    
    if provider_lower not in key_map:
        console.print(f"[red]Error:[/red] Unknown provider '{provider}'")
        console.print("Available providers: deepgram, groq")
        raise typer.Exit(1)
    
    config = _load_config()
    config[key_map[provider_lower]] = api_key
    _save_config(config)
    
    console.print(f"[green]✓ {provider_lower} API key saved[/green]")


@config_app.command("show")
def config_show():
    """Show current configuration status."""
    import os
    
    _, config_file = _get_config_path()
    config = _load_config()
    
    console.print(Panel("[bold]Pi-Tube Configuration[/bold]", border_style="blue"))
    
    deepgram_status = "✓ Set" if config.get("DEEPGRAM_API_KEY") or os.getenv("DEEPGRAM_API_KEY") else "✗ Not set"
    groq_status = "✓ Set" if config.get("GROQ_API_KEY") or os.getenv("GROQ_API_KEY") else "✗ Not set"
    
    console.print(f"DEEPGRAM_API_KEY: {deepgram_status}")
    console.print(f"GROQ_API_KEY: {groq_status}")
    console.print(f"\n[dim]Config file: {config_file}[/dim]")


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
