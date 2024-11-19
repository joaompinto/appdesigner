import { getLanguageFromPath, createEditor, updateEditorMode, showToast } from './editor.js';
// Update marked import to use CDN version loaded in HTML
const { marked } = window;
import { contextItems, currentContext } from './context.js';

let currentPath = '';

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

async function loadFileTree() {
    const treeElement = document.getElementById('file-tree');
    if (!treeElement) return;  // Add null check
    treeElement.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        // Add loading state class
        treeElement.classList.add('loading');
        
        const response = await fetch('/api/files');
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
        
        // Filter files based on current path
        const files = allFiles.filter(file => {
            if (!currentPath) return !file.path.includes('/');
            return file.path.startsWith(currentPath + '/') && 
                   !file.path.slice(currentPath.length + 1).includes('/');
        });

        // Sort files by type (directories first) and name
        files.sort((a, b) => {
            if (a.type === b.type) {
                return a.path.localeCompare(b.path);
            }
            return a.type === 'directory' ? -1 : 1;
        });

        // Create file tree items
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = `file-tree-item ${file.type}`;
            item.dataset.path = file.path;
            item.draggable = true; // Make items draggable
            
            const icon = document.createElement('span');
            icon.className = 'icon';
            icon.innerHTML = file.type === 'directory' ? '📁' : '📄';
            
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = file.name;
            
            item.appendChild(icon);
            item.appendChild(name);
            treeElement.appendChild(item);
        });

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

function resetFileExplorer() {
    currentPath = '';
    updateBreadcrumbs('');
    loadFileTree();
}

document.addEventListener('DOMContentLoaded', () => {
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    const previewButton = document.getElementById('preview-button');
    
    // File tree click handler
    document.getElementById('file-tree').addEventListener('click', async (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;

        // Reset editor state only for files
        const isFile = fileItem.classList.contains('file');
        if (isFile) {
            window.isEditMode = false;
            window.hasUnsavedChanges = false;
            
            // Update header and content only for files
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
        } else {
            // For directories, just update selection
            editButton.style.display = 'none';
            saveButton.style.display = 'none';
        }

        // Update selection for both files and directories
        document.querySelectorAll('.file-tree-item').forEach(item => {
            item.classList.remove('selected');
        });
        fileItem.classList.add('selected');
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

export {
    updateBreadcrumbs,
    navigateToDirectory,
    loadFileTree,
    resetFileExplorer,
    currentPath
};