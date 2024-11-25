import { getLanguageFromPath, createEditor, updateEditorMode, showToast } from './editor.js';
const { marked } = window;
import { contextItems, formatTokens } from './context.js';  // Import formatTokens instead of defining it here
import { toggleVisibleColumn } from './columnmanager.js';

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

function initializeFileTree() {
    document.getElementById('file-tree').addEventListener('click', async (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;

        // Only handle files, not directories
        if (!fileItem.classList.contains('file')) return;

        // Ensure we toggle to file view and hide context view
        toggleVisibleColumn('file');
        
        // Clear any active context and remove highlighting
        document.querySelectorAll('.context-tag').forEach(tag => {
            tag.classList.remove('active');
        });
        window.currentContext = null;

        selectedFile = fileItem.dataset.path;

        // Update selection UI
        document.querySelectorAll('.file-tree-item').forEach(item => {
            item.classList.remove('selected');
        });
        fileItem.classList.add('selected');

        // Reset editor state
        window.isEditMode = false;
        window.hasUnsavedChanges = false;
        
        // Show toolbar and update header
        const toolbar = document.querySelector('.content-toolbar');
        toolbar.classList.remove('toolbar-hidden');
        
        const filename = fileItem.dataset.path;
        document.getElementById('current-file').textContent = filename;
        document.getElementById('edit-button').style.display = 'block';
            
        try {
            const response = await fetch(`/api/file?path=${encodeURIComponent(filename)}`);
            if (!response.ok) throw new Error('Failed to load file');
            
            const data = await response.json();
            
            if (data.content !== undefined) {
                const contentElement = document.getElementById('file-content');
                contentElement.innerHTML = ''; // Clear previous content
                const language = getLanguageFromPath(filename);
                createEditor(contentElement, data.content, language, true);
                updateEditorMode(true);
                
                // Hide placeholder if exists
                const placeholder = contentElement.querySelector('.editor-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
            } else {
                throw new Error('Invalid file content');
            }
        } catch (error) {
            console.error('Error loading file:', error);
            document.getElementById('file-content').innerHTML = 
                `<div class="error-message">Error loading file: ${error.message}</div>`;
            showToast(error.message, 'error');
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
}

// Remove the old drag event setup from setupDragAndDrop

export {
    updateBreadcrumbs,
    navigateToDirectory,
    loadFileTree,
    resetFileExplorer,
    currentPath,
    clearFileSelection,
    initializeFileTree
};