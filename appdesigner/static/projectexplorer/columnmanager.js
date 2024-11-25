export function toggleVisibleColumn(columnType) {
    const fileContentColumn = document.querySelector('.file-content-column');
    const contextColumn = document.getElementById('context-view');

    // First reset all columns
    if (fileContentColumn) {
        fileContentColumn.classList.remove('visible');
        fileContentColumn.style.display = 'none';
    }
    if (contextColumn) {
        contextColumn.classList.remove('visible');
        contextColumn.style.display = 'none';
    }

    // Show selected column
    switch (columnType) {
        case 'file':
            if (fileContentColumn) {
                fileContentColumn.style.display = 'flex';
                // Use requestAnimationFrame to ensure display takes effect before adding visible class
                requestAnimationFrame(() => {
                    fileContentColumn.classList.add('visible');
                });
            }
            break;
            
        case 'context':
            if (contextColumn) {
                contextColumn.style.display = 'flex';
                // Use requestAnimationFrame to ensure display takes effect before adding visible class
                requestAnimationFrame(() => {
                    contextColumn.classList.add('visible');
                });
            }
            break;
            
        case 'none':
            break;
            
        default:
            console.warn('Unknown column type:', columnType);
    }
}