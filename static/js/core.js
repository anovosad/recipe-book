// static/js/core.js - Updated for JSON APIs

/**
 * Updated Recipe Book Application Controller for JSON APIs
 */
const RecipeBook = {
    // Application Configuration
    config: {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedImageTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        toastDuration: 4000,
        alertAutohide: 5000,
        apiTimeout: 10000,
        debounceDelay: 300,
        animationDuration: 300
    },

    // Application state
    state: {
        isInitialized: false,
        currentUser: null,
        activeModals: new Set(),
        loadingStates: new Map(),
        eventListeners: new Map()
    },

    /**
     * Initialize the Recipe Book application
     */
    init() {
        if (this.state.isInitialized) {
            console.warn('RecipeBook already initialized');
            return;
        }

        console.log('🍳 Initializing Recipe Book Application...');
        
        this.bindGlobalEvents();
        this.initializeAlerts();
        this.initializeModals();
        this.initializeSmoothScroll();
        this.initializeKeyboardNavigation();
        this.initializeServiceWorker();
        this.initializeSearch();
        this.initializeMobileMenu();
        this.initializeTheme();
        this.setupErrorHandling();

        this.state.isInitialized = true;
        console.log('✅ Recipe Book Application initialized');

        // Emit custom event for other modules
        this.emit('app:initialized');
    },

    /**
     * Bind global event listeners
     */
    bindGlobalEvents() {
        // DOM Content Loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
        } else {
            this.onDOMReady();
        }

        // Window events
        window.addEventListener('resize', this.debounce(() => this.onWindowResize(), this.config.debounceDelay));
        window.addEventListener('beforeunload', () => this.onBeforeUnload());
        window.addEventListener('online', () => this.onConnectionChange(true));
        window.addEventListener('offline', () => this.onConnectionChange(false));

        // Global error handling
        window.addEventListener('error', (event) => this.handleGlobalError(event));
        window.addEventListener('unhandledrejection', (event) => this.handleUnhandledRejection(event));
    },

    /**
     * Handle DOM ready event
     */
    onDOMReady() {
        this.initializeAlerts();
        this.initializeSearch();
        this.initializeMobileMenu();
        this.setupClickOutside();
        this.setupFormValidation();
        this.emit('dom:ready');
    },

    /**
     * Handle window resize
     */
    onWindowResize() {
        this.emit('window:resize', { 
            width: window.innerWidth, 
            height: window.innerHeight 
        });
    },

    /**
     * Handle before unload
     */
    onBeforeUnload() {
        // Clean up any ongoing operations
        this.state.loadingStates.clear();
        this.cleanup();
    },

    /**
     * Handle connection change
     */
    onConnectionChange(isOnline) {
        const message = isOnline ? 'Connection restored' : 'Connection lost';
        const type = isOnline ? 'success' : 'error';
        this.showNotification(message, type);
        this.emit('connection:change', { isOnline });
    },

    // ============================================
    // ENHANCED API REQUEST HANDLING
    // ============================================

    /**
     * Make API request with enhanced error handling
     */
    async apiRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: this.config.apiTimeout
        };

        const config = { ...defaultOptions, ...options };

        // Don't set Content-Type for FormData
        if (config.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                // Handle API error responses
                const errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`;
                throw new APIError(errorMessage, response.status, data);
            }

            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            throw error;
        }
    },

    /**
     * Submit form via JSON API
     */
    async submitForm(form, options = {}) {
        const formData = new FormData(form);
        const method = options.method || form.method || 'POST';
        const url = options.url || form.action || window.location.href;

        try {
            const response = await this.apiRequest(url, {
                method,
                body: formData
            });

            this.emit('form:submit:success', { form, response });
            return response;
        } catch (error) {
            this.emit('form:submit:error', { form, error });
            throw error;
        }
    },

    // ============================================
    // ENHANCED NOTIFICATION SYSTEM
    // ============================================

    /**
     * Show notification toast with JSON API integration
     */
    showNotification(message, type = 'info', options = {}) {
        const notification = this.createNotification(message, type, options);
        document.body.appendChild(notification);
        
        // Trigger animation
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });
        
        // Auto remove
        const duration = options.duration || this.config.toastDuration;
        setTimeout(() => {
            this.hideNotification(notification);
        }, duration);

        this.emit('notification:show', { message, type, options });
        return notification;
    },

    /**
     * Create notification element
     */
    createNotification(message, type, options) {
        const notification = document.createElement('div');
        notification.className = `toast toast-${type}`;
        
        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span class="toast-message">${this.escapeHtml(message)}</span>
            ${options.dismissible !== false ? '<button class="toast-close"><i class="fas fa-times"></i></button>' : ''}
        `;
        
        // Add close functionality
        if (options.dismissible !== false) {
            const closeBtn = notification.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => this.hideNotification(notification));
        }

        // Add click handler if provided
        if (options.onClick) {
            notification.style.cursor = 'pointer';
            notification.addEventListener('click', options.onClick);
        }

        return notification;
    },

    /**
     * Get icon for notification type
     */
    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-circle'
        };
        return icons[type] || icons.info;
    },

    /**
     * Hide notification
     */
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, this.config.animationDuration);
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    // ============================================
    // ALERT SYSTEM
    // ============================================

    /**
     * Initialize alert system
     */
    initializeAlerts() {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => {
            this.setupAlertDismiss(alert);
            setTimeout(() => {
                if (alert.parentNode) {
                    this.hideElement(alert);
                }
            }, this.config.alertAutohide);
        });
    },

    /**
     * Setup alert dismiss functionality
     */
    setupAlertDismiss(alert) {
        const dismissBtn = alert.querySelector('.alert-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => this.hideElement(alert));
        }

        // Allow clicking anywhere on alert to dismiss after 2 seconds
        setTimeout(() => {
            alert.style.cursor = 'pointer';
            alert.addEventListener('click', () => this.hideElement(alert));
        }, 2000);
    },

    // ============================================
    // SEARCH FUNCTIONALITY
    // ============================================

    /**
     * Initialize search functionality with JSON API
     */
    initializeSearch() {
        const searchInputs = document.querySelectorAll('.search-input');
        searchInputs.forEach(input => {
            this.setupSearchInput(input);
        });
    },

    /**
     * Setup individual search input
     */
    setupSearchInput(input) {
        // Enter key handling
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const form = e.target.closest('form');
                if (form) {
                    form.submit(); // Use regular form submission for search
                }
            }
        });

        // Real-time search (if enabled)
        if (input.dataset.realtime === 'true') {
            input.addEventListener('input', this.debounce((e) => {
                this.performSearch(e.target.value, e.target);
            }, this.config.debounceDelay));
        }

        // Search suggestions (if container exists)
        const suggestionsContainer = input.parentNode.querySelector('.search-suggestions');
        if (suggestionsContainer) {
            this.setupSearchSuggestions(input, suggestionsContainer);
        }
    },

    /**
     * Perform search operation via JSON API
     */
    async performSearch(query, inputElement) {
        if (!query || query.length < 2) return;

        try {
            const response = await this.apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
            
            if (response.success) {
                this.emit('search:results', { query, results: response.results });
                return response.results;
            } else {
                console.error('Search failed:', response.error);
                return [];
            }
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    },

    // ============================================
    // LOADING STATES
    // ============================================

    /**
     * Add loading state to button
     */
    addLoadingState(button, text = 'Loading...') {
        if (!button) return () => {};

        const originalState = {
            text: button.innerHTML,
            disabled: button.disabled
        };

        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
        
        const buttonId = this.generateId();
        this.state.loadingStates.set(buttonId, { button, originalState });
        
        return () => this.removeLoadingState(buttonId);
    },

    /**
     * Remove loading state
     */
    removeLoadingState(buttonId) {
        const state = this.state.loadingStates.get(buttonId);
        if (!state) return;

        const { button, originalState } = state;
        button.disabled = originalState.disabled;
        button.innerHTML = originalState.text;
        
        this.state.loadingStates.delete(buttonId);
    },

    // ============================================
    // MODAL SYSTEM
    // ============================================

    /**
     * Initialize modal system
     */
    initializeModals() {
        // Close modals when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target);
            }
        });

        // Close modals with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopModal();
            }
        });

        // Setup modal close buttons
        document.querySelectorAll('.modal-close').forEach(button => {
            button.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) this.closeModal(modal);
            });
        });
    },

    /**
     * Open modal
     */
    openModal(modalId, options = {}) {
        const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
        
        if (!modal) {
            console.error('Modal not found:', modalId);
            return false;
        }

        // Close other modals if not stacking
        if (!options.stack) {
            this.closeAllModals();
        }

        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        this.state.activeModals.add(modal);
        
        // Focus management
        const firstFocusable = modal.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 100);
        }

        // Prevent body scroll
        if (this.state.activeModals.size === 1) {
            document.body.style.overflow = 'hidden';
        }

        this.emit('modal:open', { modal, options });
        return true;
    },

    /**
     * Close modal
     */
    closeModal(modal, options = {}) {
        if (typeof modal === 'string') {
            modal = document.getElementById(modal);
        }
        
        if (!modal || !this.state.activeModals.has(modal)) {
            return false;
        }

        modal.style.opacity = '0';
        
        setTimeout(() => {
            modal.style.display = 'none';
            modal.style.opacity = '1';
            modal.classList.remove('modal-open');
            this.state.activeModals.delete(modal);
            
            // Restore body scroll if no modals open
            if (this.state.activeModals.size === 0) {
                document.body.style.overflow = '';
            }
            
            this.emit('modal:close', { modal, options });
        }, this.config.animationDuration);

        return true;
    },

    /**
     * Close top modal
     */
    closeTopModal() {
        if (this.state.activeModals.size > 0) {
            const modals = Array.from(this.state.activeModals);
            const topModal = modals[modals.length - 1];
            this.closeModal(topModal);
        }
    },

    /**
     * Close all modals
     */
    closeAllModals() {
        Array.from(this.state.activeModals).forEach(modal => {
            this.closeModal(modal);
        });
    },

    // ============================================
    // MOBILE MENU
    // ============================================

    /**
     * Initialize mobile menu
     */
    initializeMobileMenu() {
        const toggleButton = document.querySelector('.mobile-menu-toggle');
        const navLinks = document.querySelector('.nav-links');
        
        if (!toggleButton || !navLinks) return;

        toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleMobileMenu();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar') && navLinks.classList.contains('mobile-open')) {
                this.closeMobileMenu();
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navLinks.classList.contains('mobile-open')) {
                this.closeMobileMenu();
            }
        });
    },

    /**
     * Toggle mobile menu
     */
    toggleMobileMenu() {
        const navLinks = document.querySelector('.nav-links');
        const isOpen = navLinks.classList.contains('mobile-open');
        
        if (isOpen) {
            this.closeMobileMenu();
        } else {
            this.openMobileMenu();
        }
    },

    /**
     * Open mobile menu
     */
    openMobileMenu() {
        const navLinks = document.querySelector('.nav-links');
        const toggleButton = document.querySelector('.mobile-menu-toggle');
        
        navLinks.classList.add('mobile-open');
        toggleButton?.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        this.emit('mobile-menu:open');
    },

    /**
     * Close mobile menu
     */
    closeMobileMenu() {
        const navLinks = document.querySelector('.nav-links');
        const toggleButton = document.querySelector('.mobile-menu-toggle');
        
        navLinks.classList.remove('mobile-open');
        toggleButton?.classList.remove('active');
        document.body.style.overflow = '';
        
        this.emit('mobile-menu:close');
    },

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Hide element with animation
     */
    hideElement(element, callback = null) {
        if (!element) return;

        element.style.opacity = '0';
        element.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            if (callback) callback();
        }, this.config.animationDuration);
    },

    /**
     * Show element with animation
     */
    showElement(element, callback = null) {
        if (!element) return;

        element.style.opacity = '0';
        element.style.transform = 'translateY(-20px)';
        element.style.display = 'block';
        
        requestAnimationFrame(() => {
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
            if (callback) callback();
        });
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return 'rb_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Format date
     */
    formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        
        return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
    },

    /**
     * Format time duration
     */
    formatTime(minutes) {
        if (!minutes || minutes === 0) return 'Not specified';
        
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (remainingMinutes === 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        
        return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    },

    // ============================================
    // THEME SYSTEM
    // ============================================

    /**
     * Initialize theme system
     */
    initializeTheme() {
        const savedTheme = localStorage.getItem('recipe-book-theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
        }

        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('recipe-book-theme')) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    },

    /**
     * Set application theme
     */
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('recipe-book-theme', theme);
        this.emit('theme:change', { theme });
    },

    // ============================================
    // SMOOTH SCROLL & NAVIGATION
    // ============================================

    /**
     * Initialize smooth scroll
     */
    initializeSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(link.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    },

    /**
     * Setup click outside handling
     */
    setupClickOutside() {
        document.addEventListener('click', (e) => {
            // Handle dropdowns
            document.querySelectorAll('.dropdown.open').forEach(dropdown => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('open');
                }
            });
        });
    },

    // ============================================
    // KEYBOARD NAVIGATION
    // ============================================

    /**
     * Initialize keyboard navigation
     */
    initializeKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            // Enter key on buttons
            if (e.key === 'Enter' && e.target.tagName === 'BUTTON' && !e.target.disabled) {
                e.target.click();
            }

            // Tab trapping in modals
            if (e.key === 'Tab' && this.state.activeModals.size > 0) {
                this.handleModalTabTrapping(e);
            }
        });
    },

    /**
     * Handle tab trapping in modals
     */
    handleModalTabTrapping(e) {
        const activeModal = Array.from(this.state.activeModals).pop();
        if (!activeModal) return;

        const focusableElements = activeModal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
        }
    },

    // ============================================
    // SERVICE WORKER
    // ============================================

    /**
     * Initialize service worker
     */
    initializeServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    const registration = await navigator.serviceWorker.register('/static/sw.js');
                    console.log('✅ ServiceWorker registered:', registration.scope);
                } catch (error) {
                    console.warn('❌ ServiceWorker registration failed:', error);
                }
            });
        }
    },

    // ============================================
    // ERROR HANDLING
    // ============================================

    /**
     * Setup global error handling
     */
    setupErrorHandling() {
        this.on('error', (error) => {
            console.error('Application error:', error);
            this.showNotification('An error occurred. Please try again.', 'error');
        });
    },

    /**
     * Handle global JavaScript errors
     */
    handleGlobalError(event) {
        console.error('Global error:', event.error);
        this.emit('error', event.error);
    },

    /**
     * Handle unhandled promise rejections
     */
    handleUnhandledRejection(event) {
        console.error('Unhandled promise rejection:', event.reason);
        this.emit('error', event.reason);
        event.preventDefault();
    },

    // ============================================
    // FORM VALIDATION
    // ============================================

    /**
     * Setup form validation
     */
    setupFormValidation() {
        document.querySelectorAll('form[data-validate]').forEach(form => {
            this.setupForm(form);
        });
    },

    /**
     * Setup individual form
     */
    setupForm(form) {
        form.addEventListener('submit', (e) => {
            if (!this.validateForm(form)) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Real-time validation
        form.querySelectorAll('input, textarea, select').forEach(field => {
            field.addEventListener('blur', () => this.validateField(field));
        });
    },

    /**
     * Validate form
     */
    validateForm(form) {
        // Basic validation - can be extended
        const requiredFields = form.querySelectorAll('[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                this.showFieldError(field, `${field.labels?.[0]?.textContent || 'This field'} is required`);
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        return isValid;
    },

    /**
     * Validate individual field
     */
    validateField(field) {
        if (field.required && !field.value.trim()) {
            this.showFieldError(field, `${field.labels?.[0]?.textContent || 'This field'} is required`);
            return false;
        } else {
            this.clearFieldError(field);
            return true;
        }
    },

    /**
     * Show field error
     */
    showFieldError(field, message) {
        field.classList.add('field-error');
        
        let errorElement = field.parentNode.querySelector('.field-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'field-error-message';
            field.parentNode.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    },

    /**
     * Clear field error
     */
    clearFieldError(field) {
        field.classList.remove('field-error');
        
        const errorElement = field.parentNode.querySelector('.field-error-message');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    },

    // ============================================
    // EVENT SYSTEM
    // ============================================

    /**
     * Subscribe to event
     */
    on(eventName, callback) {
        if (!this.state.eventListeners.has(eventName)) {
            this.state.eventListeners.set(eventName, []);
        }
        this.state.eventListeners.get(eventName).push(callback);
        
        return () => this.off(eventName, callback);
    },

    /**
     * Unsubscribe from event
     */
    off(eventName, callback) {
        const listeners = this.state.eventListeners.get(eventName);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    },

    /**
     * Emit event
     */
    emit(eventName, data = {}) {
        const listeners = this.state.eventListeners.get(eventName);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
        }
    },

    // ============================================
    // STORAGE UTILITIES
    // ============================================

    /**
     * Set local storage item safely
     */
    setStorage(key, value) {
        try {
            localStorage.setItem(`recipe-book-${key}`, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
            return false;
        }
    },

    /**
     * Get local storage item safely
     */
    getStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(`recipe-book-${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('Failed to read from localStorage:', error);
            return defaultValue;
        }
    },

    /**
     * Remove local storage item
     */
    removeStorage(key) {
        try {
            localStorage.removeItem(`recipe-book-${key}`);
            return true;
        } catch (error) {
            console.warn('Failed to remove from localStorage:', error);         
            return false;
        }
    },

    // ============================================
    // CLEANUP
    // ============================================

    /**
     * Cleanup resources
     */
    cleanup() {
        // Remove all loading states
        this.state.loadingStates.forEach((_, buttonId) => {
            this.removeLoadingState(buttonId);
        });
        
        // Close all modals
        this.closeAllModals();
        
        // Clear event listeners
        this.state.eventListeners.clear();
        
        // Reset state
        this.state.isInitialized = false;
        
        console.log('🧹 Recipe Book cleaned up');
    }
};

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

// Initialize when DOM is ready or immediately if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RecipeBook.init());
} else {
    RecipeBook.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecipeBook;
} else if (typeof window !== 'undefined') {
    window.RecipeBook = RecipeBook;
}