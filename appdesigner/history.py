import json
import os
from datetime import datetime
from pathlib import Path
import shutil

# Add constant for history directory name
HISTORY_DIR_NAME = ".appdesigner_history"

class ChangeHistory:
    def __init__(self, history_dir: str = None):
        if history_dir is None:
            # Use home directory + hidden folder
            home_dir = str(Path.home())
            history_dir = os.path.join(home_dir, HISTORY_DIR_NAME)
        
        self.history_dir = Path(history_dir)
        self.history_dir.mkdir(parents=True, exist_ok=True)
        
    def add_change(self, filename: str, instruction: str, new_content: str):
        """Store a change in the history"""
        timestamp = datetime.now().isoformat()
        change_info = {
            "timestamp": timestamp,
            "filename": filename,
            "instruction": instruction,
            "content": new_content
        }
        
        # Create backup of original file if it exists
        orig_file = Path(filename)
        if orig_file.exists():
            backup_dir = self.history_dir / "backups" / timestamp
            backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(orig_file, backup_dir / orig_file.name)
        
        # Store change info
        change_file = self.history_dir / f"change_{timestamp}.json"
        with open(change_file, 'w') as f:
            json.dump(change_info, f, indent=2)
    
    def get_changes(self, filename: str = None):
        """Retrieve changes history, optionally filtered by filename"""
        changes = []
        for change_file in self.history_dir.glob("change_*.json"):
            with open(change_file) as f:
                change = json.load(f)
                if filename is None or change["filename"] == filename:
                    changes.append(change)
        return sorted(changes, key=lambda x: x["timestamp"])