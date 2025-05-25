// static/js/ui-manager.js - UI Management Module

/**
 * UI Management Module
 * Handles view switching, layout management, animations,
 * and other user interface interactions
 */
const UIManager = {
    // Module configuration
    config: {
        viewToggleSelector: '.view-toggle',
        cardViewButtonSelector: '#card-view-btn',
        compactViewButtonSelector: '#compact-view-btn',
        cardViewSelector: '#card-view',
        compactViewSelector: '#compact-view',
        filterSectionSelector: '.filter-section',
        searchInputSelector: '.search-input',
        themeToggleSelector: '.theme-toggle',
        sidebarSelector: '.sidebar',
        mainContentSelector: '.main-content',
        loadingOverlaySelector: '.loading-overlay',
        backToTopSelector: '.back-to-top',
        animationDuration: 300,
        scrollThreshold: 100,
        debounceDelay: 150
    },

    // Module state
    state: {
        currentView: 'card',
        isFilterVisible: true,
        currentTheme: 'light',
        isSidebarOpen: false,
        scrollPosition: 0,
        activeAnimations: new Set(),
        intersectionObservers: new Map(),
        resizeObserver: null,
        isLoading: false,
        viewportSize: { width: 0, height: 0 }
    },

    /**
     * Initialize UI Manager
     */
    init() {
        console.log('🎨 Initializing UI Manager...');
        
        this.detectInitialState();
        this.bindEvents();
        this.initializeViewToggle();
        this.initializeThemeSystem();
        this.initializeScrollFeatures();
        this.initializeResponsiveFeatures();
        this.initializeAnimationSystem();
        this.initializeAccessibilityFeatures();
        
        console.log('✅ UI Manager initialized');
    },

    /**
     * Detect initial UI state
     */
    detectInitialState() {
        // Detect current view preference
        this.state.currentView = this.getSavedViewPreference();
        
        // Detect current theme
        this.state.currentTheme = this.getCurrentTheme();
        
        // Detect viewport size
        this.updateViewportSize();
        
        // Detect scroll position
        this.state.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        console.log(`🔍 Initial state: ${this.state.currentView} view, ${this.state.currentTheme} theme`);
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Listen for core app events
        RecipeBook.on('dom:ready', () => this.onDOMReady());
        RecipeBook.on('window:resize', (data) => this.onWindowResize(data));
        RecipeBook.on('theme:change', (data) => this.onThemeChange(data));
        
        // Listen for app-specific events
        RecipeBook.on('recipe:filter:complete', (data) => this.onFilterComplete(data));
        RecipeBook.on('form:dirty', (data) => this.onFormStateChange(data));
        RecipeBook.on('form:clean', (data) => this.onFormStateChange(data));
        
        // Scroll events
        window.addEventListener('scroll', this.debounce(() => this.onScroll(), this.config.debounceDelay));
        
        // Visibility change
        document.addEventListener('visibilitychange', () => this.onVisibilityChange());
        
        // Focus events for accessibility
        document.addEventListener('focusin', (e) => this.onFocusIn(e));
        document.addEventListener('focusout', (e) => this.onFocusOut(e));
    },

    /**
     * Handle DOM ready event
     */
    onDOMReady() {
        this.initializeViewToggle();
        this.initializeScrollFeatures();
        this.setupIntersectionObservers();
        this.applyInitialViewState();
    },

    // ============================================
    // VIEW MANAGEMENT
    // ============================================

    /**
     * Initialize view toggle functionality
     */
    initializeViewToggle() {
        const cardViewBtn = document.querySelector(this.config.cardViewButtonSelector);
        const compactViewBtn = document.querySelector(this.config.compactViewButtonSelector);
        
        if (!cardViewBtn || !compactViewBtn) return;
        
        // Bind click events
        cardViewBtn.addEventListener('click', () => this.switchToCardView());
        compactViewBtn.addEventListener('click', () => this.switchToCompactView());
        
        // Keyboard support
        [cardViewBtn, compactViewBtn].forEach(btn => {
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    btn.click();
                }
            });
        });
        
        // Apply saved preference
        this.applyViewPreference();
        
        console.log('🔀 View toggle initialized');
    },

    /**
     * Switch to card view
     */
    switchToCardView() {
        if (this.state.currentView === 'card') return;
        
        this.state.currentView = 'card';
        this.applyViewState();
        this.saveViewPreference('card');
        
        RecipeBook.emit('ui:view:changed', { view: 'card' });
        RecipeBook.announce('Switched to card view');
        
        console.log('📇 Switched to card view');
    },

    /**
     * Switch to compact view  
     */
    switchToCompactView() {
        if (this.state.currentView === 'compact') return;
        
        this.state.currentView = 'compact';
        this.applyViewState();
        this.saveViewPreference('compact');
        
        RecipeBook.emit('ui:view:changed', { view: 'compact' });
        RecipeBook.announce('Switched to compact view');
        
        console.log('📄 Switched to compact view');
    },

    /**
     * Apply current view state to DOM
     */
    applyViewState() {
        const cardView = document.querySelector(this.config.cardViewSelector);
        const compactView = document.querySelector(this.config.compactViewSelector);
        const cardViewBtn = document.querySelector(this.config.cardViewButtonSelector);
        const compactViewBtn = document.querySelector(this.config.compactViewButtonSelector);
        
        if (!cardView || !compactView) return;
        
        if (this.state.currentView === 'card') {
            this.showElement(cardView, 'grid');
            this.hideElement(compactView);
            cardViewBtn?.classList.add('active');
            compactViewBtn?.classList.remove('active');
        } else {
            this.hideElement(cardView);
            this.showElement(compactView, 'block');
            compactViewBtn?.classList.add('active');
            cardViewBtn?.classList.remove('active');
        }
    },

    /**
     * Apply initial view state
     */
    applyInitialViewState() {
        this.applyViewState();
    },

    /**
     * Apply saved view preference
     */
    applyViewPreference() {
        const savedView = this.getSavedViewPreference();
        if (savedView === 'compact') {
            this.switchToCompactView();
        } else {
            this.switchToCardView();
        }
    },

    /**
     * Get saved view preference
     */
    getSavedViewPreference() {
        return RecipeBook.getStorage('view-preference', 'card');
    },

    /**
     * Save view preference
     */
    saveViewPreference(view) {
        RecipeBook.setStorage('view-preference', view);
    },

    // ============================================
    // FILTER MANAGEMENT
    // ============================================

    /**
     * Toggle filter section visibility
     */
    toggleFilters() {
        const filterSection = document.querySelector(this.config.filterSectionSelector);
        if (!filterSection) return;
        
        this.state.isFilterVisible = !this.state.isFilterVisible;
        
        if (this.state.isFilterVisible) {
            this.showFilters();
        } else {
            this.hideFilters();
        }
        
        RecipeBook.emit('ui:filters:toggled', { visible: this.state.isFilterVisible });
    },

    /**
     * Show filters
     */
    showFilters() {
        const filterSection = document.querySelector(this.config.filterSectionSelector);
        if (!filterSection) return;
        
        this.slideDown(filterSection);
        this.state.isFilterVisible = true;
        
        // Update toggle button if exists
        const toggleBtn = document.querySelector('.filter-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = 'Hide Filters';
            toggleBtn.setAttribute('aria-expanded', 'true');
        }
    },

    /**
     * Hide filters
     */
    hideFilters() {
        const filterSection = document.querySelector(this.config.filterSectionSelector);
        if (!filterSection) return;
        
        this.slideUp(filterSection);
        this.state.isFilterVisible = false;
        
        // Update toggle button if exists
        const toggleBtn = document.querySelector('.filter-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = 'Show Filters';
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
    },

    /**
     * Handle filter completion
     */
    onFilterComplete(data) {
        const { visibleCount, totalCount } = data;
        
        // Update results counter
        this.updateResultsCounter(visibleCount, totalCount);
        
        // Show/hide empty state
        this.toggleEmptyState(visibleCount === 0);
        
        // Animate filtered results
        this.animateFilteredResults();
    },

    /**
     * Update results counter
     */
    updateResultsCounter(visible, total) {
        const counter = document.querySelector('.results-counter');
        if (!counter) return;
        
        if (visible === total) {
            counter.textContent = `${total} recipe${total !== 1 ? 's' : ''}`;
        } else {
            counter.textContent = `${visible} of ${total} recipe${total !== 1 ? 's' : ''}`;
        }
        
        // Add emphasis animation
        counter.classList.add('updated');
        setTimeout(() => counter.classList.remove('updated'), 500);
    },

    /**
     * Toggle empty state
     */
    toggleEmptyState(show) {
        const emptyState = document.querySelector('.empty-state');
        const contentArea = document.querySelector('.recipes-content, .recipe-grid, .recipe-list-compact');
        
        if (show) {
            this.showElement(emptyState);
            this.hideElement(contentArea);
        } else {
            this.hideElement(emptyState);
            this.showElement(contentArea);
        }
    },

    /**
     * Animate filtered results
     */
    animateFilteredResults() {
        const visibleCards = document.querySelectorAll('.recipe-card:not([style*="display: none"])');
        
        // Stagger animation for visible cards
        visibleCards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 50);
        });
    },

    // ============================================
    // THEME MANAGEMENT
    // ============================================

    /**
     * Initialize theme system
     */
    initializeThemeSystem() {
        const themeToggle = document.querySelector(this.config.themeToggleSelector);
        
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        // Apply saved theme
        this.applyTheme(this.state.currentTheme);
        
        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => this.onSystemThemeChange(e));
        }
        
        console.log('🌓 Theme system initialized');
    },

    /**
     * Toggle theme
     */
    toggleTheme() {
        const newTheme = this.state.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    },

    /**
     * Set theme
     */
    setTheme(theme) {
        this.state.currentTheme = theme;
        this.applyTheme(theme);
        this.saveTheme(theme);
        
        RecipeBook.emit('ui:theme:changed', { theme });
        RecipeBook.announce(`Switched to ${theme} theme`);
    },

    /**
     * Apply theme to document
     */
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update theme toggle button
        const themeToggle = document.querySelector(this.config.themeToggleSelector);
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) {
                icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
            }
            themeToggle.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
        }
        
        // Update meta theme-color
        let themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) {
            themeColorMeta = document.createElement('meta');
            themeColorMeta.name = 'theme-color';
            document.head.appendChild(themeColorMeta);
        }
        
        themeColorMeta.content = theme === 'light' ? '#ffffff' : '#1a1a1a';
    },

    /**
     * Get current theme
     */
    getCurrentTheme() {
        const saved = RecipeBook.getStorage('theme-preference');
        if (saved) return saved;
        
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        
        return 'light';
    },

    /**
     * Save theme preference
     */
    saveTheme(theme) {
        RecipeBook.setStorage('theme-preference', theme);
    },

    /**
     * Handle system theme change
     */
    onSystemThemeChange(e) {
        // Only apply system theme if user hasn't manually set a preference
        const hasSavedTheme = RecipeBook.getStorage('theme-preference');
        if (!hasSavedTheme) {
            this.setTheme(e.matches ? 'dark' : 'light');
        }
    },

    /**
     * Handle theme change event
     */
    onThemeChange(data) {
        this.state.currentTheme = data.theme;
        this.applyTheme(data.theme);
    },

    // ============================================
    // SCROLL FEATURES
    // ============================================

    /**
     * Initialize scroll-based features
     */
    initializeScrollFeatures() {
        this.createBackToTopButton();
        this.initializeScrollSpy();
        this.initializeLazyLoading();
        this.initializeInfiniteScroll();
        
        console.log('📜 Scroll features initialized');
    },

    /**
     * Create back to top button
     */
    createBackToTopButton() {
        let backToTop = document.querySelector(this.config.backToTopSelector);
        
        if (!backToTop) {
            backToTop = document.createElement('button');
            backToTop.className = 'back-to-top';
            backToTop.innerHTML = '<i class="fas fa-chevron-up"></i>';
            backToTop.setAttribute('aria-label', 'Back to top');
            backToTop.title = 'Back to top';
            document.body.appendChild(backToTop);
        }
        
        backToTop.addEventListener('click', () => this.scrollToTop());
        
        // Show/hide based on scroll position
        this.toggleBackToTopButton();
    },

    /**
     * Handle scroll events
     */
    onScroll() {
        this.state.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        this.toggleBackToTopButton();
        this.updateScrollProgress();
        this.handleScrollDirection();
        
        RecipeBook.emit('ui:scroll', { 
            position: this.state.scrollPosition,
            direction: this.getScrollDirection()
        });
    },

    /**
     * Toggle back to top button visibility
     */
    toggleBackToTopButton() {
        const backToTop = document.querySelector(this.config.backToTopSelector);
        if (!backToTop) return;
        
        if (this.state.scrollPosition > this.config.scrollThreshold) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    },

    /**
     * Scroll to top smoothly
     */
    scrollToTop() {
        const startPosition = this.state.scrollPosition;
        const startTime = performance.now();
        const duration = 500;
        
        const animateScroll = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeInOutCubic = progress < 0.5 
                ? 4 * progress * progress * progress 
                : (progress - 1) * (2 * progress - 2) * (2 * progress - 2) + 1;
            
            const currentPosition = startPosition * (1 - easeInOutCubic);
            window.scrollTo(0, currentPosition);
            
            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            } else {
                RecipeBook.announce('Scrolled to top');
            }
        };
        
        requestAnimationFrame(animateScroll);
    },

    /**
     * Update scroll progress indicator
     */
    updateScrollProgress() {
        let progressBar = document.querySelector('.scroll-progress');
        
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.className = 'scroll-progress';
            document.body.appendChild(progressBar);
        }
        
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = this.state.scrollPosition;
        
        const progress = scrollTop / (documentHeight - windowHeight);
        progressBar.style.width = `${Math.min(progress * 100, 100)}%`;
    },

    /**
     * Handle scroll direction changes
     */
    handleScrollDirection() {
        const direction = this.getScrollDirection();
        
        if (direction === 'down' && this.state.scrollPosition > 100) {
            this.hideNavbar();
        } else if (direction === 'up') {
            this.showNavbar();
        }
    },

    /**
     * Get scroll direction
     */
    getScrollDirection() {
        const currentScroll = this.state.scrollPosition;
        const lastScroll = this.state.lastScrollPosition || 0;
        this.state.lastScrollPosition = currentScroll;
        
        return currentScroll > lastScroll ? 'down' : 'up';
    },

    /**
     * Hide navbar on scroll down
     */
    hideNavbar() {
        const navbar = document.querySelector('.navbar');
        if (navbar && !navbar.classList.contains('navbar-hidden')) {
            navbar.classList.add('navbar-hidden');
        }
    },

    /**
     * Show navbar on scroll up
     */
    showNavbar() {
        const navbar = document.querySelector('.navbar');
        if (navbar && navbar.classList.contains('navbar-hidden')) {
            navbar.classList.remove('navbar-hidden');
        }
    },

    /**
     * Initialize scroll spy for navigation
     */
    initializeScrollSpy() {
        const sections = document.querySelectorAll('[data-scroll-spy]');
        const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
        
        if (sections.length === 0) return;
        
        const observerOptions = {
            root: null,
            rootMargin: '-20% 0px -70% 0px',
            threshold: 0
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const id = entry.target.getAttribute('id');
                const navLink = document.querySelector(`.nav-link[href="#${id}"]`);
                
                if (entry.isIntersecting) {
                    navLinks.forEach(link => link.classList.remove('active'));
                    if (navLink) navLink.classList.add('active');
                }
            });
        }, observerOptions);
        
        sections.forEach(section => observer.observe(section));
        this.state.intersectionObservers.set('scrollSpy', observer);
    },

    // ============================================
    // LAZY LOADING
    // ============================================

    /**
     * Initialize lazy loading for images
     */
    initializeLazyLoading() {
        const lazyImages = document.querySelectorAll('img[data-src]');
        
        if (lazyImages.length === 0) return;
        
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadLazyImage(entry.target);
                    imageObserver.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: '50px 0px'
        });
        
        lazyImages.forEach(img => {
            imageObserver.observe(img);
            img.classList.add('lazy-loading');
        });
        
        this.state.intersectionObservers.set('lazyLoading', imageObserver);
        console.log(`🖼️ Lazy loading initialized for ${lazyImages.length} images`);
    },

    /**
     * Load lazy image
     */
    loadLazyImage(img) {
        const src = img.getAttribute('data-src');
        if (!src) return;
        
        // Create a new image to preload
        const imageLoader = new Image();
        
        imageLoader.onload = () => {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-loaded');
            img.removeAttribute('data-src');
        };
        
        imageLoader.onerror = () => {
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-error');
            
            // Set placeholder or error image
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4%3D';
        };
        
        imageLoader.src = src;
    },

    // ============================================
    // INFINITE SCROLL
    // ============================================

    /**
     * Initialize infinite scroll
     */
    initializeInfiniteScroll() {
        const trigger = document.querySelector('.infinite-scroll-trigger');
        if (!trigger) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.state.isLoading) {
                    this.loadMoreContent();
                }
            });
        }, {
            rootMargin: '100px 0px'
        });
        
        observer.observe(trigger);
        this.state.intersectionObservers.set('infiniteScroll', observer);
        
        console.log('♾️ Infinite scroll initialized');
    },

    /**
     * Load more content for infinite scroll
     */
    async loadMoreContent() {
        if (this.state.isLoading) return;
        
        this.state.isLoading = true;
        this.showLoadingIndicator();
        
        try {
            // This would typically load more recipes from the server
            const response = await this.loadMoreRecipes();
            
            if (response && response.recipes && response.recipes.length > 0) {
                this.appendRecipes(response.recipes);
                RecipeBook.emit('ui:content:loaded', { count: response.recipes.length });
            } else {
                this.handleEndOfContent();
            }
        } catch (error) {
            console.error('Failed to load more content:', error);
            this.showLoadMoreError();
        } finally {
            this.state.isLoading = false;
            this.hideLoadingIndicator();
        }
    },

    /**
     * Load more recipes (placeholder for actual implementation)
     */
    async loadMoreRecipes() {
        // This would make an actual API call
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({ recipes: [] }); // No more recipes
            }, 1000);
        });
    },

    /**
     * Append recipes to the list
     */
    appendRecipes(recipes) {
        const container = this.state.currentView === 'card' 
            ? document.querySelector(this.config.cardViewSelector)
            : document.querySelector(this.config.compactViewSelector);
        
        if (!container) return;
        
        recipes.forEach((recipe, index) => {
            const recipeElement = this.createRecipeElement(recipe);
            container.appendChild(recipeElement);
            
            // Animate in
            setTimeout(() => {
                recipeElement.classList.add('fade-in');
            }, index * 100);
        });
    },

    /**
     * Handle end of content
     */
    handleEndOfContent() {
        const trigger = document.querySelector('.infinite-scroll-trigger');
        if (trigger) {
            trigger.style.display = 'none';
        }
        
        // Show end message
        const endMessage = document.createElement('div');
        endMessage.className = 'end-of-content';
        endMessage.innerHTML = '<p>You\'ve reached the end of the recipes!</p>';
        
        const container = document.querySelector('.recipes-container');
        if (container) {
            container.appendChild(endMessage);
        }
    },

    // ============================================
    // LOADING STATES
    // ============================================

    /**
     * Show loading overlay
     */
    showLoadingOverlay(message = 'Loading...') {
        let overlay = document.querySelector(this.config.loadingOverlaySelector);
        
        if (!overlay) {
            overlay = this.createLoadingOverlay();
            document.body.appendChild(overlay);
        }
        
        const messageElement = overlay.querySelector('.loading-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
        
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    },

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        const overlay = document.querySelector(this.config.loadingOverlaySelector);
        if (!overlay) return;
        
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }, this.config.animationDuration);
    },

    /**
     * Create loading overlay
     */
    createLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner-ring"></div>
                <div class="loading-message">Loading...</div>
            </div>
        `;
        return overlay;
    },

    /**
     * Show loading indicator
     */
    showLoadingIndicator() {
        let indicator = document.querySelector('.loading-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'loading-indicator';
            indicator.innerHTML = `
                <div class="spinner"></div>
                <span>Loading more recipes...</span>
            `;
            
            const container = document.querySelector('.recipes-container');
            if (container) {
                container.appendChild(indicator);
            }
        }
        
        indicator.style.display = 'flex';
    },

    /**
     * Hide loading indicator
     */
    hideLoadingIndicator() {
        const indicator = document.querySelector('.loading-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    },

    /**
     * Show load more error
     */
    showLoadMoreError() {
        const errorElement = document.createElement('div');
        errorElement.className = 'load-more-error';
        errorElement.innerHTML = `
            <p>Failed to load more recipes.</p>
            <button class="btn btn-secondary retry-load">Try Again</button>
        `;
        
        const retryButton = errorElement.querySelector('.retry-load');
        retryButton.addEventListener('click', () => {
            errorElement.remove();
            this.loadMoreContent();
        });
        
        const container = document.querySelector('.recipes-container');
        if (container) {
            container.appendChild(errorElement);
        }
    },

    // ============================================
    // RESPONSIVE FEATURES
    // ============================================

    /**
     * Initialize responsive features
     */
    initializeResponsiveFeatures() {
        this.initializeResizeObserver();
        this.handleViewportChanges();
        this.initializeBreakpointDetection();
        
        console.log('📱 Responsive features initialized');
    },

    /**
     * Initialize resize observer
     */
    initializeResizeObserver() {
        if (!window.ResizeObserver) return;
        
        this.state.resizeObserver = new ResizeObserver((entries) => {
            entries.forEach(entry => {