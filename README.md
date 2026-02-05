# Pi-Tube

CLI para download e transcrição de vídeos do YouTube usando modelos cloud de AI.

## Features

- 🎬 **Download de YouTube**: Baixa áudio/vídeo de URLs do YouTube
- 🎙️ **Transcrição Cloud**: Suporta Deepgram Nova 3 e Groq Whisper Large V3
- 📁 **Arquivos Locais**: Transcreve vídeos e áudios locais
- 🔧 **Conversão Automática**: Converte áudio para formato otimizado (16kHz mono)

## Instalação

### Instalação Rápida (Recomendada)

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash
```

### Instalação Manual com pipx

```bash
pip install --user pipx
pipx ensurepath
pipx install git+https://github.com/Lag0/pi-tube.git
```

### Instalação para Desenvolvimento

```bash
git clone https://github.com/Lag0/pi-tube.git
cd pi-tube
uv sync
```

## Configuração

Copie o arquivo de exemplo e adicione suas API keys:

```bash
cp .env.example .env
```

Edite o `.env`:

```env
DEEPGRAM_API_KEY=your_deepgram_key
GROQ_API_KEY=your_groq_key
```

## Uso

### Transcrever vídeo do YouTube

```bash
# Usando Groq Whisper (padrão)
pi-tube transcribe "https://youtube.com/watch?v=..." 

# Usando Deepgram Nova 3
pi-tube transcribe "https://youtube.com/watch?v=..." --provider deepgram

# Com output customizado
pi-tube transcribe "https://youtube.com/watch?v=..." -o ./transcripts/video.txt
```

### Transcrever arquivo local

```bash
# Vídeo local
pi-tube transcribe /path/to/video.mp4 --provider groq

# Áudio local
pi-tube transcribe /path/to/audio.mp3 -o transcricao.txt
```

### Download apenas

```bash
# Download de áudio
pi-tube download "https://youtube.com/watch?v=..." --output ./downloads

# Download de vídeo
pi-tube download "https://youtube.com/watch?v=..." --video
```

### Verificar providers configurados

```bash
pi-tube providers
```

## Requisitos

- Python 3.11+
- ffmpeg instalado no sistema

## Licença

MIT
