import os
from typing import Optional, List, Tuple
from anthropic import Anthropic
from anthropic.types import MessageParam
from rich.console import Console

VERBOSE = os.getenv('VERBOSE_MODE', '').lower() in ('true', '1', 'yes')
console = Console()

class APIAgent:
    def __init__(self, api_key: Optional[str] = None, system_prompt: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("API key must be provided or set in ANTHROPIC_API_KEY environment variable")
        self.client = Anthropic(api_key=self.api_key)
        self.system_prompt = system_prompt

    def request(self, prompt: str, max_tokens: int = 4000) -> str:
        if VERBOSE:
            if self.system_prompt:
                console.print("\n[yellow]System Prompt:[/yellow]")
                console.print(self.system_prompt)
            console.print("\n[yellow]User Prompt:[/yellow]")
            console.print(prompt)
        
        messages: List[MessageParam] = [{"role": "user", "content": prompt}]
        
        response = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=max_tokens,
            system=self.system_prompt,
            messages=messages
        )
        
        response_text = response.content[0].text
        
        if VERBOSE:
            console.print("\n[yellow]Claude Response:[/yellow]")
            console.print(response_text)
        
        return response_text

