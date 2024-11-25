import { showToast } from './editor.js';
import { clearFileSelection } from './filetree.js';
import { toggleVisibleColumn } from './columnmanager.js';

// Keep this export at the top
export const contextItems = {};

// Add API integration functions
async function loadContextsFromAPI() {
    try {
        const response = await fetch('/api/contexts');
        const data = await response.json();
        
        // Clear existing items
        Object.keys(contextItems).forEach(key => delete contextItems[key]);
        
        // Add new items
        Object.entries(data).forEach(([name, context]) => {
            context.itemTypes = new Map(
                context.items?.map(item => [item.path, item.type]) || []
            );
            context.items = new Set(context.items?.map(item => item.path) || []);
            context.type = context.type || 'tag';
            context.color = context.color || 'gray';
            contextItems[name] = context;
        });
        renderContextTree(document.getElementById('context-tree'));
    } catch (error) {
        console.error('Failed to load contexts:', error);
        showToast('Failed to load contexts', 'error');
        // Initialize with default contexts if API fails
        contextItems = {
            'Static': { type: 'tag', color: 'blue', items: new Set() },
            'Dynamic Routers': { type: 'tag', color: 'green', items: new Set() },
            'Documentation': { type: 'tag', color: 'purple', items: new Set() },
            'Tests': { type: 'tag', color: 'red', items: new Set() }
        };
    }
}

async function saveContextsToAPI() {
    try {
        // Convert Sets back to arrays of paths
        const contextsToSave = {};
        for (const [name, context] of Object.entries(contextItems)) {
            contextsToSave[name] = {
                ...context,
                items: Array.from(context.items)
            };
        }

        await fetch('/api/contexts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contexts: contextsToSave })
        });
    } catch (error) {
        console.error('Failed to save contexts:', error);
        showToast('Failed to save contexts', 'error');
    }
}

window.currentContext = null;

// Helper functions for context management
// Update helper function for tags
function createContextItem(color = 'gray') {
    return {
        type: 'tag',
        color: color,
        items: new Set()
    };
}

// Replace folder rendering with tag rendering
function renderContextTree(container) {
    container.innerHTML = '';
    
    const tagList = document.createElement('div');
    tagList.className = 'context-tag-list';
    
    for (const [name, context] of Object.entries(contextItems)) {
        const tag = createContextTag(name, context.color);
        tagList.appendChild(tag);
    }
    
    container.appendChild(tagList);
}

function initializeContextExplorer() {
    const contextTree = document.getElementById('context-tree');
    renderContextTree(contextTree);
}

function createContextTag(name, color) {
    const tag = document.createElement('div');
    tag.className = `context-tag ${color || 'gray'}`; // Provide fallback color
    tag.dataset.name = name;
    
    // Add drop zone attributes
    tag.addEventListener('dragenter', handleDragEnter);
    tag.addEventListener('dragover', handleDragOver);
    tag.addEventListener('dragleave', handleDragLeave);
    tag.addEventListener('drop', handleDrop);
    
    const label = document.createElement('span');
    label.className = 'tag-label';
    label.textContent = name;
    
    const count = document.createElement('span');
    count.className = 'tag-count';
    count.textContent = (contextItems[name]?.items?.size || 0); // Add null check and fallback
    
    tag.appendChild(label);
    tag.appendChild(count);
    
    // Add click handler for selection
    tag.addEventListener('click', () => switchContext(name));

    return tag;
}

function handleDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drop-hover');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drop-hover');
}

function isPathContainedInItems(path, items) {
    // Check if path is directly in items
    if (items.has(path)) return true;

    // Check if path is a subdirectory of any directory in items
    for (const existingPath of items) {
        if (path.startsWith(existingPath + '/')) return true;
        if (existingPath.startsWith(path + '/')) return true;
    }
    return false;
}

function showNearMouseToast(message, event) {
    const toast = document.createElement('div');
    toast.className = 'toast-near-mouse';
    toast.textContent = message;
    
    // Position near mouse
    toast.style.left = `${event.pageX + 10}px`;
    toast.style.top = `${event.pageY - 30}px`;
    
    document.body.appendChild(toast);
    
    // Remove after animation
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}

function handleDrop(e) {
    e.preventDefault();
    const tag = e.currentTarget;
    tag.classList.remove('drop-hover');
    
    const filePath = e.dataTransfer.getData('text/plain');
    const contextName = tag.dataset.name;
    
    if (filePath && contextName) {
        // Check if path already exists in context
        if (isPathContainedInItems(filePath, contextItems[contextName].items)) {
            showNearMouseToast(`Already in ${contextName}`, e);
            return;
        }
        
        addToContext(filePath, contextName);
    }
}

function switchContext(name) {
    // Clear selections and update UI
    clearFileSelection();
    
    // Show context view and column
    toggleVisibleColumn('context');
    
    // Clear other context selections
    document.querySelectorAll('.context-tag').forEach(tag => {
        tag.classList.remove('active');
    });
    
    if (!contextItems[name]) {
        showToast(`Context "${name}" not found`, 'error');
        return;
    }
    
    window.currentContext = name;
    
    // Update active state
    const tag = document.querySelector(`.context-tag[data-name="${name}"]`);
    if (tag) {
        tag.classList.add('active');
    }
    
    // Update content header and display view
    const currentFileElement = document.getElementById('current-file');
    currentFileElement.textContent = `Showing context ${name}`;
    updateContextView(name);
    
    // Update console message
    const consoleElement = document.querySelector('web-console');
    if (consoleElement && consoleElement.isEmpty()) {
        consoleElement.printMessage(`Here you can interact with context ${name}`, 'message-system');
    }
    
    // Hide editor placeholder and CodeMirror if they exist
    const editorPlaceholder = document.querySelector('.editor-placeholder');
    if (editorPlaceholder) {
        editorPlaceholder.style.display = 'none';
    }
    if (window.editor) {
        window.editor.getWrapperElement().style.display = 'none';
    }
    
    showToast(`Switched to ${name} context`);
}

// Modify window.removeFromContext to use API
window.removeFromContext = async function(contextName, path) {
    if (contextItems[contextName]?.items) {
        contextItems[contextName].items.delete(path);
        
        // Save updated contexts
        await saveContextsToAPI();
        
        // Update UI
        const tag = document.querySelector(`.context-tag[data-name="${contextName}"] .tag-count`);
        if (tag) {
            tag.textContent = contextItems[contextName].items.size;
        }
        
        if (window.currentContext === contextName) {
            updateContextView(contextName);
        }
        
        showToast(`Removed ${path} from context ${contextName}`);
    }
};

async function addToContext(path, contextName) {
    if (!contextItems[contextName]) return;
    if (contextItems[contextName].items.has(path)) return; // Prevent duplicates
    
    const itemType = document.querySelector(`.file-tree-item[data-path="${path}"]`)?.classList.contains('directory') ? 'directory' : 'file';
    contextItems[contextName].items.add(path);
    if (!contextItems[contextName].itemTypes) {
        contextItems[contextName].itemTypes = new Map();
    }
    contextItems[contextName].itemTypes.set(path, itemType);
    
    // Save updated contexts
    await saveContextsToAPI();
    
    // Update the counter
    const tag = document.querySelector(`.context-tag[data-name="${contextName}"] .tag-count`);
    if (tag) {
        tag.textContent = contextItems[contextName].items.size;
    }
    
    // Always refresh context view if this is the active context
    if (window.currentContext === contextName) {
        updateContextView(contextName);
        showToast(`Added ${itemType} ${path} to ${contextName} context`);
    }
}

function initializeContextView() {
    // Remove setupContextDragAndDrop call
}

// Rename the function definition
async function updateContextView(name) {
    const viewContainer = document.getElementById('context-view');
    const itemsList = document.getElementById('context-items');
    const emptyState = document.getElementById('context-empty-state');
    const countElement = document.getElementById('context-count');
    const titleElement = document.getElementById('context-title');
    
    if (!viewContainer || !itemsList || !countElement || !emptyState || !titleElement) {
        console.error('Missing elements for context view');
        return;
    }
    
    // Update the context title
    titleElement.textContent = name;
    titleElement.className = `context-title ${contextItems[name]?.color || 'gray'}`;
    
    // Clear existing items before doing anything else
    itemsList.innerHTML = '';
    
    viewContainer.style.display = 'block';
    
    const context = contextItems[name];
    if (!context) return;
    
    // Update the count and empty state visibility
    const itemCount = context.items.size;
    countElement.textContent = `${itemCount} file${itemCount !== 1 ? 's' : ''}`;
    emptyState.style.display = itemCount === 0 ? 'block' : 'none';
    
    if (itemCount > 0) {
        // First identify all directories in the context using stored type info
        const contextDirs = Array.from(context.items)
            .filter(item => {
                const storedType = context.itemTypes?.get(item);
                return storedType === 'directory' || 
                       item.endsWith('/') || 
                       document.querySelector(`.file-tree-item[data-path="${item}"]`)?.classList.contains('directory');
            });
        
        // Scan all directories first
        const dirContentsMap = new Map();
        for (const dir of contextDirs) {
            const contents = await scanDirectoryContents(dir);
            dirContentsMap.set(dir, contents);
        }
        
        // Process each item
        for (const item of context.items) {
            const isDirectory = contextDirs.includes(item);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'context-item';
            
            const itemContent = document.createElement('div');
            itemContent.className = 'item-content';
            
            const itemIcon = document.createElement('span');
            itemIcon.className = 'item-icon';
            itemIcon.innerHTML = isDirectory ? '📁' : '📄';
            
            const itemPath = document.createElement('span');
            itemPath.className = 'item-path';
            itemPath.textContent = item;
            
            const itemInfo = document.createElement('div');
            itemInfo.className = 'item-info';
            
            // Fetch file info if not a directory
            if (!isDirectory) {
                try {
                    const response = await fetch(`/api/file?path=${encodeURIComponent(item)}`);
                    const fileInfo = await response.json();
                    if (fileInfo && fileInfo.tokens !== undefined) {
                        itemInfo.textContent = formatTokens(fileInfo.tokens);
                        itemContent.appendChild(itemInfo);
                    }
                } catch (error) {
                    console.error('Error fetching file info:', error);
                }
            }
            
            const removeButton = document.createElement('button');
            removeButton.className = 'remove-button';
            removeButton.innerHTML = '✕';
            removeButton.title = 'Remove from context';
            // Ensure we use window.currentContext
            removeButton.onclick = () => window.removeFromContext(name, item);
            
            itemContent.appendChild(itemPath);
            
            // If it's a directory, add its contents as a sublist
            if (isDirectory && dirContentsMap.has(item)) {
                const contents = dirContentsMap.get(item);
                if (contents.length > 0) {
                    const subList = document.createElement('div');
                    subList.className = 'context-sublist';
                    
                    contents.forEach(subItem => {
                        const subItemElement = document.createElement('div');
                        subItemElement.className = 'context-subitem';
                        
                        const subIcon = document.createElement('span');
                        subIcon.className = 'item-icon';
                        subIcon.innerHTML = subItem.type === 'directory' ? '📁' : '📄'; // Fix encoding
                        
                        const subPath = document.createElement('span');
                        subPath.className = 'item-path';
                        subPath.textContent = subItem.path;
                        
                        // Add token info for files instead of size
                        if (subItem.type === 'file' && subItem.tokens !== undefined) {
                            const subInfo = document.createElement('span');
                            subInfo.className = 'item-info';
                            subInfo.textContent = formatTokens(subItem.tokens);
                            subItemElement.appendChild(subInfo);
                        }
                        
                        subItemElement.appendChild(subIcon);
                        subItemElement.appendChild(subPath);
                        subList.appendChild(subItemElement);
                    });
                    
                    itemContent.appendChild(subList);
                }
            }
            
            itemElement.appendChild(itemIcon);
            itemElement.appendChild(itemContent);
            itemElement.appendChild(removeButton);
            itemsList.appendChild(itemElement);
        }
    }
}

export function initializeContextHandlers() {
    const createTagButton = document.getElementById('create-tag-button');
    const modal = document.getElementById('new-folder-modal');
    const input = document.getElementById('new-folder-name');
    const cancelButton = document.getElementById('modal-cancel');
    const createButton = document.getElementById('modal-create');

    createTagButton.addEventListener('click', () => {
        modal.classList.add('active');
        input.value = '';
        input.focus();
    });

    cancelButton.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    const createTag = async () => {
        const tagName = input.value.trim();
        if (!tagName) {
            showToast('Tag name cannot be empty', 'error');
            return;
        }

        if (contextItems[tagName]) {
            showToast('A tag with this name already exists', 'error');
            return;
        }

        try {
            // Create new context tag
            contextItems[tagName] = createContextItem();
            
            // Save to API
            await saveContextsToAPI();
            
            // Update UI
            renderContextTree(document.getElementById('context-tree'));
            modal.classList.remove('active');
            
            // Switch to the newly created context
            switchContext(tagName);
            showToast(`Created new context tag: ${tagName}`, 'success');
        } catch (error) {
            console.error('Failed to create tag:', error);
            showToast('Failed to create tag', 'error');
        }
    };

    createButton.addEventListener('click', createTag);
    
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            createTag();
        } else if (e.key === 'Escape') {
            modal.classList.remove('active');
        }
    });

    initializeContextView();
    // Setup context menu
    const contextMenu = document.getElementById('context-menu');
    const renameModal = document.getElementById('rename-folder-modal');
    const renameInput = document.getElementById('rename-folder-input');
    
    // Hide context menu on click outside
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });
    
    // Handle rename menu item click
    document.getElementById('rename-folder').addEventListener('click', () => {
        const folderName = contextMenu.dataset.target;
        if (folderName) {
            renameModal.classList.add('active'); // Direct call instead of undefined showRenameModal
            renameInput.value = folderName;
        }
        contextMenu.style.display = 'none';
    });
    
    // Handle rename modal actions
    document.getElementById('rename-cancel').addEventListener('click', () => {
        renameModal.classList.remove('active');
    });
    
    document.getElementById('rename-save').addEventListener('click', () => {
        const oldName = contextMenu.dataset.target;
        const newName = renameInput.value.trim();
        
        if (newName && newName !== oldName) {
            if (renameContextFolder(oldName, newName)) {
                const folder = document.querySelector(`.context-folder[data-name="${oldName}"]`);
                if (folder) {
                    folder.dataset.name = newName;
                    folder.querySelector('.name').textContent = newName;
                }
            }
        }
        renameModal.classList.remove('active');
    });
    
    renameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('rename-save').click();
        } else if (e.key === 'Escape') {
            renameModal.classList.remove('active');
        }
    });
}

export { 
    initializeContextExplorer,
    switchContext,
    addToContext,
    formatTokens,
    loadContextsFromAPI
};

// Function to rename a context folder (if not already defined)
function renameContextFolder(oldName, newName) {
    if (contextItems[newName]) {
        showToast('A context with the new name already exists.', 'error');
        return false;
    }
    contextItems[newName] = { ...contextItems[oldName] };
    delete contextItems[oldName];
    updateContextView(newName);
    showToast(`Renamed context "${oldName}" to "${newName}"`);
    return true;
}

// Add new helper function to scan directory contents
async function scanDirectoryContents(path) {
    try {
        const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error('Failed to scan directory');
        const files = await response.json();
        return files;
    } catch (error) {
        return [];
    }
}

function formatFileSize(bytes) {
    if (bytes === undefined || bytes === null) return '';
    const size = Number(bytes);  // Convert to number
    if (isNaN(size)) return '';  // Handle invalid numbers
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = size;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatTokens(tokens) {
    if (tokens === undefined || tokens === null) return '';
    return `${tokens.toLocaleString()} tokens`;
}