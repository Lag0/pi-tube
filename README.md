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

Configure as API keys usando o comando `config`:

```bash
# Configurar Deepgram
pi-tube config set deepgram YOUR_DEEPGRAM_KEY

# Configurar Groq
pi-tube config set groq YOUR_GROQ_KEY

# Ver status da configuração
pi-tube config show
```

Ou via variáveis de ambiente:

```bash
export DEEPGRAM_API_KEY=your_deepgram_key
export GROQ_API_KEY=your_groq_key
```

## Uso

### Transcrever vídeo do YouTube

```bash
# Usando Groq Whisper
pi-tube groq "https://youtube.com/watch?v=..."

# Usando Deepgram Nova 3
pi-tube deepgram "https://youtube.com/watch?v=..."

# Com output customizado
pi-tube groq "https://youtube.com/watch?v=..." -o ./transcripts/video.txt
```

### Transcrever arquivo local

```bash
# Vídeo local
pi-tube groq /path/to/video.mp4

# Áudio local
pi-tube deepgram /path/to/audio.mp3 -o transcricao.txt
```

### Download

```bash
# Download de áudio (padrão)
pi-tube dl "https://youtube.com/watch?v=..."

# Download de áudio explícito
pi-tube dl "https://youtube.com/watch?v=..." --audio

# Download de vídeo
pi-tube dl "https://youtube.com/watch?v=..." --video
```

### Verificar providers configurados

```bash
pi-tube providers
```

## Atualização

Para atualizar o pi-tube para a versão mais recente:

```bash
pipx upgrade pi-tube
```

Ou reinstale forçadamente:

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash
```

## Output

As transcrições são salvas em `~/pi-tube/YYYY-MM-DD-<nome_do_video>.txt` por padrão.
Use `-o` para especificar um caminho customizado.

> **Smart Skip**: Se a transcrição já existir, o pi-tube pulará automaticamente o download e o processamento.


## Requisitos

- Python 3.11+
- ffmpeg instalado no sistema

## Licença

MIT
