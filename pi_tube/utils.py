"""Utility functions for Pi-Tube."""

import re

def slugify(text: str) -> str:
    """
    Normalize text for use as a filename.
    
    1. Removes special characters.
    2. Replaces spaces with hyphens.
    3. Converts to lowercase.
    4. Removes duplicate hyphens.
    """
    # Replace non-alphanumeric chars (except hyphens and spaces) with nothing
    text = re.sub(r'[^a-zA-Z0-9\s-]', '', text)
    # Replace spaces and underscores with hyphens
    text = re.sub(r'[\s_]+', '-', text)
    # Remove multiple hyphens
    text = re.sub(r'-+', '-', text)
    # Strip leading/trailing hyphens and lowercase
    return text.strip('-').lower()


def check_latest_version(current_version: str) -> str | None:
    """
    Check if a newer version is available on GitHub.
    Returns the latest version string if newer, None otherwise.
    """
    import urllib.request
    import tomllib
    
    url = "https://raw.githubusercontent.com/Lag0/pi-tube/master/pyproject.toml"
    
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            if response.status == 200:
                data = tomllib.load(response)
                latest_version = data.get("project", {}).get("version")
                
                if latest_version and latest_version != current_version:
                    # Simple semantic version comparison
                    # Assumes standard x.y.z format
                    current_parts = [int(p) for p in current_version.split('.')]
                    latest_parts = [int(p) for p in latest_version.split('.')]
                    
                    if latest_parts > current_parts:
                        return latest_version
    except Exception:
        # Fail silently on network errors or parsing issues
        pass
        
    return None
