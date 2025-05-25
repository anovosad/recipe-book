// static/js/core.js - Core Recipe Book Application Controller

/**
 * Main Recipe Book Application Controller
 * Handles core functionality, utilities, and app initialization
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
     * Initialize search functionality
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
                    this.submitForm(form);
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
     * Perform search operation
     */
    async performSearch(query, inputElement) {
        if (!query || query.length < 2) return;

        try {
            const response = await this.apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
            this.emit('search:results', { query, results: response });
        } catch (error) {
            console.error('Search failed:', error);
        }
    },

    /**
     * Setup search suggestions
     */
    setupSearchSuggestions(input, container) {
        input.addEventListener('focus', () => {
            container.style.display = 'block';
        });

        input.addEventListener('blur', () => {
            // Delay hiding to allow clicking on suggestions
            setTimeout(() => {
                container.style.display = 'none';
            }, 200);
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
    // NOTIFICATION SYSTEM
    // ============================================

    /**
     * Show notification toast
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
            <span class="toast-message">${message}</span>
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

    /**
     * Remove all loading states
     */
    removeAllLoadingStates() {
        for (const [buttonId] of this.state.loadingStates) {
            this.removeLoadingState(buttonId);
        }
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
            field.addEventListener('invalid', (e) => {
                e.preventDefault();
                this.showFieldError(field, field.validationMessage);
            });
        });
    },

    /**
     * Validate form
     */
    validateForm(form, rules = null) {
        if (!form) return false;

        let isValid = true;
        const errors = [];

        // Get validation rules
        if (!rules) {
            rules = this.getFormRules(form);
        }

        // Validate each field
        for (const [fieldName, rule] of Object.entries(rules)) {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (!field) continue;

            const fieldValid = this.validateField(field, rule);
            if (!fieldValid) {
                isValid = false;
                errors.push(rule.message || `${rule.label || fieldName} is invalid`);
            }
        }

        // Show summary if invalid
        if (!isValid) {
            this.showValidationErrors(form, errors);
        }

        return isValid;
    },

    /**
     * Validate individual field
     */
    validateField(field, rule = null) {
        if (!field) return true;

        const value = field.value.trim();
        let isValid = true;
        let message = '';

        // Get rule if not provided
        if (!rule) {
            const rules = this.getFormRules(field.form);
            rule = rules[field.name] || {};
        }

        // Required validation
        if (rule.required && !value) {
            isValid = false;
            message = `${rule.label || field.name} is required`;
        }

        // Length validation
        if (isValid && rule.minLength && value.length < rule.minLength) {
            isValid = false;
            message = `${rule.label || field.name} must be at least ${rule.minLength} characters`;
        }

        if (isValid && rule.maxLength && value.length > rule.maxLength) {
            isValid = false;
            message = `${rule.label || field.name} must be no more than ${rule.maxLength} characters`;
        }

        // Pattern validation
        if (isValid && rule.pattern && !rule.pattern.test(value)) {
            isValid = false;
            message = rule.patternMessage || `${rule.label || field.name} format is invalid`;
        }

        // Custom validation
        if (isValid && rule.custom && !rule.custom(value, field)) {
            isValid = false;
            message = rule.customMessage || `${rule.label || field.name} is invalid`;
        }

        // HTML5 validation
        if (isValid && !field.checkValidity()) {
            isValid = false;
            message = field.validationMessage;
        }

        // Show/hide field error
        if (isValid) {
            this.clearFieldError(field);
        } else {
            this.showFieldError(field, message);
        }

        return isValid;
    },

    /**
     * Get form validation rules
     */
    getFormRules(form) {
        const rulesData = form.dataset.rules;
        if (rulesData) {
            try {
                return JSON.parse(rulesData);
            } catch (e) {
                console.warn('Invalid form rules JSON:', rulesData);
            }
        }
        return {};
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

    /**
     * Show validation errors summary
     */
    showValidationErrors(form, errors) {
        if (errors.length === 0) return;

        const message = errors.length === 1 ? errors[0] : `Please fix the following errors:\n• ${errors.join('\n• ')}`;
        this.showNotification(message, 'error', { duration: 6000 });
    },

    // ============================================
    // API UTILITIES
    // ============================================

    /**
     * Make API request
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

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    },

    /**
     * Submit form via AJAX
     */
    async submitForm(form, options = {}) {
        const formData = new FormData(form);
        const method = form.method || 'POST';
        const url = form.action || window.location.href;

        try {
            const response = await this.apiRequest(url, {
                method,
                body: formData,
                headers: {} // Remove content-type to let browser set it for FormData
            });

            this.emit('form:submit:success', { form, response });
            return response;
        } catch (error) {
            this.emit('form:submit:error', { form, error });
            throw error;
        }
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
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
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

    /**
     * Scroll to element
     */
    scrollTo(element, options = {}) {
        const defaultOptions = {
            behavior: 'smooth',
            block: 'start'
        };
        
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        
        if (element) {
            element.scrollIntoView({ ...defaultOptions, ...options });
        }
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
                    this.scrollTo(target);
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
            this.handleGlobalKeydown(e);
        });
    },

    /**
     * Handle global keydown events
     */
    handleGlobalKeydown(e) {
        // Enter key on buttons
        if (e.key === 'Enter' && e.target.tagName === 'BUTTON' && !e.target.disabled) {
            e.target.click();
        }

        // Arrow key navigation for lists
        if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
            this.handleArrowNavigation(e);
        }

        // Tab trapping in modals
        if (e.key === 'Tab' && this.state.activeModals.size > 0) {
            this.handleModalTabTrapping(e);
        }
    },

    /**
     * Handle arrow key navigation
     */
    handleArrowNavigation(e) {
        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = Array.from(document.querySelectorAll(focusableSelectors));
        const currentIndex = focusableElements.indexOf(document.activeElement);
        
        if (currentIndex === -1) return;

        let nextIndex;
        if (e.key === 'ArrowUp') {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
        } else {
            nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
        }

        focusableElements[nextIndex].focus();
        e.preventDefault();
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
    // THEME & PREFERENCES
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

    /**
     * Toggle theme
     */
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
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
                    
                    registration.addEventListener('updatefound', () => {
                        this.handleServiceWorkerUpdate(registration);
                    });
                } catch (error) {
                    console.warn('❌ ServiceWorker registration failed:', error);
                }
            });
        }
    },

    /**
     * Handle service worker updates
     */
    handleServiceWorkerUpdate(registration) {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.showNotification(
                    'New version available! Click to refresh.',
                    'info',
                    {
                        dismissible: true,
                        duration: 10000,
                        onClick: () => window.location.reload()
                    }
                );
            }
        });
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
        
        // Don't show notification for every error to avoid spam
        if (!this.state.lastErrorTime || Date.now() - this.state.lastErrorTime > 5000) {
            this.showNotification('Something went wrong. Please refresh the page if problems persist.', 'error');
            this.state.lastErrorTime = Date.now();
        }
    },

    /**
     * Handle unhandled promise rejections
     */
    handleUnhandledRejection(event) {
        console.error('Unhandled promise rejection:', event.reason);
        this.emit('error', event.reason);
        event.preventDefault(); // Prevent console error
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

    /**
     * Emit event once
     */
    once(eventName, callback) {
        const unsubscribe = this.on(eventName, (data) => {
            callback(data);
            unsubscribe();
        });
        return unsubscribe;
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

    /**
     * Clear all app storage
     */
    clearStorage() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('recipe-book-')) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
            return false;
        }
    },

    // ============================================
    // PERFORMANCE UTILITIES
    // ============================================

    /**
     * Measure performance
     */
    measure(name, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        console.log(`⏱️ ${name}: ${(end - start).toFixed(2)}ms`);
        return result;
    },

    /**
     * Lazy load images
     */
    lazyLoadImages() {
        const images = document.querySelectorAll('img[data-src]');
        
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.classList.remove('lazy');
                        imageObserver.unobserve(img);
                    }
                });
            });

            images.forEach(img => imageObserver.observe(img));
        } else {
            // Fallback for older browsers
            images.forEach(img => {
                img.src = img.dataset.src;
                img.classList.remove('lazy');
            });
        }
    },

    /**
     * Preload critical resources
     */
    preloadResources(urls) {
        urls.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = url;
            
            if (url.endsWith('.css')) {
                link.as = 'style';
            } else if (url.endsWith('.js')) {
                link.as = 'script';
            } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                link.as = 'image';
            }
            
            document.head.appendChild(link);
        });
    },

    // ============================================
    // IMAGE UTILITIES
    // ============================================

    /**
     * Validate image file
     */
    validateImageFile(file) {
        if (!file) return { valid: false, error: 'No file provided' };
        
        if (!this.config.allowedImageTypes.includes(file.type)) {
            return { 
                valid: false, 
                error: 'Invalid file type. Allowed: JPG, PNG, GIF, WebP' 
            };
        }
        
        if (file.size > this.config.maxFileSize) {
            return { 
                valid: false, 
                error: `File too large. Maximum size: ${this.formatFileSize(this.config.maxFileSize)}` 
            };
        }
        
        return { valid: true };
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Create image preview
     */
    createImagePreview(file, callback) {
        const validation = this.validateImageFile(file);
        if (!validation.valid) {
            callback(null, validation.error);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => callback(e.target.result, null);
        reader.onerror = () => callback(null, 'Failed to read file');
        reader.readAsDataURL(file);
    },

    /**
     * Compress image
     */
    compressImage(file, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob(resolve, file.type, quality);
            };

            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    },

    // ============================================
    // ACCESSIBILITY UTILITIES
    // ============================================

    /**
     * Announce to screen readers
     */
    announce(message, priority = 'polite') {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', priority);
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    },

    /**
     * Focus management
     */
    manageFocus(element) {
        if (!element) return;
        
        element.focus();
        
        // Ensure focus is visible for keyboard users
        element.style.outline = 'auto';
        
        // Remove outline on mouse click
        const removeOutline = () => {
            element.style.outline = '';
            element.removeEventListener('mousedown', removeOutline);
        };
        element.addEventListener('mousedown', removeOutline);
    },

    // ============================================
    // CLEANUP & DESTRUCTION
    // ============================================

    /**
     * Cleanup resources
     */
    cleanup() {
        // Remove all loading states
        this.removeAllLoadingStates();
        
        // Close all modals
        this.closeAllModals();
        
        // Clear event listeners
        this.state.eventListeners.clear();
        
        // Reset state
        this.state.isInitialized = false;
        
        console.log('🧹 Recipe Book cleaned up');
    },

    /**
     * Destroy instance
     */
    destroy() {
        this.cleanup();
        
        // Remove global event listeners
        // Note: In a real application, you'd store references to bound functions
        // to properly remove event listeners
        
        console.log('💥 Recipe Book destroyed');
    },

    // ============================================
    // DEBUG UTILITIES (Development only)
    // ============================================

    /**
     * Get debug information
     */
    getDebugInfo() {
        return {
            version: '1.0.0',
            initialized: this.state.isInitialized,
            activeModals: this.state.activeModals.size,
            loadingStates: this.state.loadingStates.size,
            eventListeners: Object.fromEntries(
                Array.from(this.state.eventListeners.entries()).map(([key, value]) => [key, value.length])
            ),
            config: this.config
        };
    },

    /**
     * Log debug information
     */
    debug() {
        console.table(this.getDebugInfo());
    }
};

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