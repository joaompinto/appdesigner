import { getLanguageFromPath, createEditor, updateEditorMode, showToast } from './editor.js';
const { marked } = window;
import { contextItems } from './context.js';  // Remove addToContext since it's not used

let currentPath = '';
let selectedFile = null;

function updateBreadcrumbs(path) {
    const container = document.getElementById('current-path');
    container.innerHTML = '';

    // Create breadcrumb wrapper
    const breadcrumbList = document.createElement('div');
    breadcrumbList.className = 'breadcrumb-list';
    
    // Add root item
    const rootItem = createBreadcrumbItem('/', '', true);
    breadcrumbList.appendChild(rootItem);

    if (path) {
        const parts = path.split('/');
        let currentPath = '';
        
        parts.forEach((part, index) => {
            // Add separator
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '/';
            breadcrumbList.appendChild(separator);
            
            // Build current path
            currentPath += (currentPath ? '/' : '') + part;
            
            // Add path item
            const isLast = index === parts.length - 1;
            const item = createBreadcrumbItem(part, currentPath, !isLast);
            breadcrumbList.appendChild(item);
        });
    }

    container.appendChild(breadcrumbList);
}

function createBreadcrumbItem(label, path, isClickable) {
    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    if (!isClickable) {
        item.classList.add('current');
    }
    item.textContent = label;
    
    if (isClickable) {
        item.addEventListener('click', () => navigateToDirectory(path));
    }
    
    return item;
}

function navigateToDirectory(path) {
    currentPath = path;
    updateBreadcrumbs(path);
    loadFileTree();
}

// Remove setupFileTreeDragAndDrop function entirely

async function loadFileTree() {
    const treeElement = document.getElementById('file-tree');
    if (!treeElement) return;  // Add null check
    treeElement.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        // Add loading state class
        treeElement.classList.add('loading');
        
        // Add path parameter to API call
        const response = await fetch(`/api/files${currentPath ? `?path=${encodeURIComponent(currentPath)}` : ''}`);
        const allFiles = await response.json();
        treeElement.innerHTML = ''; // Clear existing content

        // Add back button if we're in a subdirectory
        if (currentPath) {
            const backItem = document.createElement('div');
            backItem.className = 'file-tree-item back';
            backItem.title = 'Double click to go back';  // Add tooltip
            
            const icon = document.createElement('span');
            icon.className = 'icon';
            icon.innerHTML = '⬅';
            
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = '..';
            
            backItem.appendChild(icon);
            backItem.appendChild(name);
            treeElement.appendChild(backItem);
        }
        
        // Update filtering logic to show direct children only
        const files = currentPath ? allFiles : allFiles.filter(file => !file.path.includes('/'));

        // Sort files by type (directories first) and name
        files.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);  // Compare by name instead of path
            }
            return a.type === 'directory' ? -1 : 1;
        });

        // Create file tree items
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = `file-tree-item ${file.type}`;
            // Make both files and directories draggable
            item.classList.add('draggable');
            item.draggable = true;
            item.dataset.path = file.path;
            item.dataset.type = file.type;  // Add type to dataset
            
            const icon = document.createElement('span');
            icon.className = 'icon';
            icon.innerHTML = file.type === 'directory' ? '📁' : '📄';
            
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = file.name;  // Use file.name instead of file.path
            
            item.appendChild(icon);
            item.appendChild(name);
            treeElement.appendChild(item);
        });

        // Add drag event listeners
        treeElement.addEventListener('dragstart', handleDragStart);
        treeElement.addEventListener('dragend', handleDragEnd);

    } catch (error) {
        console.error('Failed to load file tree:', error);
        const errorMessage = error.response?.data?.detail || error.message;
        treeElement.innerHTML = 
            `<div class="error-message">Error loading file tree: ${errorMessage}</div>`;
    } finally {
        // Remove loading state
        treeElement.classList.remove('loading');
    }
}

function handleDragStart(e) {
    const item = e.target.closest('.draggable');
    if (!item) return;
    
    item.classList.add('dragging');
    e.dataTransfer.setData('text/plain', item.dataset.path);
    e.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(e) {
    const item = e.target.closest('.draggable');
    if (item) {
        item.classList.remove('dragging');
    }
}

function resetFileExplorer() {
    currentPath = '';
    updateBreadcrumbs('');
    loadFileTree();
}

function clearFileSelection() {
    selectedFile = null;
    document.getElementById('current-file').textContent = 'No file selected';
    document.getElementById('file-content').innerHTML = '<div class="editor-placeholder">Select a file to view its contents</div>';
    
    // Hide editor controls and toolbar
    document.getElementById('edit-button').style.display = 'none';
    document.getElementById('save-button').style.display = 'none';
    document.getElementById('preview-button').style.display = 'none';
    document.querySelector('.content-toolbar').classList.add('toolbar-hidden');
    
    // Reset editor state if exists
    if (window.editor) {
        window.editor.getWrapperElement().remove();
        window.editor = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    const previewButton = document.getElementById('preview-button');
    
    // File tree click handler
    document.getElementById('file-tree').addEventListener('click', async (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;

        // Clear any active context
        document.querySelectorAll('.context-folder').forEach(folder => {
            folder.classList.remove('active');
        });
        window.currentContext = null;  // Use window.currentContext

        selectedFile = fileItem.dataset.path;

        // Update selection UI
        document.querySelectorAll('.file-tree-item').forEach(item => {
            item.classList.remove('selected');
        });
        fileItem.classList.add('selected');

        // Reset editor state only for files
        const isFile = fileItem.classList.contains('file');
        if (isFile) {
            window.isEditMode = false;
            window.hasUnsavedChanges = false;
            
            // Show toolbar and update header
            document.querySelector('.content-toolbar').classList.remove('toolbar-hidden');
            const filename = fileItem.dataset.path;
            document.getElementById('current-file').textContent = filename;
            editButton.style.display = 'block';
            
            try {
                const response = await fetch(`/api/file?path=${encodeURIComponent(filename)}`);
                const data = await response.json();
                
                if (data.content) {
                    const contentElement = document.getElementById('file-content');
                    const language = getLanguageFromPath(filename);
                    createEditor(contentElement, data.content, language, true);
                    updateEditorMode(true);  // Ensure readonly mode
                    
                    // Update token count in header if needed
                    const fileHeader = document.getElementById('current-file');
                    if (data.tokens !== undefined) {
                        fileHeader.textContent = `${filename} (${formatTokens(data.tokens)})`;
                    }
                }
            } catch (error) {
                console.error('Error loading file:', error);
                document.getElementById('file-content').innerHTML = 
                    `<div class="error-message">Error loading file: ${error.message}</div>`;
            }

            const isMarkdown = filename.toLowerCase().endsWith('.md');
            previewButton.style.display = isMarkdown ? 'block' : 'none';
            if (!isMarkdown) {
                window.isPreviewMode = false;
                previewButton.classList.remove('active');
                document.querySelector('.container').classList.remove('preview-active');
                document.getElementById('preview-column').style.display = 'none';
            } else if (window.isPreviewMode) {
                // Refresh preview content for markdown files
                const previewContent = document.getElementById('preview-content');
                previewContent.innerHTML = marked.parse(window.editor.getValue());
            }

            // Show file content column and hide context view
            document.querySelector('.file-content-column').style.display = 'flex';
            document.getElementById('context-view').style.display = 'none';
        } else {
            // For directories, hide toolbar and buttons
            document.querySelector('.content-toolbar').classList.add('toolbar-hidden');
            editButton.style.display = 'none';
            saveButton.style.display = 'none';
        }
    });

    // Add double click handler
    document.getElementById('file-tree').addEventListener('dblclick', (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;

        if (fileItem.classList.contains('back')) {
            const parentPath = currentPath.split('/').slice(0, -1).join('/');
            navigateToDirectory(parentPath);
        } else if (!fileItem.classList.contains('file')) {
            const path = fileItem.dataset.path;
            navigateToDirectory(path);
        }
    });

    // Initial file tree load
    loadFileTree();
});

// Remove the old drag event setup from setupDragAndDrop

export {
    updateBreadcrumbs,
    navigateToDirectory,
    loadFileTree,
    resetFileExplorer,
    currentPath,
    clearFileSelection
};