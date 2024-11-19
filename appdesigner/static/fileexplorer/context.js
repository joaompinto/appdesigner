import { showToast } from './editor.js';
import { loadFileTree, resetFileExplorer } from './filetree.js';

// Remove ALL from initial context items
let contextItems = {};
let currentContext = null;  // Changed from 'ALL' to null

function setupDragAndDrop() {
    const fileTree = document.getElementById('file-tree');
    const contextTree = document.getElementById('context-tree');

    // Make file tree items draggable
    fileTree.addEventListener('dragstart', (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;

        e.dataTransfer.setData('text/plain', fileItem.dataset.path);
        fileItem.classList.add('dragging');
    });

    fileTree.addEventListener('dragend', (e) => {
        const fileItem = e.target.closest('.file-tree-item');
        if (!fileItem) return;
        
        fileItem.classList.remove('dragging');
    });

    // Setup context tree as drop target
    contextTree.addEventListener('dragover', (e) => {
        const targetFolder = e.target.closest('.context-folder');
        if (!targetFolder) return;
        e.preventDefault();
        contextTree.classList.add('drag-over');
    });

    contextTree.addEventListener('dragleave', () => {
        contextTree.classList.remove('drag-over');
    });

    contextTree.addEventListener('drop', (e) => {
        e.preventDefault();
        contextTree.classList.remove('drag-over');
        
        const path = e.dataTransfer.getData('text/plain');
        const targetFolder = e.target.closest('.context-folder');
        
        if (!path || !targetFolder) return;
        
        const folderName = targetFolder.dataset.name;
        
        addToContext(path, folderName);
    });
}

function initializeContextExplorer() {
    const contextTree = document.getElementById('context-tree');
    contextTree.innerHTML = '';
    // Remove ALL folder creation - context tree starts empty
}

function createContextFolder(name) {
    const folder = document.createElement('div');
    folder.className = `context-folder${name === currentContext ? ' active' : ''}`;
    folder.dataset.name = name;
    
    const header = document.createElement('div');
    header.className = 'context-folder-header';
    // Remove the direct onclick assignment and use a function reference instead
    const handleClick = () => switchContext(folder.dataset.name); // Use dataset.name instead of name
    header.addEventListener('click', handleClick);
    
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.innerHTML = '📁';  // All folders use same icon now
    
    const title = document.createElement('span');
    title.className = 'name';
    title.textContent = name;
    title.contentEditable = true;  // All folders are editable
    title.spellcheck = false;
    
    // Update the blur handler for rename
    title.addEventListener('blur', () => {
        const newName = title.textContent.trim();
        if (newName !== name && newName) {
            if (renameContextFolder(name, newName)) {
                folder.dataset.name = newName;
                // Update active context if this folder is selected
                if (currentContext === name) {
                    currentContext = newName;
                    document.getElementById('active-context').textContent = newName;
                }
                // Update the name reference for future clicks
                name = newName; // Update the closure variable
            } else {
                // Revert name if rename failed
                title.textContent = name;
            }
        }
    });
    
    // Prevent enter key from creating new lines
    title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            title.blur();
        }
    });
    
    const controls = document.createElement('div');
    controls.className = 'folder-controls';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-button delete';
    deleteBtn.title = 'Delete Folder';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete context "${name}"?`)) {
            deleteContextFolder(name);
            folder.remove();
        }
    };
    controls.appendChild(deleteBtn);

    header.appendChild(icon);
    header.appendChild(title);
    header.appendChild(controls);
    folder.appendChild(header);
    
    // Create content container with initial visibility
    const content = document.createElement('div');
    content.className = 'context-folder-content';
    content.style.display = name === currentContext ? 'block' : 'none';
    folder.appendChild(content);
    
    return folder;
}

function switchContext(name) {
    // Update to handle null context
    if (name !== null && !contextItems[name]) {
        showToast(`Context "${name}" not found`, 'error');
        return;
    }
    
    // Update current context
    currentContext = name;
    
    // Update active context header
    document.getElementById('active-context').textContent = name || 'No Context Selected';
    
    // Reset file explorer path
    resetFileExplorer();
    
    // Update visual state of all folders
    document.querySelectorAll('.context-folder').forEach(folder => {
        const isActive = folder.dataset.name === name;
        folder.classList.toggle('active', isActive);
        folder.querySelector('.context-folder-content').style.display = isActive ? 'block' : 'none';
    });
    
    showToast(`Switched to ${name || 'no'} context`);
}

function deleteContextFolder(name) {
    if (contextItems[name]) {
        delete contextItems[name];
        showToast(`Folder "${name}" deleted`);
    }
}

function renameContextFolder(oldName, newName) {
    // Remove Default-specific check
    if (contextItems[newName]) {
        showToast('Folder name already exists', 'error');
        return false;
    }
    
    contextItems[newName] = contextItems[oldName];
    delete contextItems[oldName];
    showToast(`Folder renamed to "${newName}"`);
    return true;
}

function showFolderContent(folderElement) {
    const content = folderElement.querySelector('.context-folder-content');
    if (content) {
        content.style.display = 'block';
    }
}

// Remove 'export' from this function declaration
function addToContext(path, folderName) {
    if (!contextItems[folderName]) return;
    if (contextItems[folderName].has(path)) return; // Prevent duplicates
    
    contextItems[folderName].add(path);
    
    const contextTree = document.getElementById('context-tree');
    const folder = contextTree.querySelector(`.context-folder[data-name="${folderName}"]`);
    if (!folder) return;
    
    // Show folder content when adding new item
    showFolderContent(folder);
    
    const content = folder.querySelector('.context-folder-content');
    
    const item = document.createElement('div');
    item.className = 'context-tree-item';
    
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.innerHTML = path.includes('.') ? '📄' : '📁';
    
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = path;
    
    const remove = document.createElement('button');
    remove.innerHTML = '✕';
    remove.className = 'remove-context';
    remove.onclick = () => {
        item.remove();
        contextItems[folderName].delete(path);
    };
    
    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(remove);
    content.appendChild(item);
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize context explorer first
    initializeContextExplorer();

    // Add folder button handler
    const addFolderButton = document.getElementById('add-folder-button');
    addFolderButton.addEventListener('click', () => {
        let counter = 1;
        let folderName = 'New Folder';
        
        // Find unique name
        while (contextItems[folderName]) {
            folderName = `New Folder ${counter}`;
            counter++;
        }
        
        contextItems[folderName] = new Set();
        const contextTree = document.getElementById('context-tree');
        const newFolder = createContextFolder(folderName);
        contextTree.appendChild(newFolder);
        
        // Start rename immediately
        const titleElement = newFolder.querySelector('.name');
        titleElement.focus();
        document.execCommand('selectAll', false, null);
    });

    // Initialize drag and drop
    setupDragAndDrop();
});

export { 
    setupDragAndDrop,
    initializeContextExplorer,
    createContextFolder,
    switchContext,
    deleteContextFolder,
    renameContextFolder,
    showFolderContent,
    addToContext,
    contextItems,
    currentContext
};