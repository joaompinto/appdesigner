import { showToast } from './editor.js';
import { loadFileTree, resetFileExplorer } from './filetree.js';
import { clearFileSelection } from './filetree.js';

// Initialize with predefined tags instead of ALL context
let contextItems = {
    'Requirements': {
        type: 'tag',
        color: 'blue',
        items: new Set()
    },
    'Documentation': {
        type: 'tag',
        color: 'green',
        items: new Set()
    },
    'Tests': {
        type: 'tag',
        color: 'purple',
        items: new Set()
    },
    'Core': {
        type: 'tag',
        color: 'red',
        items: new Set()
    }
};

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
    tag.className = `context-tag ${color}`;
    tag.dataset.name = name;
    
    const label = document.createElement('span');
    label.className = 'tag-label';
    label.textContent = name;
    
    const count = document.createElement('span');
    count.className = 'tag-count';
    count.textContent = contextItems[name].items.size;
    
    tag.appendChild(label);
    tag.appendChild(count);
    
    // Add click handler for selection
    tag.addEventListener('click', () => switchContext(name));
    
    // Add dragover and drop handlers for adding files to context
    tag.addEventListener('dragover', (e) => {
        e.preventDefault();
        tag.classList.add('drag-over');
    });

    tag.addEventListener('dragleave', () => {
        tag.classList.remove('drag-over');
    });

    tag.addEventListener('drop', (e) => {
        e.preventDefault();
        tag.classList.remove('drag-over');
        
        const path = e.dataTransfer.getData('text/plain');
        if (!path) return;
        
        addToContext(path, name);
    });

    return tag;
}

function switchContext(name) {
    // Clear selections and update UI
    clearFileSelection();
    
    // Clear other context selections
    document.querySelectorAll('.context-tag').forEach(tag => {
        tag.classList.remove('active');
    });
    
    if (name !== null && !contextItems[name]) {
        showToast(`Context "${name}" not found`, 'error');
        return;
    }
    
    window.currentContext = name;
    if (name === null) return;
    
    // Update active state
    const tag = document.querySelector(`.context-tag[data-name="${name}"]`);
    if (tag) {
        tag.classList.add('active');
    }
    
    // Update content header and display view
    const currentFileElement = document.getElementById('current-file');
    currentFileElement.textContent = name ? `Showing context ${name}` : 'No file selected';
    displayContextView(name);
    
    // Ensure the context view is visible
    const contextViewElement = document.getElementById('context-view');
    if (contextViewElement) {
        contextViewElement.style.display = 'block';
    }
    
    // Hide editor placeholder if it exists
    const editorPlaceholder = document.querySelector('.editor-placeholder');
    if (editorPlaceholder) {
        editorPlaceholder.style.display = 'none';
    }

    // Hide CodeMirror editor if it exists
    if (window.editor) {
        window.editor.getWrapperElement().style.display = 'none';
    }
    
    showToast(`Switched to ${name} context`);

    // Toggle visibility of columns
    const fileContentColumn = document.querySelector('.file-content-column');
    const contextViewColumn = document.getElementById('context-view');
    
    fileContentColumn.style.display = 'none';
    contextViewColumn.style.display = 'flex';
}

// Add function to handle context item removal from the UI
window.removeFromContext = function(contextName, path) {
    if (contextItems[contextName] && contextItems[contextName].items) {
        contextItems[contextName].items.delete(path);
        displayContextView(contextName); // Refresh the display
        showToast(`Removed ${path} from context ${contextName}`);
    }
};

function addToContext(path, contextName) {
    if (!contextItems[contextName]) return;
    if (contextItems[contextName].items.has(path)) return; // Prevent duplicates
    
    contextItems[contextName].items.add(path);
    
    // Update the counter
    const tag = document.querySelector(`.context-tag[data-name="${contextName}"] .tag-count`);
    if (tag) {
        tag.textContent = contextItems[contextName].items.size;
    }
    
    // Refresh context view if this is the active context
    if (window.currentContext === contextName) {
        displayContextView(contextName);
        showToast(`Added ${path} to context ${contextName}`);
    }
}

// Add the displayContextView function
function displayContextView(name) {
    const viewContainer = document.getElementById('context-view');
    if (!viewContainer) return;

    // Make sure the context view is visible
    viewContainer.style.display = 'block';
    viewContainer.innerHTML = '';

    const context = contextItems[name];
    if (!context) {
        viewContainer.innerHTML = '<div class="error">Context not found.</div>';
        return;
    }

    // Create view header with count
    const viewHeader = document.createElement('div');
    viewHeader.className = 'context-view-header';
    viewHeader.innerHTML = `
        <div class="context-title ${context.color}">${name}</div>
        <div class="context-count">${context.items.size} file${context.items.size !== 1 ? 's' : ''}</div>
    `;
    viewContainer.appendChild(viewHeader);

    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'context-content-wrapper';

    // Create items list
    const itemsList = document.createElement('div');
    itemsList.className = 'context-items';

    if (context.items.size > 0) {
        context.items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'context-item';
            
            const itemPath = document.createElement('span');
            itemPath.className = 'item-path';
            itemPath.textContent = item;
            
            const removeButton = document.createElement('button');
            removeButton.className = 'remove-button';
            removeButton.innerHTML = '✕';
            removeButton.title = 'Remove from context';
            removeButton.onclick = () => window.removeFromContext(name, item);
            
            itemElement.appendChild(itemPath);
            itemElement.appendChild(removeButton);
            itemsList.appendChild(itemElement);
        });
    } else {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <span class="empty-icon">📁</span>
            <p>No files in this context</p>
            <p class="empty-hint">Drag files here to add them</p>
        `;
        itemsList.appendChild(emptyState);
    }

    // Assemble the view
    contentWrapper.appendChild(itemsList);
    viewContainer.appendChild(contentWrapper);
}

// Add the setupDragAndDrop function
function setupDragAndDrop() {
    const fileTree = document.getElementById('file-tree');

    fileTree.addEventListener('dragstart', (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (fileItem && fileItem.classList.contains('file')) {
            e.dataTransfer.setData('text/plain', fileItem.dataset.path);
        }
    });

    fileTree.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    fileTree.addEventListener('drop', (e) => {
        e.preventDefault();
        const path = e.dataTransfer.getData('text/plain');
        const targetItem = e.target.closest('.file-tree-item');
        if (targetItem && targetItem.classList.contains('directory')) {
            const newPath = `${targetItem.dataset.path}/${path.split('/').pop()}`;
            // Implement file move logic here
            showToast(`Moved ${path} to ${newPath}`, 'success');
            // Update UI accordingly
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize context explorer first
    initializeContextExplorer();

    // Handle create tag button and modal
    const createTagButton = document.getElementById('create-tag-button');
    const modal = document.getElementById('new-folder-modal');
    const input = document.getElementById('new-folder-name');
    const cancelButton = document.getElementById('modal-cancel');
    const createButton = document.getElementById('modal-create');

    createTagButton.addEventListener('click', () => {
        modal.classList.add('active');
        modal.dataset.parentPath = '';  // Reset parent path for root level tags
        input.value = '';
        input.focus();
    });

    cancelButton.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    const createTag = () => {
        const tagName = input.value.trim();
        if (!tagName) {
            showToast('Tag name cannot be empty', 'error');
            return;
        }

        // Check if tag already exists at root level
        if (contextItems[tagName]) {
            showToast('A tag with this name already exists', 'error');
            return;
        }
        
        // Create new context tag
        contextItems[tagName] = createContextItem();
        
        // Update UI
        renderContextTree(document.getElementById('context-tree'));
        modal.classList.remove('active');
        
        // Switch to the newly created context
        switchContext(tagName);
        showToast(`Created new context tag: ${tagName}`);
    };

    createButton.addEventListener('click', createTag);
    
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            createTag();
        } else if (e.key === 'Escape') {
            modal.classList.remove('active');
        }
    });

    // Initialize drag and drop
    setupDragAndDrop();

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
            showRenameModal(folderName);
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

    document.getElementById('file-tree').addEventListener('click', async (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;

        // Show file content column and hide context view
        document.querySelector('.file-content-column').style.display = 'flex';
        document.getElementById('context-view').style.display = 'none';
        
        // ...rest of the existing click handler code...
    });
});

export { 
    initializeContextExplorer,
    switchContext,
    addToContext,
    contextItems,
    setupDragAndDrop
};

// Function to rename a context folder (if not already defined)
function renameContextFolder(oldName, newName) {
    if (contextItems[newName]) {
        showToast('A context with the new name already exists.', 'error');
        return false;
    }
    contextItems[newName] = { ...contextItems[oldName] };
    delete contextItems[oldName];
    displayContextView(newName);
    showToast(`Renamed context "${oldName}" to "${newName}"`);
    return true;
}