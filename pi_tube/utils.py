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
