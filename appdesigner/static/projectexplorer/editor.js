// Make all state variables globally accessible
window.isEditMode = false;
window.editor = null;  // Changed to window.editor
window.hasUnsavedChanges = false;  // Changed to window.hasUnsavedChanges
window.isPreviewMode = false;  // Changed to window.isPreviewMode

function getLanguageFromPath(path) {
    const ext = path.split('.').pop().toLowerCase();
    const languageMap = {
        'py': 'python',
        'js': 'javascript',
        'css': 'css',
        'html': 'xml',
        'htm': 'xml',
        'xml': 'xml',
        'json': 'javascript',
        'md': 'markdown',
        'markdown': 'markdown'
    };
    return languageMap[ext] || 'plaintext';
}

function createEditor(element, content, language, readonly = true) {
    // Clean up existing editor if it exists
    if (window.editor) {  // Updated reference
        window.editor.getWrapperElement().remove();
        window.editor = null;
    }

    // Clear the element
    element.innerHTML = '';
    
    // Create editor
    window.editor = CodeMirror(element, {  // Updated assignment
        value: content,
        mode: language,
        theme: 'monokai',
        lineNumbers: true,
        lineWrapping: true,
        readOnly: readonly,
        tabSize: 4,
        indentUnit: 4,
        indentWithTabs: false,
        viewportMargin: Infinity,
        cursorBlinkRate: readonly ? -1 : 530 // Hide cursor in readonly mode
    });

    updateEditorMode(readonly);
    window.editor.refresh();  // Updated reference
    return window.editor;  // Updated reference
}

function updateEditorMode(readonly = true) {
    if (!window.editor) return;  // Updated reference
    
    // Update editor state
    window.editor.setOption('readOnly', readonly);
    window.editor.getWrapperElement().classList.toggle('readonly', readonly);
    window.isEditMode = !readonly;
    
    // Update mode indicator - only show if there's a file selected
    const modeIndicator = document.getElementById('editor-mode');
    const currentFile = document.getElementById('current-file').textContent;
    const hasFileSelected = currentFile && currentFile !== 'No file selected';
    
    modeIndicator.style.display = hasFileSelected ? 'inline-block' : 'none';
    if (hasFileSelected) {
        modeIndicator.className = `mode-indicator ${readonly ? 'readonly' : 'editing'}`;
        modeIndicator.textContent = readonly ? 'Read Only' : 'Editing';
    }
    
    // Update button visibility
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    editButton.style.display = readonly ? 'block' : 'none';
    saveButton.style.display = readonly ? 'none' : 'block';
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Remove toast after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    const previewButton = document.getElementById('preview-button');

    // Initialize save button as hidden
    saveButton.style.display = 'none';

    // Edit button handler
    editButton.addEventListener('click', () => {
        if (!window.editor) return;
        
        window.isEditMode = true;  // This should now work correctly
        const content = window.editor.getValue();
        const filename = document.getElementById('current-file').textContent;
        const language = getLanguageFromPath(filename);
        
        createEditor(document.getElementById('file-content'), content, language, false);
        updateEditorMode(false);  // Switch to edit mode
        
        // Add live preview update
        window.editor.on('change', () => {
            window.hasUnsavedChanges = true;
            saveButton.className = 'save-button active';
            
            // Update preview if active
            if (window.isPreviewMode) {
                const previewContent = document.getElementById('preview-content');
                previewContent.innerHTML = marked.parse(window.editor.getValue());
            }
        });
    });

    // Save button handler
    saveButton.addEventListener('click', async () => {
        if (!window.editor) {
            showToast('No editor instance found', 'error');
            return;
        }

        const currentFile = document.getElementById('current-file').textContent;
        if (!currentFile || currentFile === 'No file selected') {
            showToast('No file selected', 'error');
            return;
        }
        
        try {
            saveButton.className = 'save-button saving';
            saveButton.disabled = true;
            
            const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile)}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: window.editor.getValue()
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save file');
            }

            const result = await response.json();
            window.hasUnsavedChanges = false;
            window.isEditMode = false;

            const content = window.editor.getValue();
            const language = getLanguageFromPath(currentFile);
            createEditor(document.getElementById('file-content'), content, language, true);
            updateEditorMode(true);  // Switch back to readonly mode
            
            editButton.style.display = 'block';
            saveButton.style.display = 'none';
            saveButton.disabled = false;
            
            showToast('File saved successfully');

            const isMarkdown = currentFile.toLowerCase().endsWith('.md');
            previewButton.style.display = isMarkdown ? 'block' : 'none';
            
        } catch (error) {
            console.error('Error saving file:', error);
            showToast(error.message || 'Failed to save file', 'error');
            saveButton.className = 'save-button active';
            saveButton.disabled = false;
        }
    });

    // Preview button handler
    previewButton.addEventListener('click', () => {
        if (!window.editor) return;
        
        window.isPreviewMode = !window.isPreviewMode;
        previewButton.classList.toggle('active');
        document.querySelector('.container').classList.toggle('preview-active');
        
        const previewColumn = document.getElementById('preview-column');
        const content = window.editor.getValue();
        
        if (window.isPreviewMode) {
            previewColumn.style.display = 'flex';
            const previewContent = document.getElementById('preview-content');
            previewContent.innerHTML = marked.parse(content);
        } else {
            setTimeout(() => {
                previewColumn.style.display = 'none';
            }, 300); // Match transition duration
        }
    });
});

// Single export block with all needed exports
export { 
    getLanguageFromPath, 
    createEditor, 
    updateEditorMode,
    showToast 
};