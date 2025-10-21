console.log('🚀 ClearCode main.js is loading...');
console.log('📅 File loaded at:', new Date().toLocaleTimeString());

let editor;
let guidesEnabled = false;
let dyslexiaModeEnabled = false;
let visualGuideDecorations = [];
let dyslexiaSettings = {
    font: false,
    spacing: false,
    lineHighlight: false,
    blockHighlight: false
};

// Multiple files management
let openFiles = new Map();
let activeFileId = null;
let nextFileId = 1;

// Performance-related variables
let updateTimeout = null;
let lastLanguage = null;
let isUpdating = false;
let autoSaveInterval = null;

// Search/Replace functionality
let searchState = {
    isOpen: false,
    isReplaceMode: false,
    currentQuery: '',
    currentMatches: [],
    currentMatchIndex: -1,
    decorations: []
};

// Error handling system
let errorHandler = {
    isRecoveryMode: false,
    lastError: null,
    errorCount: 0,
    maxErrors: 5,
    recoveryAttempts: 0,
    maxRecoveryAttempts: 3
};

// Connection monitoring
let connectionMonitor = {
    isOnline: navigator.onLine,
    lastCheck: Date.now(),
    checkInterval: 30000
};

// Performance configuration
const PERFORMANCE_CONFIG = {
    UPDATE_DELAY: 150,
    MAX_LINES_FOR_FULL_SCAN: 1000,
    VIEWPORT_BUFFER: 50,
    DEBOUNCE_DELAY: 300,
    MAX_UPDATE_FREQUENCY: 16,
    TYPING_DELAY: 500
};

// Color configuration
let guideConfig = {
    spaceChar: '·',
    spaceColor: '#6495ed',
    spaceOpacity: 0.7,
    tabChar: '→',
    tabColor: '#6495ed',
    pythonColonChar: '►',
    pythonColonColor: '#32cd32',
    pythonOpacity: 0.8,
    blockStartChar: '┌─',
    blockEndChar: '└─',
    blockColor: '#ffa500',
    blockOpacity: 0.8,
    indentGuideChar: '┊',
    indentGuideColor: '#32cd32',
    indentOpacity: 0.6
};

// Settings persistence
const SETTINGS_KEY = 'clearcode-settings';
const SESSION_KEY = 'clearcode-session';

// Default settings
const defaultSettings = {
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: "'Consolas', 'Courier New', monospace",
    wordWrap: false,
    showMinimap: false,
    showLineNumbers: true,
    autoSave: false,
    guidesEnabled: false,
    spaceGuides: true,
    blockGuides: true,
    indentGuides: true,
    guideConfig: {
        spaceColor: '#6495ed',
        spaceOpacity: 0.7,
        blockColor: '#ffa500',
        blockOpacity: 0.8,
        pythonColonColor: '#32cd32',
        pythonOpacity: 0.8,
        indentGuideColor: '#32cd32',
        indentOpacity: 0.6
    },
    dyslexiaModeEnabled: false,
    dyslexiaSettings: {
        font: false,
        spacing: false,
        lineHighlight: false,
        blockHighlight: false
    }
};

// Error types
const ERROR_TYPES = {
    EDITOR_INIT: 'editor_initialization',
    FILE_OPERATION: 'file_operation',
    STORAGE: 'storage_operation',
    NETWORK: 'network_error',
    VISUAL_GUIDES: 'visual_guides_error',
    SEARCH: 'search_error',
    SETTINGS: 'settings_error',
    UNKNOWN: 'unknown_error'
};

// Global error handler
window.addEventListener('error', (event) => {
    handleGlobalError(event.error, ERROR_TYPES.UNKNOWN, 'Global error occurred');
});

window.addEventListener('unhandledrejection', (event) => {
    handleGlobalError(event.reason, ERROR_TYPES.UNKNOWN, 'Unhandled promise rejection');
});

// Setup connection monitoring
window.addEventListener('online', () => {
    connectionMonitor.isOnline = true;
    hideConnectionStatus();
    showNotification('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    connectionMonitor.isOnline = false;
    showConnectionStatus();
    showNotification('Working offline', 'warning');
});

function handleGlobalError(error, type = ERROR_TYPES.UNKNOWN, context = 'Unknown context') {
    console.error('Global error:', error, 'Type:', type, 'Context:', context);
    
    errorHandler.errorCount++;
    errorHandler.lastError = {
        error: error,
        type: type,
        context: context,
        timestamp: new Date().toISOString(),
        stack: error?.stack || 'No stack trace available'
    };
    
    if (errorHandler.errorCount >= errorHandler.maxErrors && !errorHandler.isRecoveryMode) {
        enableRecoveryMode();
        return;
    }
    
    try {
        switch (type) {
            case ERROR_TYPES.STORAGE:
                handleStorageError(error, context);
                break;
            case ERROR_TYPES.FILE_OPERATION:
                handleFileError(error, context);
                break;
            case ERROR_TYPES.EDITOR_INIT:
                handleEditorError(error, context);
                break;
            default:
                if (getErrorReportingEnabled()) {
                    showErrorModal(error, type, context);
                } else {
                    showNotification('An error occurred. Check console for details.', 'error');
                }
                break;
        }
    } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
        showNotification('Critical error occurred. Please refresh the page.', 'error');
    }
}

function handleStorageError(error, context) {
    console.warn('Storage error:', error, 'Context:', context);
    showNotification('Storage error occurred. Settings may not persist.', 'warning');
}

function handleFileError(error, context) {
    console.warn('File operation error:', error, 'Context:', context);
    showNotification('File operation failed. Please try again.', 'error');
}

function handleEditorError(error, context) {
    console.error('Editor error:', error, 'Context:', context);
    showErrorModal(error, ERROR_TYPES.EDITOR_INIT, 'Failed to initialize Monaco Editor');
}

function enableRecoveryMode() {
    errorHandler.isRecoveryMode = true;
    errorHandler.recoveryAttempts++;
    showRecoveryIndicator();
    showNotification('Recovery mode enabled due to multiple errors', 'warning');
}

function disableRecoveryMode() {
    errorHandler.isRecoveryMode = false;
    errorHandler.errorCount = 0;
    hideRecoveryIndicator();
    showNotification('Recovery mode disabled', 'success');
}

function showErrorModal(error, type, context) {
    const modal = document.getElementById('errorModal');
    const message = document.getElementById('errorMessage');
    
    if (!modal || !message) return;
    
    let userMessage = 'An unexpected error occurred.';
    switch (type) {
        case ERROR_TYPES.EDITOR_INIT:
            userMessage = 'Failed to initialize the code editor. Please refresh the page.';
            break;
        case ERROR_TYPES.FILE_OPERATION:
            userMessage = 'File operation failed. Your changes may not be saved.';
            break;
        case ERROR_TYPES.STORAGE:
            userMessage = 'Storage operation failed. Settings may not persist.';
            break;
        default:
            userMessage = context || 'An unexpected error occurred.';
    }
    
    message.textContent = userMessage;
    modal.classList.remove('hidden');
    
    setupErrorModalEvents();
}

function setupErrorModalEvents() {
    const closeBtn = document.getElementById('closeError');
    const showDetailsBtn = document.getElementById('showErrorDetails');
    const reportBtn = document.getElementById('reportError');
    const recoverBtn = document.getElementById('recoverSession');
    const resetBtn = document.getElementById('resetEditor');
    
    if (closeBtn) closeBtn.onclick = () => hideErrorModal();
    if (showDetailsBtn) showDetailsBtn.onclick = toggleErrorDetails;
    if (reportBtn) reportBtn.onclick = downloadErrorReport;
    if (recoverBtn) recoverBtn.onclick = attemptSessionRecovery;
    if (resetBtn) resetBtn.onclick = performEditorReset;
}

function hideErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) modal.classList.add('hidden');
}

function toggleErrorDetails() {
    const details = document.getElementById('errorDetails');
    const stack = document.getElementById('errorStack');
    if (details && stack && errorHandler.lastError) {
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
        stack.textContent = errorHandler.lastError.stack;
    }
}

function downloadErrorReport() {
    if (!errorHandler.lastError) return;
    
    const report = {
        error: errorHandler.lastError,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        url: window.location.href
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clearcode-error-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Error report downloaded', 'success');
}

function attemptSessionRecovery() {
    try {
        const session = localStorage.getItem(SESSION_KEY);
        if (session) {
            const data = JSON.parse(session);
            loadSession(data);
            showNotification('Session recovered successfully', 'success');
            hideErrorModal();
        } else {
            showNotification('No session data to recover', 'warning');
        }
    } catch (error) {
        console.error('Session recovery failed:', error);
        showNotification('Session recovery failed', 'error');
    }
}

function performEditorReset() {
    if (confirm('This will reset the editor to default settings. Continue?')) {
        try {
            localStorage.removeItem(SETTINGS_KEY);
            localStorage.removeItem(SESSION_KEY);
            location.reload();
        } catch (error) {
            console.error('Reset failed:', error);
            showNotification('Reset failed. Please try refreshing manually.', 'error');
        }
    }
}

function showRecoveryIndicator() {
    // Visual indicator could be added here
    console.log('Recovery mode active');
}

function hideRecoveryIndicator() {
    console.log('Recovery mode inactive');
}

function showConnectionStatus() {
    const status = document.getElementById('connectionStatus');
    if (status) status.classList.remove('hidden');
}

function hideConnectionStatus() {
    const status = document.getElementById('connectionStatus');
    if (status) status.classList.add('hidden');
}

function getErrorReportingEnabled() {
    const checkbox = document.getElementById('enableErrorReporting');
    return checkbox ? checkbox.checked : true;
}

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
    try {
        showLoadingOverlay();
        
        // Define custom colorblind-friendly themes
        monaco.editor.defineTheme('tritanopia-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                // For tritanopia - avoid blue and yellow
                { token: 'keyword', foreground: 'ff0066', fontStyle: 'bold' },  // Hot pink for keywords (function, const, etc)
                { token: 'string', foreground: '00ff99' },  // Cyan-green for strings
                { token: 'number', foreground: 'ff0099' },  // Magenta for numbers
                { token: 'comment', foreground: '808080', fontStyle: 'italic' },  // Gray for comments
                { token: 'variable', foreground: 'ffffff' },  // White for variables
                { token: 'type', foreground: '00ffcc' },  // Bright cyan for types
                { token: 'function', foreground: 'ff0066' },  // Hot pink for function names
                { token: 'operator', foreground: 'ff66ff' },  // Light magenta for operators
                { token: 'delimiter', foreground: 'cccccc' },  // Light gray for brackets/parentheses
                { token: 'delimiter.bracket', foreground: 'ff99cc' },  // Pink for brackets
                { token: 'delimiter.parenthesis', foreground: 'ff99cc' },  // Pink for parentheses
                { token: 'delimiter.curly', foreground: 'ff99cc' },  // Pink for curly braces
            ],
            colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#ffffff',
                'editor.lineHighlightBackground': '#2d2d2d',
                'editorCursor.foreground': '#ff0066',
                'editor.selectionBackground': '#3d3d3d',
            }
        });
        
        monaco.editor.defineTheme('protanopia-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                // For protanopia/deuteranopia (red-green colorblindness) - avoid red and green
                { token: 'keyword', foreground: '0099ff', fontStyle: 'bold' },  // Blue for keywords
                { token: 'string', foreground: 'ff9900' },  // Orange for strings
                { token: 'number', foreground: 'cc00cc' },  // Purple for numbers
                { token: 'comment', foreground: '808080', fontStyle: 'italic' },  // Gray for comments
                { token: 'variable', foreground: 'ffffff' },  // White for variables
                { token: 'type', foreground: '00ccff' },  // Cyan for types
                { token: 'function', foreground: '0099ff' },  // Blue for function names
                { token: 'operator', foreground: 'cc99ff' },  // Light purple for operators
                { token: 'delimiter', foreground: 'cccccc' },  // Light gray
                { token: 'delimiter.bracket', foreground: '9999ff' },
                { token: 'delimiter.parenthesis', foreground: '9999ff' },
                { token: 'delimiter.curly', foreground: '9999ff' },
            ],
            colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#ffffff',
                'editor.lineHighlightBackground': '#2d2d2d',
                'editorCursor.foreground': '#0099ff',
                'editor.selectionBackground': '#3d3d3d',
            }
        });
        
        monaco.editor.defineTheme('high-contrast-colorblind', {
            base: 'hc-black',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'ff00ff', fontStyle: 'bold' },  // Magenta
                { token: 'string', foreground: '00ffff' },  // Cyan
                { token: 'number', foreground: 'ff00ff' },  // Magenta
                { token: 'comment', foreground: 'aaaaaa', fontStyle: 'italic' },
                { token: 'variable', foreground: 'ffffff' },
                { token: 'type', foreground: '00ffff' },
                { token: 'function', foreground: 'ff00ff' },
                { token: 'operator', foreground: 'ffffff' },
                { token: 'delimiter', foreground: 'ffffff' },
            ],
            colors: {
                'editor.background': '#000000',
                'editor.foreground': '#ffffff',
                'editorCursor.foreground': '#ff00ff',
            }
        });
        
        console.log('Custom colorblind themes defined');
        
        editor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: '// Welcome to ClearCode!\n// Start typing to see visual guides...\n\nfunction hello() {\n    console.log("Hello World!");\n}\n',
            language: 'javascript',
            theme: 'vs-dark',
            fontSize: 14,
            fontFamily: "'Consolas', 'Courier New', monospace",
            wordWrap: 'off',
            minimap: { enabled: false },
            lineNumbers: 'on',
            glyphMargin: true,  // Enable glyph margin for block markers
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderWhitespace: 'none',
            guides: {
                indentation: false
            }
        });

        hideLoadingOverlay();
        
        // Setup event listeners and systems
        setupEventListeners();
        setupColorCustomization();  // NEW: Setup color pickers
        setupDyslexiaMode();         // NEW: Setup dyslexia mode
        setupSettings();
        setupFileManagement();
        setupHelpSystem();
        setupKeyboardShortcuts();
        initTextToSpeech();          // NEW: Initialize Text-to-Speech
        setupTTSKeyboardShortcuts(); // NEW: Setup TTS keyboard shortcuts
        initFeedbackSystem();        // NEW: Initialize Feedback System
        setupFeedbackKeyboardShortcut(); // NEW: Setup feedback keyboard shortcut
        loadSettings();
        checkFirstTimeUser();
        
        // Auto-save session periodically
        setInterval(saveSession, 30000);
        
    } catch (error) {
        hideLoadingOverlay();
        handleGlobalError(error, ERROR_TYPES.EDITOR_INIT, 'Failed to initialize Monaco Editor');
    }
});

// NEW FUNCTION: Setup color customization
function setupColorCustomization() {
    console.log('=== SETUP COLOR CUSTOMIZATION START ===');
    
    // Color pickers
    const spaceColorPicker = document.getElementById('spaceColor');
    const spaceOpacitySlider = document.getElementById('spaceOpacity');
    const blockColorPicker = document.getElementById('blockColor');
    const blockOpacitySlider = document.getElementById('blockOpacity');
    const pythonColorPicker = document.getElementById('pythonColor');
    const pythonOpacitySlider = document.getElementById('pythonOpacity');
    const indentColorPicker = document.getElementById('indentColor');
    const indentOpacitySlider = document.getElementById('indentOpacity');
    
    console.log('Color pickers found:', {
        spaceColor: !!spaceColorPicker,
        spaceOpacity: !!spaceOpacitySlider,
        blockColor: !!blockColorPicker,
        blockOpacity: !!blockOpacitySlider,
        pythonColor: !!pythonColorPicker,
        pythonOpacity: !!pythonOpacitySlider,
        indentColor: !!indentColorPicker,
        indentOpacity: !!indentOpacitySlider
    });
    
    // Color picker event listeners
    if (spaceColorPicker) {
        spaceColorPicker.addEventListener('input', (e) => {
            console.log('Space color changed to:', e.target.value);
            guideConfig.spaceColor = e.target.value;
            guideConfig.tabColor = e.target.value;
            updateGuideStyles();
            // Auto-enable guides and force refresh
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (spaceOpacitySlider) {
        spaceOpacitySlider.addEventListener('input', (e) => {
            guideConfig.spaceOpacity = parseFloat(e.target.value);
            console.log('Space opacity changed to:', guideConfig.spaceOpacity);
            e.target.nextElementSibling.textContent = Math.round(guideConfig.spaceOpacity * 100) + '%';
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (blockColorPicker) {
        blockColorPicker.addEventListener('input', (e) => {
            console.log('Block color changed to:', e.target.value);
            guideConfig.blockColor = e.target.value;
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (blockOpacitySlider) {
        blockOpacitySlider.addEventListener('input', (e) => {
            guideConfig.blockOpacity = parseFloat(e.target.value);
            console.log('Block opacity changed to:', guideConfig.blockOpacity);
            e.target.nextElementSibling.textContent = Math.round(guideConfig.blockOpacity * 100) + '%';
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (pythonColorPicker) {
        pythonColorPicker.addEventListener('input', (e) => {
            console.log('Python color changed to:', e.target.value);
            guideConfig.pythonColonColor = e.target.value;
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (pythonOpacitySlider) {
        pythonOpacitySlider.addEventListener('input', (e) => {
            guideConfig.pythonOpacity = parseFloat(e.target.value);
            console.log('Python opacity changed to:', guideConfig.pythonOpacity);
            e.target.nextElementSibling.textContent = Math.round(guideConfig.pythonOpacity * 100) + '%';
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (indentColorPicker) {
        indentColorPicker.addEventListener('input', (e) => {
            console.log('Indent color changed to:', e.target.value);
            guideConfig.indentGuideColor = e.target.value;
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    if (indentOpacitySlider) {
        indentOpacitySlider.addEventListener('input', (e) => {
            guideConfig.indentOpacity = parseFloat(e.target.value);
            console.log('Indent opacity changed to:', guideConfig.indentOpacity);
            e.target.nextElementSibling.textContent = Math.round(guideConfig.indentOpacity * 100) + '%';
            updateGuideStyles();
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show color changes', 'info');
            } else {
                clearVisualGuides();
                updateVisualGuides();
            }
        });
    }
    
    // Preset buttons
    const defaultPreset = document.getElementById('resetColors');
    const highContrastPreset = document.getElementById('highContrast');
    const colorblindPreset = document.getElementById('colorblindFriendly');
    const blueYellowPreset = document.getElementById('blueYellowFriendly');
    
    console.log('Preset buttons found:', {
        resetColors: !!defaultPreset,
        highContrast: !!highContrastPreset,
        colorblindFriendly: !!colorblindPreset,
        blueYellowFriendly: !!blueYellowPreset
    });
    
    if (defaultPreset) {
        console.log('Adding click listener to Reset to Default button');
        defaultPreset.addEventListener('click', () => {
            console.log('=== RESET TO DEFAULT CLICKED ===');
            applyColorPreset('default');
            // Restore default Monaco theme
            if (editor) {
                editor.updateOptions({ theme: 'vs-dark' });
                console.log('Applied vs-dark (default) theme');
            }
            showNotification('Default colors applied', 'success');
            // Auto-enable guides if not already enabled
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show colors', 'info');
            }
        });
    } else {
        console.error('ERROR: Reset to Default button NOT FOUND (ID: resetColors)');
    }
    
    if (highContrastPreset) {
        console.log('Adding click listener to High Contrast button');
        highContrastPreset.addEventListener('click', () => {
            console.log('=== HIGH CONTRAST CLICKED ===');
            applyColorPreset('highContrast');
            // Apply high contrast Monaco theme
            if (editor) {
                editor.updateOptions({ theme: 'high-contrast-colorblind' });
                console.log('Applied high-contrast-colorblind theme');
            }
            showNotification('High contrast colors applied', 'success');
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show colors', 'info');
            }
        });
    } else {
        console.error('ERROR: High Contrast button NOT FOUND (ID: highContrast)');
    }
    
    if (colorblindPreset) {
        console.log('Adding click listener to Red-Green Friendly button');
        colorblindPreset.addEventListener('click', () => {
            console.log('=== RED-GREEN FRIENDLY CLICKED ===');
            applyColorPreset('colorblind');
            // Apply protanopia/deuteranopia Monaco theme (red-green colorblind)
            if (editor) {
                editor.updateOptions({ theme: 'protanopia-dark' });
                console.log('Applied protanopia-dark theme');
            }
            showNotification('Red-green colorblind friendly colors applied', 'success');
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show colors', 'info');
            }
        });
    } else {
        console.error('ERROR: Red-Green Friendly button NOT FOUND (ID: colorblindFriendly)');
    }
    
    if (blueYellowPreset) {
        console.log('Adding click listener to Blue-Yellow Friendly button');
        blueYellowPreset.addEventListener('click', () => {
            console.log('=== BLUE-YELLOW FRIENDLY CLICKED ===');
            applyColorPreset('blueYellow');
            // Apply tritanopia Monaco theme (blue-yellow colorblind)
            if (editor) {
                editor.updateOptions({ theme: 'tritanopia-dark' });
                console.log('Applied tritanopia-dark theme');
            }
            showNotification('Blue-yellow colorblind friendly colors applied', 'success');
            if (!guidesEnabled) {
                toggleGuides();
                showNotification('Visual guides enabled to show colors', 'info');
            }
        });
    } else {
        console.error('ERROR: Blue-Yellow Friendly button NOT FOUND (ID: blueYellowFriendly)');
    }
    
    console.log('=== SETUP COLOR CUSTOMIZATION END ===');
    
    // Initialize styles
    updateGuideStyles();
}

// NEW FUNCTION: Apply color presets
function applyColorPreset(preset) {
    console.log('applyColorPreset called with:', preset);
    
    switch (preset) {
        case 'default':
            guideConfig.spaceColor = '#6495ed';
            guideConfig.spaceOpacity = 0.7;
            guideConfig.blockColor = '#ffa500';
            guideConfig.blockOpacity = 0.8;
            guideConfig.pythonColonColor = '#32cd32';
            guideConfig.pythonOpacity = 0.8;
            guideConfig.indentGuideColor = '#32cd32';
            guideConfig.indentOpacity = 0.6;
            break;
            
        case 'highContrast':
            guideConfig.spaceColor = '#00ffff';
            guideConfig.spaceOpacity = 1.0;
            guideConfig.blockColor = '#ffff00';
            guideConfig.blockOpacity = 1.0;
            guideConfig.pythonColonColor = '#00ff00';
            guideConfig.pythonOpacity = 1.0;
            guideConfig.indentGuideColor = '#00ff00';
            guideConfig.indentOpacity = 0.9;
            break;
            
        case 'colorblind':
            guideConfig.spaceColor = '#0066cc';
            guideConfig.spaceOpacity = 0.8;
            guideConfig.blockColor = '#ff9900';
            guideConfig.blockOpacity = 0.9;
            guideConfig.pythonColonColor = '#9933ff';
            guideConfig.pythonOpacity = 0.8;
            guideConfig.indentGuideColor = '#9933ff';
            guideConfig.indentOpacity = 0.7;
            break;
            
        case 'blueYellow':
            // For tritanopia (blue-yellow colorblindness)
            // Avoid blue and yellow - use red, pink, cyan, magenta
            guideConfig.spaceColor = '#ff0066';  // Hot pink (no blue/yellow)
            guideConfig.spaceOpacity = 0.8;
            guideConfig.blockColor = '#00ff99';  // Cyan-green (no blue/yellow)
            guideConfig.blockOpacity = 0.8;
            guideConfig.pythonColonColor = '#ff0099';  // Magenta-pink (no blue/yellow)
            guideConfig.pythonOpacity = 0.8;
            guideConfig.indentGuideColor = '#00ffcc';  // Bright cyan (no blue/yellow)
            guideConfig.indentOpacity = 0.7;
            break;
    }
    
    console.log('New guideConfig:', guideConfig);
    
    // Update UI controls to match
    updateColorPickerValues();
    updateGuideStyles();
    
    // Force a complete refresh of visual guides
    if (guidesEnabled) {
        console.log('Guides are enabled, forcing refresh...');
        // Clear existing decorations first
        clearVisualGuides();
        // Then redraw with new colors
        updateVisualGuides();
    } else {
        console.log('Guides are disabled, will show when enabled');
    }
}

// NEW FUNCTION: Update color picker values in UI
function updateColorPickerValues() {
    const spaceColorPicker = document.getElementById('spaceColor');
    const spaceOpacitySlider = document.getElementById('spaceOpacity');
    const blockColorPicker = document.getElementById('blockColor');
    const blockOpacitySlider = document.getElementById('blockOpacity');
    const pythonColorPicker = document.getElementById('pythonColor');
    const pythonOpacitySlider = document.getElementById('pythonOpacity');
    const indentColorPicker = document.getElementById('indentColor');
    const indentOpacitySlider = document.getElementById('indentOpacity');
    
    if (spaceColorPicker) spaceColorPicker.value = guideConfig.spaceColor;
    if (spaceOpacitySlider) {
        spaceOpacitySlider.value = guideConfig.spaceOpacity;
        spaceOpacitySlider.nextElementSibling.textContent = Math.round(guideConfig.spaceOpacity * 100) + '%';
    }
    
    if (blockColorPicker) blockColorPicker.value = guideConfig.blockColor;
    if (blockOpacitySlider) {
        blockOpacitySlider.value = guideConfig.blockOpacity;
        blockOpacitySlider.nextElementSibling.textContent = Math.round(guideConfig.blockOpacity * 100) + '%';
    }
    
    if (pythonColorPicker) pythonColorPicker.value = guideConfig.pythonColonColor;
    if (pythonOpacitySlider) {
        pythonOpacitySlider.value = guideConfig.pythonOpacity;
        pythonOpacitySlider.nextElementSibling.textContent = Math.round(guideConfig.pythonOpacity * 100) + '%';
    }
    
    if (indentColorPicker) indentColorPicker.value = guideConfig.indentGuideColor;
    if (indentOpacitySlider) {
        indentOpacitySlider.value = guideConfig.indentOpacity;
        indentOpacitySlider.nextElementSibling.textContent = Math.round(guideConfig.indentOpacity * 100) + '%';
    }
}

// NEW FUNCTION: Update guide styles dynamically
function updateGuideStyles() {
    console.log('updateGuideStyles called with config:', guideConfig);
    
    // Remove old style element if it exists
    let styleElement = document.getElementById('dynamic-guide-styles');
    if (styleElement) {
        styleElement.remove();
        console.log('Removed old style element');
    }
    
    // Create new style element - style the classes directly, not pseudo-elements!
    styleElement = document.createElement('style');
    styleElement.id = 'dynamic-guide-styles';
    styleElement.textContent = `
        .monaco-editor .clearcode-space-guide,
        .monaco-editor .clearcode-tab-guide,
        #monaco-editor .clearcode-space-guide,
        #monaco-editor .clearcode-tab-guide {
            color: ${hexToRgba(guideConfig.spaceColor, guideConfig.spaceOpacity)} !important;
        }
        
        .monaco-editor .clearcode-block-start-guide,
        .monaco-editor .clearcode-block-end-guide,
        #monaco-editor .clearcode-block-start-guide,
        #monaco-editor .clearcode-block-end-guide {
            color: ${hexToRgba(guideConfig.blockColor, guideConfig.blockOpacity)} !important;
        }
        
        /* Glyph margin styles for block markers */
        .monaco-editor .clearcode-block-start-glyph,
        #monaco-editor .clearcode-block-start-glyph {
            background: ${guideConfig.blockColor} !important;
            width: 4px !important;
            margin-left: 3px !important;
            opacity: ${guideConfig.blockOpacity} !important;
        }
        
        .monaco-editor .clearcode-block-end-glyph,
        #monaco-editor .clearcode-block-end-glyph {
            background: ${guideConfig.blockColor} !important;
            width: 4px !important;
            margin-left: 3px !important;
            opacity: ${guideConfig.blockOpacity} !important;
        }
        
        .monaco-editor .clearcode-python-colon-guide,
        #monaco-editor .clearcode-python-colon-guide {
            color: ${hexToRgba(guideConfig.pythonColonColor, guideConfig.pythonOpacity)} !important;
        }
        
        .monaco-editor .clearcode-indent-guide,
        #monaco-editor .clearcode-indent-guide {
            color: ${hexToRgba(guideConfig.indentGuideColor, guideConfig.indentOpacity)} !important;
        }
    `;
    
    document.head.appendChild(styleElement);
    console.log('Applied new guide styles (direct class styling)');
}

// Helper function to convert hex to rgba
function hexToRgba(hex, opacity) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(100, 149, 237, ${opacity})`;
    
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// NEW FUNCTION: Setup dyslexia mode
function setupDyslexiaMode() {
    const dyslexiaBtn = document.getElementById('dyslexiaMode');
    const dyslexiaFontCheckbox = document.getElementById('dyslexiaFont');
    const dyslexiaSpacingCheckbox = document.getElementById('increasedSpacing');
    const dyslexiaLineHighlightCheckbox = document.getElementById('lineHighlight');
    const dyslexiaBlockHighlightCheckbox = document.getElementById('blockHighlight');
    
    console.log('Setting up dyslexia mode...');
    console.log('Dyslexia button found:', !!dyslexiaBtn);
    console.log('Font checkbox found:', !!dyslexiaFontCheckbox);
    console.log('Spacing checkbox found:', !!dyslexiaSpacingCheckbox);
    console.log('Line highlight checkbox found:', !!dyslexiaLineHighlightCheckbox);
    console.log('Block highlight checkbox found:', !!dyslexiaBlockHighlightCheckbox);
    
    // Main toggle button
    if (dyslexiaBtn) {
        dyslexiaBtn.addEventListener('click', () => {
            dyslexiaModeEnabled = !dyslexiaModeEnabled;
            dyslexiaBtn.classList.toggle('active', dyslexiaModeEnabled);
            
            if (dyslexiaModeEnabled) {
                // Enable all dyslexia features
                dyslexiaSettings.font = true;
                dyslexiaSettings.spacing = true;
                dyslexiaSettings.lineHighlight = true;
                dyslexiaSettings.blockHighlight = true;
                
                // Update checkboxes
                if (dyslexiaFontCheckbox) dyslexiaFontCheckbox.checked = true;
                if (dyslexiaSpacingCheckbox) dyslexiaSpacingCheckbox.checked = true;
                if (dyslexiaLineHighlightCheckbox) dyslexiaLineHighlightCheckbox.checked = true;
                if (dyslexiaBlockHighlightCheckbox) dyslexiaBlockHighlightCheckbox.checked = true;
                
                showNotification('Dyslexia mode enabled', 'success');
            } else {
                // Disable all dyslexia features
                dyslexiaSettings.font = false;
                dyslexiaSettings.spacing = false;
                dyslexiaSettings.lineHighlight = false;
                dyslexiaSettings.blockHighlight = false;
                
                // Update checkboxes
                if (dyslexiaFontCheckbox) dyslexiaFontCheckbox.checked = false;
                if (dyslexiaSpacingCheckbox) dyslexiaSpacingCheckbox.checked = false;
                if (dyslexiaLineHighlightCheckbox) dyslexiaLineHighlightCheckbox.checked = false;
                if (dyslexiaBlockHighlightCheckbox) dyslexiaBlockHighlightCheckbox.checked = false;
                
                showNotification('Dyslexia mode disabled', 'success');
            }
            
            applyDyslexiaSettings();
        });
    }
    
    // Individual feature checkboxes
    if (dyslexiaFontCheckbox) {
        dyslexiaFontCheckbox.addEventListener('change', (e) => {
            dyslexiaSettings.font = e.target.checked;
            applyDyslexiaSettings();
        });
    }
    
    if (dyslexiaSpacingCheckbox) {
        dyslexiaSpacingCheckbox.addEventListener('change', (e) => {
            dyslexiaSettings.spacing = e.target.checked;
            applyDyslexiaSettings();
        });
    }
    
    if (dyslexiaLineHighlightCheckbox) {
        dyslexiaLineHighlightCheckbox.addEventListener('change', (e) => {
            dyslexiaSettings.lineHighlight = e.target.checked;
            applyDyslexiaSettings();
        });
    }
    
    if (dyslexiaBlockHighlightCheckbox) {
        dyslexiaBlockHighlightCheckbox.addEventListener('change', (e) => {
            dyslexiaSettings.blockHighlight = e.target.checked;
            applyDyslexiaSettings();
        });
    }
}

// NEW FUNCTION: Apply dyslexia settings to editor
function applyDyslexiaSettings() {
    if (!editor) {
        console.warn('Editor not ready for dyslexia settings');
        return;
    }
    
    console.log('Applying dyslexia settings:', dyslexiaSettings);
    
    // Apply font
    if (dyslexiaSettings.font) {
        editor.updateOptions({
            fontFamily: "'OpenDyslexic', monospace"
        });
        console.log('Applied OpenDyslexic font');
    } else {
        const fontFamily = document.getElementById('fontFamily')?.value || "'Consolas', 'Courier New', monospace";
        editor.updateOptions({
            fontFamily: fontFamily
        });
        console.log('Restored default font');
    }
    
    // Apply spacing - Monaco uses lineHeight as a multiplier, not pixels
    if (dyslexiaSettings.spacing) {
        editor.updateOptions({
            letterSpacing: 1.5,
            lineHeight: 28  // Increased from default ~19px
        });
        console.log('Applied increased spacing');
    } else {
        const fontSize = parseInt(document.getElementById('fontSize')?.value) || 14;
        editor.updateOptions({
            letterSpacing: 0,
            lineHeight: 0  // 0 means use default
        });
        console.log('Restored default spacing');
    }
    
    // Apply line highlighting - use 'all' to highlight the entire line
    if (dyslexiaSettings.lineHighlight) {
        editor.updateOptions({
            renderLineHighlight: 'all',
            renderLineHighlightOnlyWhenFocus: false
        });
        console.log('Enabled line highlighting');
    } else {
        editor.updateOptions({
            renderLineHighlight: 'line'
        });
        console.log('Disabled full line highlighting');
    }
    
    // Block highlighting - add visual indicators for code blocks
    if (dyslexiaSettings.blockHighlight) {
        console.log('Enabling block boundaries, guidesEnabled:', guidesEnabled);
        
        // Enable block guides checkbox
        const blockGuidesCheckbox = document.getElementById('blockGuides');
        if (blockGuidesCheckbox) {
            blockGuidesCheckbox.checked = true;
            console.log('Checked block guides checkbox');
        }
        
        // Enable visual guides if not already enabled
        if (!guidesEnabled) {
            console.log('Visual guides were disabled, enabling now...');
            toggleGuides();
        } else {
            console.log('Visual guides already enabled, refreshing...');
            updateVisualGuides();
        }
        console.log('Block boundaries enabled');
    } else {
        console.log('Disabling block boundaries');
        // When disabling, just uncheck the block guides checkbox
        const blockGuidesCheckbox = document.getElementById('blockGuides');
        if (blockGuidesCheckbox) {
            blockGuidesCheckbox.checked = false;
        }
        if (guidesEnabled) {
            updateVisualGuides();
        }
        console.log('Block boundaries disabled');
    }
}

function setupEventListeners() {
    // File operations
    document.getElementById('openFile')?.addEventListener('click', openFile);
    document.getElementById('saveFile')?.addEventListener('click', saveFile);
    document.getElementById('newFile')?.addEventListener('click', createNewFile);
    document.getElementById('newTabBtn')?.addEventListener('click', createNewFile);
    
    // Visual guides toggle
    document.getElementById('toggleGuides')?.addEventListener('click', toggleGuides);
    
    // Settings panel
    document.getElementById('settingsBtn')?.addEventListener('click', toggleSettings);
    document.getElementById('closeSettings')?.addEventListener('click', toggleSettings);
    
    // Editor content change listener
    if (editor) {
        editor.onDidChangeModelContent(() => {
            if (guidesEnabled && !isUpdating) {
                scheduleVisualGuidesUpdate();
            }
            markFileAsDirty();
        });
        
        // Scroll listener for viewport updates
        editor.onDidScrollChange(() => {
            if (guidesEnabled && !isUpdating) {
                scheduleVisualGuidesUpdate();
            }
        });
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+O - Open file
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            openFile();
        }
        // Ctrl+S - Save file
        else if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
        // Ctrl+N - New file
        else if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            createNewFile();
        }
        // Ctrl+G - Toggle guides
        else if (e.ctrlKey && e.key === 'g') {
            e.preventDefault();
            toggleGuides();
        }
        // Ctrl+D - Toggle dyslexia mode
        else if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            document.getElementById('dyslexiaMode')?.click();
        }
        // Ctrl+, - Settings
        else if (e.ctrlKey && e.key === ',') {
            e.preventDefault();
            toggleSettings();
        }
        // F1 - Help
        else if (e.key === 'F1') {
            e.preventDefault();
            showHelp();
        }
        // Ctrl+Tab - Next tab
        else if (e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            switchToNextTab();
        }
    });
}

function toggleGuides() {
    guidesEnabled = !guidesEnabled;
    const btn = document.getElementById('toggleGuides');
    if (btn) btn.classList.toggle('active', guidesEnabled);
    
    if (guidesEnabled) {
        updateVisualGuides();
        showNotification('Visual guides enabled', 'success');
    } else {
        clearVisualGuides();
        showNotification('Visual guides disabled', 'success');
    }
}

function scheduleVisualGuidesUpdate() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }
    
    updateTimeout = setTimeout(() => {
        updateVisualGuides();
    }, PERFORMANCE_CONFIG.UPDATE_DELAY);
}

function updateVisualGuides() {
    if (!editor || !guidesEnabled || isUpdating) return;
    
    try {
        isUpdating = true;
        
        const model = editor.getModel();
        if (!model) return;
        
        const text = model.getValue();
        const lines = text.split('\n');
        
        const language = optimizedLanguageDetection(text, lines.length);
        console.log('Detected language:', language);
        const decorations = [];
        
        const spaceGuidesEnabled = document.getElementById('spaceGuides')?.checked ?? true;
        const blockGuidesEnabled = document.getElementById('blockGuides')?.checked ?? true;
        const indentGuidesEnabled = document.getElementById('indentGuides')?.checked ?? true;
        
        const visibleRange = getVisibleLineRange();
        const startLine = Math.max(0, visibleRange.start - PERFORMANCE_CONFIG.VIEWPORT_BUFFER);
        const endLine = Math.min(lines.length, visibleRange.end + PERFORMANCE_CONFIG.VIEWPORT_BUFFER);
        
        for (let lineIndex = startLine; lineIndex < endLine; lineIndex++) {
            const line = lines[lineIndex];
            const lineNumber = lineIndex + 1;
            
            if (spaceGuidesEnabled) {
                processSpacesAndTabs(line, lineNumber, decorations);
            }
            
            if (blockGuidesEnabled || indentGuidesEnabled) {
                processLanguageSpecificGuides(line, lineNumber, language, blockGuidesEnabled, indentGuidesEnabled, decorations);
            }
        }
        
        visualGuideDecorations = editor.deltaDecorations(visualGuideDecorations, decorations);
        
    } finally {
        isUpdating = false;
    }
}

function optimizedLanguageDetection(text, lineCount) {
    if (lastLanguage && lineCount < PERFORMANCE_CONFIG.MAX_LINES_FOR_FULL_SCAN) {
        return lastLanguage;
    }
    
    const sampleText = lineCount > PERFORMANCE_CONFIG.MAX_LINES_FOR_FULL_SCAN 
        ? text.substring(0, 500) 
        : text;
    
    const language = detectLanguage(sampleText);
    lastLanguage = language;
    return language;
}

function detectLanguage(text) {
    // Python detection
    if (/\bdef\b|\bclass\b|import\s+\w+|from\s+\w+\s+import|\belif\b/.test(text)) {
        return 'python';
    }
    // JavaScript/TypeScript detection
    if (/\bfunction\b|\bconst\b|\blet\b|\bvar\b|=>|\bclass\b/.test(text)) {
        if (/\binterface\b|\btype\b.*=/.test(text)) {
            return 'typescript';
        }
        return 'javascript';
    }
    // Java detection
    if (/\bpublic\s+(class|interface)|private\s+\w+|\bvoid\b/.test(text)) {
        return 'java';
    }
    // C++ detection
    if (/#include|std::|cout|cin|namespace/.test(text)) {
        return 'cpp';
    }
    // HTML detection
    if (/<html|<head|<body|<div|<script/.test(text)) {
        return 'html';
    }
    // CSS detection
    if (/\{[^}]*:[^}]*\}|@media|@import/.test(text)) {
        return 'css';
    }
    // PHP detection
    if (/<\?php|\$\w+\s*=/.test(text)) {
        return 'php';
    }
    
    return 'plaintext';
}

function getVisibleLineRange() {
    if (!editor) return { start: 0, end: 0 };
    
    const visibleRanges = editor.getVisibleRanges();
    if (visibleRanges.length > 0) {
        return {
            start: visibleRanges[0].startLineNumber - 1,
            end: visibleRanges[0].endLineNumber - 1
        };
    }
    
    const model = editor.getModel();
    return {
        start: 0,
        end: model ? model.getLineCount() : 0
    };
}

function processSpacesAndTabs(line, lineNumber, decorations) {
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];
        
        if (char === ' ') {
            decorations.push({
                range: new monaco.Range(lineNumber, charIndex + 1, lineNumber, charIndex + 2),
                options: {
                    before: {
                        content: guideConfig.spaceChar,
                        inlineClassName: 'clearcode-space-guide'
                    }
                }
            });
        } else if (char === '\t') {
            decorations.push({
                range: new monaco.Range(lineNumber, charIndex + 1, lineNumber, charIndex + 2),
                options: {
                    before: {
                        content: guideConfig.tabChar,
                        inlineClassName: 'clearcode-tab-guide'
                    }
                }
            });
        }
    }
}

function processLanguageSpecificGuides(line, lineNumber, language, blockGuidesEnabled, indentGuidesEnabled, decorations) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) return;
    
    // Debug: log language and line info for lines with braces
    if (trimmedLine.includes('{') || trimmedLine.includes('}')) {
        console.log(`Line ${lineNumber}: "${trimmedLine}" | Language: ${language} | blockGuidesEnabled: ${blockGuidesEnabled}`);
    }
    
    switch (language) {
        case 'python':
            if (blockGuidesEnabled && trimmedLine.endsWith(':')) {
                const colonIndex = line.lastIndexOf(':');
                console.log(`Adding Python colon marker at line ${lineNumber}`);
                decorations.push({
                    range: new monaco.Range(lineNumber, colonIndex + 2, lineNumber, colonIndex + 2),
                    options: {
                        after: {
                            content: guideConfig.pythonColonChar,
                            inlineClassName: 'clearcode-python-colon-guide'
                        }
                    }
                });
            }
            
            if (indentGuidesEnabled) {
                const indentLevel = getIndentationLevel(line);
                for (let i = 0; i < indentLevel; i++) {
                    decorations.push({
                        range: new monaco.Range(lineNumber, i * 4 + 1, lineNumber, i * 4 + 1),
                        options: {
                            before: {
                                content: guideConfig.indentGuideChar,
                                inlineClassName: 'clearcode-indent-guide'
                            }
                        }
                    });
                }
            }
            break;
            
        case 'javascript':
        case 'typescript':
            if (blockGuidesEnabled) {
                if (trimmedLine.endsWith('{')) {
                    console.log(`Adding block start glyph at line ${lineNumber}`);
                    decorations.push({
                        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                        options: {
                            isWholeLine: false,
                            glyphMarginClassName: 'clearcode-block-start-glyph',
                            glyphMarginHoverMessage: { value: 'Block start' }
                        }
                    });
                } else if (trimmedLine.startsWith('}')) {
                    console.log(`Adding block end glyph at line ${lineNumber}`);
                    decorations.push({
                        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                        options: {
                            isWholeLine: false,
                            glyphMarginClassName: 'clearcode-block-end-glyph',
                            glyphMarginHoverMessage: { value: 'Block end' }
                        }
                    });
                }
            }
            break;
    }
}

function getIndentationLevel(line) {
    let indentCount = 0;
    for (const char of line) {
        if (char === ' ') {
            indentCount++;
        } else if (char === '\t') {
            indentCount += 4;
        } else {
            break;
        }
    }
    return Math.floor(indentCount / 4);
}

function clearVisualGuides() {
    if (editor && visualGuideDecorations.length > 0) {
        editor.deltaDecorations(visualGuideDecorations, []);
        visualGuideDecorations = [];
    }
}

// Settings panel
function setupSettings() {
    const themeSelect = document.getElementById('editorTheme');
    const fontSizeSlider = document.getElementById('fontSize');
    const fontFamilySelect = document.getElementById('fontFamily');
    const wordWrapCheckbox = document.getElementById('wordWrap');
    const minimapCheckbox = document.getElementById('showMinimap');
    const lineNumbersCheckbox = document.getElementById('showLineNumbers');
    const autoSaveCheckbox = document.getElementById('autoSave');
    
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            monaco.editor.setTheme(e.target.value);
            saveSettings();
        });
    }
    
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            document.getElementById('fontSizeValue').textContent = size + 'px';
            if (editor) {
                editor.updateOptions({ fontSize: size });
            }
            saveSettings();
        });
    }
    
    if (fontFamilySelect) {
        fontFamilySelect.addEventListener('change', (e) => {
            if (editor && !dyslexiaSettings.font) {
                editor.updateOptions({ fontFamily: e.target.value });
            }
            saveSettings();
        });
    }
    
    if (wordWrapCheckbox) {
        wordWrapCheckbox.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' });
            }
            saveSettings();
        });
    }
    
    if (minimapCheckbox) {
        minimapCheckbox.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ minimap: { enabled: e.target.checked } });
            }
            saveSettings();
        });
    }
    
    if (lineNumbersCheckbox) {
        lineNumbersCheckbox.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ lineNumbers: e.target.checked ? 'on' : 'off' });
            }
            saveSettings();
        });
    }
    
    if (autoSaveCheckbox) {
        autoSaveCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                startAutoSave();
            } else {
                stopAutoSave();
            }
            saveSettings();
        });
    }
}

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

function saveSettings() {
    try {
        const settings = {
            theme: document.getElementById('editorTheme')?.value || 'vs-dark',
            fontSize: parseInt(document.getElementById('fontSize')?.value) || 14,
            fontFamily: document.getElementById('fontFamily')?.value || "'Consolas', 'Courier New', monospace",
            wordWrap: document.getElementById('wordWrap')?.checked || false,
            showMinimap: document.getElementById('showMinimap')?.checked || false,
            showLineNumbers: document.getElementById('showLineNumbers')?.checked || true,
            autoSave: document.getElementById('autoSave')?.checked || false,
            guidesEnabled: guidesEnabled,
            spaceGuides: document.getElementById('spaceGuides')?.checked ?? true,
            blockGuides: document.getElementById('blockGuides')?.checked ?? true,
            indentGuides: document.getElementById('indentGuides')?.checked ?? true,
            guideConfig: guideConfig,
            dyslexiaModeEnabled: dyslexiaModeEnabled,
            dyslexiaSettings: dyslexiaSettings
        };
        
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        handleGlobalError(error, ERROR_TYPES.STORAGE, 'Failed to save settings');
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            
            // Apply settings to UI
            if (document.getElementById('editorTheme')) document.getElementById('editorTheme').value = settings.theme || 'vs-dark';
            if (document.getElementById('fontSize')) {
                document.getElementById('fontSize').value = settings.fontSize || 14;
                document.getElementById('fontSizeValue').textContent = (settings.fontSize || 14) + 'px';
            }
            if (document.getElementById('fontFamily')) document.getElementById('fontFamily').value = settings.fontFamily || "'Consolas', 'Courier New', monospace";
            if (document.getElementById('wordWrap')) document.getElementById('wordWrap').checked = settings.wordWrap || false;
            if (document.getElementById('showMinimap')) document.getElementById('showMinimap').checked = settings.showMinimap || false;
            if (document.getElementById('showLineNumbers')) document.getElementById('showLineNumbers').checked = settings.showLineNumbers ?? true;
            if (document.getElementById('autoSave')) document.getElementById('autoSave').checked = settings.autoSave || false;
            
            // Load guide config
            if (settings.guideConfig) {
                Object.assign(guideConfig, settings.guideConfig);
                updateColorPickerValues();
                updateGuideStyles();
            }
            
            // Load dyslexia settings
            if (settings.dyslexiaModeEnabled) {
                dyslexiaModeEnabled = true;
                document.getElementById('dyslexiaMode')?.classList.add('active');
            }
            if (settings.dyslexiaSettings) {
                Object.assign(dyslexiaSettings, settings.dyslexiaSettings);
                applyDyslexiaSettings();
            }
            
            // Apply to editor
            if (editor) {
                editor.updateOptions({
                    theme: settings.theme,
                    fontSize: settings.fontSize,
                    fontFamily: dyslexiaSettings.font ? "'OpenDyslexic', monospace" : settings.fontFamily,
                    wordWrap: settings.wordWrap ? 'on' : 'off',
                    minimap: { enabled: settings.showMinimap },
                    lineNumbers: settings.showLineNumbers ? 'on' : 'off'
                });
            }
            
            // Restore guides state
            guidesEnabled = settings.guidesEnabled || false;
            if (guidesEnabled) {
                document.getElementById('toggleGuides')?.classList.add('active');
                updateVisualGuides();
            }
            
            // Start auto-save if enabled
            if (settings.autoSave) {
                startAutoSave();
            }
        }
    } catch (error) {
        handleGlobalError(error, ERROR_TYPES.STORAGE, 'Failed to load settings');
    }
}

// File management (simplified versions)
function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.js,.py,.html,.css,.json,.md';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (editor) {
                    editor.setValue(event.target.result);
                    showNotification(`Opened ${file.name}`, 'success');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

function saveFile() {
    if (!editor) return;
    
    const content = editor.getValue();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('File saved', 'success');
}

function createNewFile() {
    if (editor) {
        editor.setValue('');
        showNotification('New file created', 'success');
    }
}

function setupFileManagement() {
    // Placeholder for file management system
}

function markFileAsDirty() {
    // Mark current file as having unsaved changes
}

function switchToNextTab() {
    // Placeholder for tab switching
}

function startAutoSave() {
    if (autoSaveInterval) return;
    autoSaveInterval = setInterval(() => {
        saveSession();
        showNotification('Auto-saved', 'info');
    }, 60000); // Every minute
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

function saveSession() {
    try {
        if (!editor) return;
        
        const session = {
            content: editor.getValue(),
            timestamp: Date.now()
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
        console.warn('Failed to save session:', error);
    }
}

function loadSession(data) {
    if (editor && data.content) {
        editor.setValue(data.content);
    }
}

// Help system
function setupHelpSystem() {
    const helpBtn = document.getElementById('helpBtn');
    const closeHelpBtn = document.getElementById('closeHelp');
    const helpModal = document.getElementById('helpModal');
    
    if (helpBtn) helpBtn.onclick = showHelp;
    if (closeHelpBtn) closeHelpBtn.onclick = hideHelp;
    
    if (helpModal) {
        helpModal.addEventListener('click', (e) => {
            if (e.target.id === 'helpModal') {
                hideHelp();
            }
        });
    }
    
    setupHelpNavigation();
}

function showHelp() {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.classList.remove('hidden');
        setupHelpNavigation();
    }
}

function hideHelp() {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.classList.add('hidden');
    }
}

function setupHelpNavigation() {
    const navButtons = document.querySelectorAll('.help-nav-btn');
    const sections = document.querySelectorAll('.help-section');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSection = button.getAttribute('data-section');
            
            navButtons.forEach(btn => btn.classList.remove('active'));
            sections.forEach(section => section.classList.remove('active'));
            
            button.classList.add('active');
            const targetElement = document.getElementById(`help-${targetSection}`);
            if (targetElement) {
                targetElement.classList.add('active');
            }
        });
    });
}

function checkFirstTimeUser() {
    try {
        const hasVisited = localStorage.getItem('clearcode-has-visited');
        if (!hasVisited) {
            localStorage.setItem('clearcode-has-visited', 'true');
            
            setTimeout(() => {
                showNotification('Welcome to ClearCode! Press F1 for help and tutorials.', 'info');
            }, 2000);
        }
    } catch (error) {
        console.warn('Could not check first-time user status:', error);
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

// ============================================
// TEXT-TO-SPEECH FUNCTIONALITY
// ============================================

// TTS state management
let ttsSettings = {
    voice: null,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    speaking: false
};

let ttsUtterance = null;

// Initialize TTS system
function initTextToSpeech() {
    console.log('🔊 Initializing Text-to-Speech...');
    
    // Setup TTS panel
    setupTTSPanel();
    
    // Setup TTS controls
    setupTTSControls();
    
    // Load available voices
    loadVoices();
    
    // Listen for voice changes (some browsers load voices asynchronously)
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    console.log('✅ Text-to-Speech initialized');
}

function setupTTSPanel() {
    const ttsBtn = document.getElementById('ttsBtn');
    const ttsPanel = document.getElementById('ttsPanel');
    const closeTTS = document.getElementById('closeTTS');
    
    if (ttsBtn && ttsPanel) {
        ttsBtn.addEventListener('click', () => {
            ttsPanel.classList.toggle('hidden');
            ttsPanel.classList.toggle('visible');
        });
        
        if (closeTTS) {
            closeTTS.addEventListener('click', () => {
                ttsPanel.classList.add('hidden');
                ttsPanel.classList.remove('visible');
            });
        }
    }
}

function setupTTSControls() {
    // Action buttons
    const readSelection = document.getElementById('readSelection');
    const readLine = document.getElementById('readLine');
    const stopReading = document.getElementById('stopReading');
    
    if (readSelection) {
        readSelection.addEventListener('click', readSelectedText);
    }
    
    if (readLine) {
        readLine.addEventListener('click', readCurrentLine);
    }
    
    if (stopReading) {
        stopReading.addEventListener('click', stopSpeaking);
    }
    
    // Voice selection
    const ttsVoice = document.getElementById('ttsVoice');
    if (ttsVoice) {
        ttsVoice.addEventListener('change', (e) => {
            const voices = window.speechSynthesis.getVoices();
            ttsSettings.voice = voices.find(v => v.name === e.target.value) || null;
            console.log('Voice changed to:', ttsSettings.voice?.name || 'default');
        });
    }
    
    // Rate control
    const ttsRate = document.getElementById('ttsRate');
    const ttsRateValue = document.getElementById('ttsRateValue');
    if (ttsRate && ttsRateValue) {
        ttsRate.addEventListener('input', (e) => {
            ttsSettings.rate = parseFloat(e.target.value);
            ttsRateValue.textContent = ttsSettings.rate.toFixed(1) + 'x';
            console.log('TTS speed changed to:', ttsSettings.rate);
        });
    }
    
    // Pitch control
    const ttsPitch = document.getElementById('ttsPitch');
    const ttsPitchValue = document.getElementById('ttsPitchValue');
    if (ttsPitch && ttsPitchValue) {
        ttsPitch.addEventListener('input', (e) => {
            ttsSettings.pitch = parseFloat(e.target.value);
            ttsPitchValue.textContent = ttsSettings.pitch.toFixed(1) + 'x';
            console.log('TTS pitch changed to:', ttsSettings.pitch);
        });
    }
    
    // Volume control
    const ttsVolume = document.getElementById('ttsVolume');
    const ttsVolumeValue = document.getElementById('ttsVolumeValue');
    if (ttsVolume && ttsVolumeValue) {
        ttsVolume.addEventListener('input', (e) => {
            ttsSettings.volume = parseFloat(e.target.value);
            ttsVolumeValue.textContent = Math.round(ttsSettings.volume * 100) + '%';
            console.log('TTS volume changed to:', ttsSettings.volume);
        });
    }
    
    console.log('Text-to-Speech controls setup complete');
}

function loadVoices() {
    const ttsVoice = document.getElementById('ttsVoice');
    if (!ttsVoice || !window.speechSynthesis) return;
    
    const voices = window.speechSynthesis.getVoices();
    
    // Clear existing options
    ttsVoice.innerHTML = '<option value="">Default Voice</option>';
    
    // Add available voices
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (voice.default) {
            option.textContent += ' - Default';
        }
        ttsVoice.appendChild(option);
    });
    
    console.log(`Loaded ${voices.length} TTS voices`);
}

function readSelectedText() {
    if (!editor) {
        showNotification('No editor available', 'warning');
        return;
    }
    
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    
    if (!selectedText || selectedText.trim() === '') {
        showNotification('No text selected', 'warning');
        return;
    }
    
    speakText(selectedText);
}

function readCurrentLine() {
    if (!editor) {
        showNotification('No editor available', 'warning');
        return;
    }
    
    const position = editor.getPosition();
    const lineContent = editor.getModel().getLineContent(position.lineNumber);
    
    if (!lineContent || lineContent.trim() === '') {
        showNotification('Current line is empty', 'warning');
        return;
    }
    
    speakText(lineContent);
}

function speakText(text) {
    if (!window.speechSynthesis) {
        showNotification('Text-to-Speech not supported in this browser', 'error');
        return;
    }
    
    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    // Create new utterance
    ttsUtterance = new SpeechSynthesisUtterance(text);
    ttsUtterance.rate = ttsSettings.rate;
    ttsUtterance.pitch = ttsSettings.pitch;
    ttsUtterance.volume = ttsSettings.volume;
    
    if (ttsSettings.voice) {
        ttsUtterance.voice = ttsSettings.voice;
    }
    
    // Event handlers
    ttsUtterance.onstart = () => {
        ttsSettings.speaking = true;
        console.log('Started speaking:', text.substring(0, 50) + '...');
    };
    
    ttsUtterance.onend = () => {
        ttsSettings.speaking = false;
        console.log('Finished speaking');
    };
    
    ttsUtterance.onerror = (event) => {
        // 'interrupted' error is expected when user stops speech, so ignore it
        if (event.error === 'interrupted') {
            console.log('Speech interrupted by user');
            ttsSettings.speaking = false;
            return;
        }
        
        // Log and notify for actual errors
        console.error('Speech error:', event);
        showNotification(`Speech error: ${event.error}`, 'error');
        ttsSettings.speaking = false;
    };
    
    // Speak!
    window.speechSynthesis.speak(ttsUtterance);
    showNotification('Reading text...', 'info');
}

function stopSpeaking() {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        ttsSettings.speaking = false;
        showNotification('Speech stopped', 'info');
    }
}

// Add TTS keyboard shortcuts
function setupTTSKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+R: Read selection
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            readSelectedText();
        }
        
        // Ctrl+Shift+L: Read current line
        if (e.ctrlKey && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            readCurrentLine();
        }
        
        // Ctrl+T: Toggle TTS panel
        if (e.ctrlKey && !e.shiftKey && e.key === 't') {
            e.preventDefault();
            const ttsPanel = document.getElementById('ttsPanel');
            if (ttsPanel) {
                ttsPanel.classList.toggle('hidden');
                ttsPanel.classList.toggle('visible');
            }
        }
        
        // Escape: Stop speaking (when TTS is active)
        if (e.key === 'Escape' && ttsSettings.speaking) {
            e.preventDefault();
            stopSpeaking();
        }
    });
}

// ============================================
// FEEDBACK & FEATURE REQUEST SYSTEM
// ============================================

// Feedback configuration
const FEEDBACK_CONFIG = {
    // Replace with your actual email
    recipientEmail: 'your-email@example.com',
    // EmailJS configuration (optional - you'll need to set this up)
    useEmailJS: false, // Set to true if you want to use EmailJS
    emailJSServiceID: 'YOUR_SERVICE_ID',
    emailJSTemplateID: 'YOUR_TEMPLATE_ID',
    emailJSPublicKey: 'YOUR_PUBLIC_KEY'
};

// Initialize feedback system
function initFeedbackSystem() {
    console.log('💬 Initializing Feedback System...');
    
    setupFeedbackModal();
    setupFeedbackForm();
    
    console.log('✅ Feedback System initialized');
}

function setupFeedbackModal() {
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackModal = document.getElementById('feedbackModal');
    const closeFeedback = document.getElementById('closeFeedback');
    const cancelFeedback = document.getElementById('cancelFeedback');
    
    if (feedbackBtn && feedbackModal) {
        feedbackBtn.addEventListener('click', () => {
            feedbackModal.classList.remove('hidden');
            resetFeedbackForm();
        });
        
        if (closeFeedback) {
            closeFeedback.addEventListener('click', () => {
                feedbackModal.classList.add('hidden');
            });
        }
        
        if (cancelFeedback) {
            cancelFeedback.addEventListener('click', () => {
                feedbackModal.classList.add('hidden');
            });
        }
        
        // Close on outside click
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === feedbackModal) {
                feedbackModal.classList.add('hidden');
            }
        });
    }
    
    // Update email link with configured email
    const emailLink = document.getElementById('feedbackEmailLink');
    if (emailLink && FEEDBACK_CONFIG.recipientEmail !== 'your-email@example.com') {
        emailLink.href = `mailto:${FEEDBACK_CONFIG.recipientEmail}`;
        emailLink.textContent = FEEDBACK_CONFIG.recipientEmail;
    }
}

function setupFeedbackForm() {
    const form = document.getElementById('feedbackForm');
    if (!form) return;
    
    form.addEventListener('submit', handleFeedbackSubmit);
}

function resetFeedbackForm() {
    const form = document.getElementById('feedbackForm');
    if (form) {
        form.reset();
        hideFeedbackStatus();
    }
}

async function handleFeedbackSubmit(e) {
    e.preventDefault();
    
    const formData = collectFeedbackData();
    
    // Validate form
    if (!formData.type || !formData.subject || !formData.message) {
        showFeedbackStatus('Please fill in all required fields', 'error');
        return;
    }
    
    showFeedbackStatus('Sending feedback...', 'sending');
    
    try {
        if (FEEDBACK_CONFIG.useEmailJS && FEEDBACK_CONFIG.emailJSServiceID !== 'YOUR_SERVICE_ID') {
            // Use EmailJS if configured
            await sendViaEmailJS(formData);
        } else {
            // Fallback to mailto
            sendViaMailto(formData);
        }
    } catch (error) {
        console.error('Feedback submission error:', error);
        showFeedbackStatus('Failed to send feedback. Please try the email link below.', 'error');
    }
}

function collectFeedbackData() {
    const type = document.getElementById('feedbackType')?.value || '';
    const name = document.getElementById('feedbackName')?.value || 'Anonymous';
    const email = document.getElementById('feedbackEmail')?.value || 'No email provided';
    const subject = document.getElementById('feedbackSubject')?.value || '';
    const message = document.getElementById('feedbackMessage')?.value || '';
    const includeSystemInfo = document.getElementById('includeSystemInfo')?.checked || false;
    
    let systemInfo = '';
    if (includeSystemInfo) {
        systemInfo = getSystemInfo();
    }
    
    return {
        type,
        name,
        email,
        subject,
        message,
        systemInfo,
        timestamp: new Date().toISOString()
    };
}

function getSystemInfo() {
    const info = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toLocaleString()
    };
    
    return `\n\n--- System Information ---\n${Object.entries(info).map(([key, value]) => `${key}: ${value}`).join('\n')}`;
}

async function sendViaEmailJS(formData) {
    // This requires EmailJS library to be loaded
    if (typeof emailjs === 'undefined') {
        throw new Error('EmailJS not loaded');
    }
    
    const templateParams = {
        feedback_type: formData.type,
        from_name: formData.name,
        from_email: formData.email,
        subject: formData.subject,
        message: formData.message + formData.systemInfo,
        timestamp: formData.timestamp
    };
    
    await emailjs.send(
        FEEDBACK_CONFIG.emailJSServiceID,
        FEEDBACK_CONFIG.emailJSTemplateID,
        templateParams,
        FEEDBACK_CONFIG.emailJSPublicKey
    );
    
    showFeedbackStatus('✅ Feedback sent successfully! Thank you for helping improve ClearCode.', 'success');
    
    setTimeout(() => {
        document.getElementById('feedbackModal')?.classList.add('hidden');
        resetFeedbackForm();
    }, 3000);
}

function sendViaMailto(formData) {
    const typeEmoji = {
        'feature': '✨',
        'bug': '🐛',
        'improvement': '🔧',
        'accessibility': '♿',
        'general': '💭'
    };
    
    const emailSubject = `${typeEmoji[formData.type] || '💬'} ClearCode Feedback: ${formData.subject}`;
    
    const emailBody = `
Feedback Type: ${formData.type}
From: ${formData.name}
Email: ${formData.email}
Date: ${new Date(formData.timestamp).toLocaleString()}

Subject: ${formData.subject}

Message:
${formData.message}
${formData.systemInfo}
    `.trim();
    
    const mailtoLink = `mailto:${FEEDBACK_CONFIG.recipientEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    // Open mailto link
    window.location.href = mailtoLink;
    
    // Show success message after a short delay
    setTimeout(() => {
        showFeedbackStatus('✅ Your email client should open shortly. Please send the pre-filled email. Thank you!', 'success');
        
        setTimeout(() => {
            document.getElementById('feedbackModal')?.classList.add('hidden');
            resetFeedbackForm();
        }, 5000);
    }, 500);
}

function showFeedbackStatus(message, type) {
    const status = document.getElementById('feedbackStatus');
    if (!status) return;
    
    status.textContent = message;
    status.className = `feedback-status ${type}`;
    status.classList.remove('hidden');
}

function hideFeedbackStatus() {
    const status = document.getElementById('feedbackStatus');
    if (status) {
        status.classList.add('hidden');
    }
}

// Add feedback keyboard shortcut
function setupFeedbackKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+F: Open feedback modal
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            const feedbackModal = document.getElementById('feedbackModal');
            if (feedbackModal) {
                feedbackModal.classList.remove('hidden');
                resetFeedbackForm();
            }
        }
    });
}