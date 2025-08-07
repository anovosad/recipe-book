// static/js/core.js - Complete Updated Core RecipeBook Application

/**
 * Updated Recipe Book Application Controller
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
        this.initializeTagManagement();
        this.initializeIngredientManagement();
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
    // API REQUEST HANDLING
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

        // Don't set Content-Type for FormData (for file uploads)
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
                    form.submit();
                }
            }
        });

        // Real-time search (if enabled)
        if (input.dataset.realtime === 'true') {
            input.addEventListener('input', this.debounce((e) => {
                this.performSearch(e.target.value, e.target);
            }, this.config.debounceDelay));
        }
    },

    /**
     * Perform search operation via API
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
    // MOBILE MENU (SINGLE IMPLEMENTATION)
    // ============================================

    /**
     * Initialize mobile menu
     */
    initializeMobileMenu() {
        const toggleButton = document.getElementById('mobileMenuToggle');
        const navLinks = document.getElementById('navLinks');
        const navOverlay = document.getElementById('navOverlay');
        
        if (!toggleButton || !navLinks) return;

        // Remove any existing listeners to prevent duplicates
        toggleButton.replaceWith(toggleButton.cloneNode(true));
        const newToggleButton = document.getElementById('mobileMenuToggle');

        newToggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleMobileMenu();
        });

        // Close menu when clicking on overlay
        if (navOverlay) {
            navOverlay.addEventListener('click', () => this.closeMobileMenu());
        }

        // Close menu when clicking on nav links
        navLinks.addEventListener('click', (e) => {
            if (e.target.classList.contains('nav-link') && window.innerWidth <= 768) {
                setTimeout(() => this.closeMobileMenu(), 150);
            }
        });

        // Close menu on resize if screen gets larger
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && navLinks.classList.contains('mobile-open')) {
                this.closeMobileMenu();
            }
        });
    },

    /**
     * Toggle mobile menu
     */
    toggleMobileMenu() {
        const navLinks = document.getElementById('navLinks');
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
        const navLinks = document.getElementById('navLinks');
        const toggleButton = document.getElementById('mobileMenuToggle');
        const navOverlay = document.getElementById('navOverlay');
        
        navLinks.classList.add('mobile-open');
        toggleButton.classList.add('active');
        if (navOverlay) navOverlay.classList.add('active');
        document.body.classList.add('menu-open');
        toggleButton.setAttribute('aria-expanded', 'true');
        
        this.emit('mobile-menu:open');
    },

    /**
     * Close mobile menu
     */
    closeMobileMenu() {
        const navLinks = document.getElementById('navLinks');
        const toggleButton = document.getElementById('mobileMenuToggle');
        const navOverlay = document.getElementById('navOverlay');
        
        navLinks.classList.remove('mobile-open');
        toggleButton.classList.remove('active');
        if (navOverlay) navOverlay.classList.remove('active');
        document.body.classList.remove('menu-open');
        toggleButton.setAttribute('aria-expanded', 'false');
        
        this.emit('mobile-menu:close');
    },

    // ============================================
    // TAG MANAGEMENT
    // ============================================

    /**
     * Initialize tag management functionality
     */
    initializeTagManagement() {
        // Tag form modal handling
        this.setupTagFormModal();
        
        // Tag deletion handlers
        this.setupTagDeletionHandlers();
    },

    /**
     * Setup tag form modal
     */
    setupTagFormModal() {
        const modal = document.getElementById('tag-form-modal');
        const form = document.getElementById('tagFormModal');
        const addBtn = document.getElementById('add-tag-btn');
        const addFirstBtn = document.getElementById('add-first-tag-btn');
        
        if (!modal || !form) return;
        
        // Open modal handlers
        [addBtn, addFirstBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.openTagFormModal();
                });
            }
        });
        
        // Form submission
        form.addEventListener('submit', async (e) => {
            await this.handleTagFormSubmission(e);
        });
        
        // Close handlers
        this.setupModalCloseHandlers(modal, 'tag-form-modal');
    },

    /**
     * Open tag form modal
     */
    openTagFormModal() {
        const modal = document.getElementById('tag-form-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            
            const nameInput = document.getElementById('tag-name');
            if (nameInput) {
                setTimeout(() => nameInput.focus(), 100);
            }
            
            this.emit('tag-modal:open');
        }
    },

    /**
     * Close tag form modal
     */
    closeTagFormModal() {
        const modal = document.getElementById('tag-form-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            
            // Reset form
            const form = document.getElementById('tagFormModal');
            if (form) {
                form.reset();
                const colorInput = document.getElementById('tag-color');
                if (colorInput) {
                    colorInput.value = '#ff6b6b';
                }
            }
            
            this.emit('tag-modal:close');
        }
    },

    /**
     * Handle tag form submission
     */
    async handleTagFormSubmission(e) {
        e.preventDefault();
        
        const form = e.target;
        const nameInput = form.querySelector('#tag-name');
        const colorInput = form.querySelector('#tag-color');
        
        if (!nameInput) return;
        
        const name = nameInput.value.trim();
        const color = colorInput ? colorInput.value || '#ff6b6b' : '#ff6b6b';
        
        // Use centralized validation
        if (!window.validateTagForm || !validateTagForm(form)) {
            this.showNotification('Tag name is required.', 'error');
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const removeLoading = this.addLoadingState(submitBtn, 'Saving...');
        
        try {
            const response = await this.apiRequest('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, color: color })
            });
            
            if (response.success) {
                this.showNotification(response.message, 'success');
                this.closeTagFormModal();
                setTimeout(() => window.location.reload(), 1000);
            } else {
                this.showNotification(response.error || 'Failed to save tag', 'error');
            }
        } catch (error) {
            console.error('Tag save error:', error);
            this.showNotification('Failed to save tag. Please try again.', 'error');
        } finally {
            removeLoading();
        }
    },

    /**
     * Setup tag deletion handlers
     */
    setupTagDeletionHandlers() {
        // This will be called by the global deleteTag function
        this.on('tag:delete', async (data) => {
            await this.handleTagDeletion(data.id, data.name, data.button);
        });
    },

    /**
     * Handle tag deletion
     */
    async handleTagDeletion(id, name, button) {
        if (!confirm(`Are you sure you want to delete "${name}"? This will remove it from all recipes.`)) {
            return false;
        }

        const removeLoading = button ? this.addLoadingState(button, '') : null;
        
        try {
            const response = await this.apiRequest(`/api/tags/${id}`, {
                method: 'DELETE'
            });
            
            if (response.success) {
                this.showNotification(response.message, 'success');
                setTimeout(() => location.reload(), 1000);
                return true;
            } else {
                this.showNotification(response.error || 'Failed to delete tag', 'error');
                return false;
            }
        } catch (error) {
            console.error('Delete tag error:', error);
            this.showNotification('Failed to delete tag. Please try again.', 'error');
            return false;
        } finally {
            if (removeLoading) removeLoading();
        }
    },

    /**
     * Setup modal close handlers for any modal
     */
    setupModalCloseHandlers(modal, modalId) {
        if (!modal) return;
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modalId === 'tag-form-modal') {
                    this.closeTagFormModal();
                } else if (modalId === 'ingredient-form-modal') {
                    this.closeIngredientFormModal();
                } else {
                    this.closeModal(modal);
                }
            }
        });
        
        // Close button handlers
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                if (modalId === 'tag-form-modal') {
                    this.closeTagFormModal();
                } else if (modalId === 'ingredient-form-modal') {
                    this.closeIngredientFormModal();
                } else {
                    this.closeModal(modal);
                }
            });
        });
    },

    // ============================================
    // INGREDIENT MANAGEMENT
    // ============================================

    /**
     * Initialize ingredient management functionality
     */
    initializeIngredientManagement() {
        // Ingredient form modal handling
        this.setupIngredientFormModal();
        
        // Ingredient deletion handlers
        this.setupIngredientDeletionHandlers();
    },

    /**
     * Setup ingredient form modal
     */
    setupIngredientFormModal() {
        const modal = document.getElementById('ingredient-form-modal');
        const form = document.getElementById('ingredientFormModal');
        const addBtn = document.getElementById('add-ingredient-btn');
        const addFirstBtn = document.getElementById('add-first-ingredient-btn');
        
        if (!modal || !form) return;
        
        // Open modal handlers
        [addBtn, addFirstBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.openIngredientFormModal();
                });
            }
        });
        
        // Form submission
        form.addEventListener('submit', async (e) => {
            await this.handleIngredientFormSubmission(e);
        });
        
        // Close handlers
        this.setupModalCloseHandlers(modal, 'ingredient-form-modal');
    },

    /**
     * Open ingredient form modal
     */
    openIngredientFormModal() {
        const modal = document.getElementById('ingredient-form-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            
            const nameInput = document.getElementById('ingredient-name');
            if (nameInput) {
                setTimeout(() => nameInput.focus(), 100);
            }
            
            this.emit('ingredient-modal:open');
        }
    },

    /**
     * Close ingredient form modal
     */
    closeIngredientFormModal() {
        const modal = document.getElementById('ingredient-form-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            
            // Reset form
            const form = document.getElementById('ingredientFormModal');
            if (form) {
                form.reset();
            }
            
            this.emit('ingredient-modal:close');
        }
    },

    /**
     * Handle ingredient form submission
     */
    async handleIngredientFormSubmission(e) {
        e.preventDefault();
        
        const form = e.target;
        const nameInput = form.querySelector('#ingredient-name');
        
        if (!nameInput) return;
        
        const name = nameInput.value.trim();
        
        // Use centralized validation
        if (!window.validateIngredientForm || !validateIngredientForm(form)) {
            this.showNotification('Ingredient name is required.', 'error');
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const removeLoading = this.addLoadingState(submitBtn, 'Saving...');
        
        try {
            const response = await this.apiRequest('/api/ingredients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });
            
            if (response.success) {
                this.showNotification(response.message, 'success');
                this.closeIngredientFormModal();
                setTimeout(() => window.location.reload(), 1000);
            } else {
                this.showNotification(response.error || 'Failed to save ingredient', 'error');
            }
        } catch (error) {
            console.error('Ingredient save error:', error);
            this.showNotification('Failed to save ingredient. Please try again.', 'error');
        } finally {
            removeLoading();
        }
    },

    /**
     * Setup ingredient deletion handlers
     */
    setupIngredientDeletionHandlers() {
        // This will be called by the global deleteIngredient function
        this.on('ingredient:delete', async (data) => {
            await this.handleIngredientDeletion(data.id, data.name, data.button);
        });
    },

    /**
     * Handle ingredient deletion
     */
    async handleIngredientDeletion(id, name, button) {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) {
            return false;
        }

        const removeLoading = button ? this.addLoadingState(button, 'Checking...') : null;
        
        try {
            const response = await this.apiRequest(`/api/ingredients/${id}`, {
                method: 'DELETE'
            });
            
            if (response.success) {
                this.showNotification(response.message, 'success');
                setTimeout(() => location.reload(), 1000);
                return true;
            } else if (response.usedInRecipes) {
                // Show usage error modal (this function exists in app.js)
                if (window.showIngredientUsageError) {
                    showIngredientUsageError(response);
                }
                return false;
            } else {
                this.showNotification(response.error || 'Failed to delete ingredient', 'error');
                return false;
            }
        } catch (error) {
            console.error('Delete ingredient error:', error);
            this.showNotification('Failed to delete ingredient. Please try again.', 'error');
            return false;
        } finally {
            if (removeLoading) removeLoading();
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
     * Generate unique ID
     */
    generateId() {
        return 'rb_' + Math.random().toString(36).substr(2, 9);
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

            // Escape key to close modals
            if (e.key === 'Escape') {
                this.closeTopModal();
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
    // CLEANUP
    // ============================================

    /**
     * Cleanup resources
     */
    cleanup() {
        this.state.loadingStates.forEach((_, buttonId) => {
            this.removeLoadingState(buttonId);
        });
        
        this.closeAllModals();
        this.state.eventListeners.clear();
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
// GLOBAL FUNCTIONS FOR TEMPLATE USAGE
// ============================================

/**
 * Enhanced logout function using JSON API
 */
async function logout() {
    try {
        const response = await RecipeBook.apiRequest('/api/logout', {
            method: 'POST'
        });

        if (response.success) {
            RecipeBook.showNotification(response.message, 'success');
            setTimeout(() => {
                window.location.href = response.redirect || '/recipes';
            }, 1000);
        } else {
            RecipeBook.showNotification(response.error || 'Logout failed', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        RecipeBook.showNotification('Logout failed. Please try again.', 'error');
    }
}

/**
 * Global tag deletion function (called from templates)
 */
async function deleteTag(id, name) {
    const button = document.querySelector(`[onclick*="deleteTag(${id}"], .btn-delete[data-tag-id="${id}"]`);
    
    RecipeBook.emit('tag:delete', {
        id: id,
        name: name,
        button: button
    });
}

/**
 * Global ingredient deletion function (called from templates)
 */
async function deleteIngredient(id, name) {
    const button = document.querySelector(`[onclick*="deleteIngredient(${id}"], .btn-delete[data-ingredient-id="${id}"]`);
    
    RecipeBook.emit('ingredient:delete', {
        id: id,
        name: name,
        button: button
    });
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
    window.logout = logout; // Export logout globally
    window.deleteTag = deleteTag; // Export tag deletion globally
    window.deleteIngredient = deleteIngredient; // Export ingredient deletion globally
}