import { agentAPI } from './agents.js';

// Add at top level, before any functions
let instructionCounter = 1;

// Define attachTabHandlers as a global function
function attachTabHandlers() {
    $('.log-tab').on('click', function(event) {
        event.stopPropagation();
        $('.log-tab').removeClass('active');
        $(this).addClass('active');
        
        const type = $(this).data('type');
        $('.logs-container').hide();
        $(`#${type}-logs`).show();
    });
}

export function refreshMainFrame() {
    const iframe = document.getElementById('main-iframe');
    if (iframe) {
        const currentSrc = iframe.src.split('?')[0];
        iframe.src = `${currentSrc}?t=${Date.now()}`;
        
        // Show popup
        const popup = document.querySelector('.refresh-popup');
        popup.classList.add('show');
        
        // Hide popup after 2 seconds
        setTimeout(() => {
            popup.classList.remove('show');
        }, 2000);
    }
}

function updateIframePort(port) {
    const iframe = document.getElementById('main-iframe');
    if (iframe) {
        iframe.src = `http://localhost:${port}`;
        iframe.dataset.port = port;
    }
}

export function handleKeyPress(event) {
    if (event.key === 'Enter') {
        const $input = $('#terminal-input');
        const command = $input.val();
        
        if (!command) return;
        
        // Create command line with current counter
        $('<div>')
            .addClass('terminal-line command-line')
            .text(`[${instructionCounter}] ${command}`)
            .insertBefore($input);

        const $loading = $('<div>')
            .addClass('terminal-line loading-indicator')
            .text('⟳ Processing request...')
            .insertBefore($input);
        
        // Use agentAPI with counter
        agentAPI.processUserInstructions(command, instructionCounter)
            .then(response => {
                // Increment counter only after successful processing
                instructionCounter++;
                // Remove loading indicator
                $loading.remove();
                
                if (command.startsWith('!')) {
                    // Show formatted response in modal
                    const $modal = $('#queryResponseModal');
                    const $content = $('#queryModalContent');
                    const question = command.substring(1).trim(); // Get question without !
                    
                    // Add question header and response content
                    $content.html(`
                        <div class="query-header">${question}</div>
                        ${response.response}
                    `);
                    
                    $modal.css('display', 'block');
                    
                    // Add click handler for code blocks
                    $content.find('pre code').each((i, block) => {
                        block.classList.add('hljs');
                    });
                } else if (response.response.toLowerCase().includes('error')) {
                    $('<div>')
                        .addClass('terminal-line response-line error')
                        .text(`Error: ${response.response}`)
                        .insertBefore($input);
                }
                
                // Add processing time as a separate line with highlight effect
                if (response.processingTime) {
                    $('<div>')
                        .addClass('terminal-line processing-time highlight')
                        .text(`⧖ Completed in ${response.processingTime}s`)
                        .insertBefore($input);
                }
                
                // Flash the input field to indicate ready for new command
                $input
                    .addClass('flash')
                    .one('animationend', function() {
                        $(this).removeClass('flash');
                    });
                
                // Only refresh iframe if not a query
                if (!command.startsWith('!')) {
                    refreshMainFrame();
                }
                
                // Update logs without expanding the section
                updateLogs();
            })
            .catch(error => {
                $loading.remove();

                if (error.type === 'overloaded') {
                    // Show retry modal
                    const $modal = $('#retryModal');
                    $modal.css('display', 'block');

                    // Setup retry handler
                    $('#retryButton').one('click', () => {
                        $modal.hide();
                        // Show loading again
                        $loading = $('<div>')
                            .addClass('terminal-line loading-indicator')
                            .text('⟳ Retrying request...')
                            .insertBefore($input);
                        
                        error.retry()
                            .then(response => {
                                $loading.remove();
                                handleResponse(response);
                            })
                            .catch(e => handleError(e));
                    });

                    // Setup cancel handler
                    $('#cancelButton').one('click', () => {
                        $modal.hide();
                        $('<div>')
                            .addClass('terminal-line response-line error')
                            .text('Request cancelled')
                            .insertBefore($input);
                    });
                } else {
                    $('<div>')
                        .addClass('terminal-line response-line error')
                        .text(`Error: ${error.message}`)
                        .insertBefore($input);
                }
                
                // Flash the input field even on error
                $input
                    .addClass('flash')
                    .one('animationend', function() {
                        $(this).removeClass('flash');
                    });
            });
        
        // Clear input
        $input.val('');
    }
}

function scrollToBottom() {
    const $terminalOutput = $('.terminal-output');
    if ($terminalOutput.length) {
        $terminalOutput.animate({ 
            scrollTop: $terminalOutput[0].scrollHeight 
        }, 200);
    }
}

$(document).ready(() => {
    // Load modal HTML
    $('#modal-container').load('/static/modal.html', function() {
        // Add modal close handlers
        $('.modal-close').on('click', function() {
            $(this).closest('.modal').hide();
        });
        
        $(window).on('click', function(event) {
            if ($(event.target).hasClass('modal')) {
                $('.modal').hide();
            }
        });
    });

    // Get port from URL params or use default
    const urlParams = new URLSearchParams(window.location.search);
    const port = urlParams.get('managed_port') || '8000';
    updateIframePort(port);
    
    // Add event listener for terminal input
    document.getElementById('terminal-input').addEventListener('keypress', handleKeyPress);
    
    // Start log updates immediately and then every second
    updateLogs();
    setInterval(updateLogs, 1000);
    
    // Add modal close handlers
    $('.modal-close').on('click', function() {
        $(this).closest('.modal').hide();
    });
    
    $(window).on('click', function(event) {
        if ($(event.target).hasClass('modal')) {
            $('.modal').hide();
        }
    });
    
    // Update logs section collapse functionality to use expand-arrow
    $('.expand-arrow').on('click', function(event) {
        event.stopPropagation(); // Prevent event bubbling
        const $section = $(this).closest('.logs-section');
        const isCollapsing = !$section.hasClass('collapsed');
        
        $section.toggleClass('collapsed');
        
        if (!isCollapsing) {
            // When expanding, immediately refresh logs
            updateLogs().then(() => {
                // Show and reset the active tab
                const $activeTab = $('.log-tab.active');
                const type = $activeTab.data('type');
                $('.logs-container').hide();
                $(`#${type}-logs`).show();
            });
        }
    });
    
    // Remove click handler from logs-header h2
    $('.logs-header h2').off('click');
    
    // Keep other event handlers...
    $('.log-tab').on('click', function(event) {
        event.stopPropagation(); // Prevent header click when clicking tabs
        $('.log-tab').removeClass('active');
        $(this).addClass('active');
        
        const type = $(this).data('type');
        $('.logs-container').hide();
        $(`#${type}-logs`).show();
    });
    
    // Initialize logs section as collapsed
    $('.logs-section').addClass('collapsed');
    
    // Add tab switching functionality
    $('.log-tab').on('click', function() {
        $('.log-tab').removeClass('active');
        $(this).addClass('active');
        
        const type = $(this).data('type');
        $('.logs-container').hide();
        $(`#${type}-logs`).show();
    });

    // Update log type switching functionality
    $('.log-type-button').on('click', function(event) {
        event.stopPropagation();
        
        if ($(this).hasClass('active')) return;
        
        $('.log-type-button').removeClass('active');
        $(this).addClass('active');
        
        const isContentLogs = $(this).text() === 'Content';
        const $tabs = $('.logs-tabs');
        const $label = $('.logs-label');
        const $section = $(this).closest('.logs-section');
        
        // Expand logs section if collapsed
        if ($section.hasClass('collapsed')) {
            $section.removeClass('collapsed');
            // Immediately refresh logs when expanding
            updateLogs();
        }
        
        // Update label text
        $label.text(isContentLogs ? 'Content Logs' : 'Server Logs');
        
        // Reset tabs based on active button
        if (isContentLogs) {
            $tabs.html(`
                <button class="log-tab active" data-type="files">Received</button>
                <button class="log-tab" data-type="sent">Sent</button>
            `);
            $('.logs-container').hide();
            $('#files-logs').show();
        } else {
            $tabs.html(`
                <button class="log-tab active" data-type="stdout">stdout</button>
                <button class="log-tab" data-type="stderr">stderr</button>
            `);
            $('.logs-container').hide();
            $('#stdout-logs').show();
        }
        
        attachTabHandlers();
    });

    // Initial tab handler attachment
    attachTabHandlers();

    // Add resize functionality
    initResizeArrows();
});

// Add resize functionality
function initResizeArrows() {
    const container = document.querySelector('.container');
    const storedWidth = localStorage.getItem('designerWidth');
    
    // Initialize with stored or default width
    if (storedWidth) {
        updateDesignerWidth(parseInt(storedWidth));
    } else {
        updateDesignerWidth(30); // Default 30%
    }

    document.querySelectorAll('.resize-arrow').forEach(arrow => {
        arrow.addEventListener('click', () => {
            const currentWidth = parseInt(getComputedStyle(document.documentElement)
                .getPropertyValue('--designer-width'));
            
            const minWidth = 20; // 20%
            const maxWidth = 60; // 60%
            const step = 5; // 5% per click
            
            let newWidth;
            if (arrow.classList.contains('right')) {
                newWidth = Math.max(minWidth, currentWidth - step);  // Reduce width
            } else {
                newWidth = Math.min(maxWidth, currentWidth + step);  // Increase width
            }
            
            updateDesignerWidth(newWidth);
        });
    });
}

function updateDesignerWidth(widthPercent) {
    const container = document.querySelector('.container');
    const newWidth = `${widthPercent}%`;
    
    // Update CSS variable
    document.documentElement.style.setProperty('--designer-width', newWidth);
    
    // Update grid template
    container.style.gridTemplateColumns = `calc(100% - ${newWidth}) ${newWidth}`;
    
    // Store preference
    localStorage.setItem('designerWidth', widthPercent);
    
    // Update container data attributes for arrow visibility
    container.toggleAttribute('data-at-min', widthPercent <= 20);
    container.toggleAttribute('data-at-max', widthPercent >= 60);
}

async function updateLogs() {
    try {
        const data = await agentAPI.getLogs();
        const $stdout = $('#stdout-logs');
        const $stderr = $('#stderr-logs');
        const $files = $('#files-logs');
        const $sent = $('#sent-logs');
        
        // Function to update specific log container
        const updateLogContainer = ($container, content) => {
            if (!content) return;

            // Simple update without accumulation
            $container.empty();
            content.split('\n').forEach(line => {
                if (line.trim()) {
                    $('<div>')
                        .addClass('log-line')
                        .text(line)
                        .appendTo($container);
                }
            });
            
            // Auto-scroll if container is visible
            if ($container.is(':visible')) {
                $container.scrollTop($container[0].scrollHeight);
            }
        };

        // Update each container
        updateLogContainer($stdout, data.stdout);
        updateLogContainer($stderr, data.stderr);
        updateLogContainer($files, data.files);
        updateLogContainer($sent, data.sent);

        return Promise.resolve();
    } catch (error) {
        return Promise.reject(error);
    }
}

// Update click handler for log type buttons
$('.log-type-button').on('click', function(event) {
    event.stopPropagation();
    
    if ($(this).hasClass('active')) return;
    
    $('.log-type-button').removeClass('active');
    $(this).addClass('active');
    
    const isContentLogs = $(this).text() === 'Content';
    const $tabs = $('.logs-tabs');
    const $label = $('.logs-label');
    const $section = $(this).closest('.logs-section');
    
    // Expand logs section if collapsed
    if ($section.hasClass('collapsed')) {
        $section.removeClass('collapsed');
    }
    
    // Update label text
    $label.text(isContentLogs ? 'Content Logs' : 'Server Logs');
    
    // Reset tabs and show appropriate container
    if (isContentLogs) {
        $tabs.html(`
            <button class="log-tab active" data-type="files">Received</button>
            <button class="log-tab" data-type="sent">Sent</button>
        `);
        $('.logs-container').hide();
        $('#files-logs').show();
    } else {
        $tabs.html(`
            <button class="log-tab active" data-type="stdout">stdout</button>
            <button class="log-tab" data-type="stderr">stderr</button>
        `);
        $('.logs-container').hide();
        $('#stdout-logs').show();
    }
    
    // Force immediate log update
    updateLogs();
    
    // Reattach tab handlers
    attachTabHandlers();
});