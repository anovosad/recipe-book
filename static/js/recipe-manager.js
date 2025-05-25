// static/js/recipe-manager.js - Recipe Management Module

/**
 * Recipe Management Module
 * Handles all recipe-related functionality including CRUD operations,
 * serving calculations, and recipe display features
 */
const RecipeManager = {
    // Module configuration
    config: {
        servingCalculatorSelector: '#servingSize',
        resetButtonSelector: '#resetServings',
        ingredientsListSelector: '#ingredientsList',
        deleteConfirmMessage: 'Are you sure you want to delete this recipe? This action cannot be undone.',
        recalculateDebounce: 150
    },

    // Module state
    state: {
        originalServings: null,
        currentServings: null,
        servingCalculatorActive: false,
        recipeData: null,
        imageModal: null
    },

    /**
     * Initialize Recipe Manager
     */
    init() {
        console.log('🍳 Initializing Recipe Manager...');
        
        this.bindEvents();
        this.initializeServingCalculator();
        this.initializeImageModal();
        this.initializeRecipeCards();
        
        console.log('✅ Recipe Manager initialized');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Listen for core app events
        RecipeBook.on('dom:ready', () => this.onDOMReady());
        RecipeBook.on('recipe:created', (data) => this.onRecipeCreated(data));
        RecipeBook.on('recipe:updated', (data) => this.onRecipeUpdated(data));
        RecipeBook.on('recipe:deleted', (data) => this.onRecipeDeleted(data));
    },

    /**
     * Handle DOM ready event
     */
    onDOMReady() {
        this.initializeServingCalculator();
        this.initializeImageModal();
        this.initializeRecipeCards();
    },

    // ============================================
    // RECIPE CRUD OPERATIONS
    // ============================================

    /**
     * Delete recipe with confirmation
     */
    async deleteRecipe(id, options = {}) {
        if (!id) {
            console.error('Recipe ID is required for deletion');
            return false;
        }

        const confirmMessage = options.confirmMessage || this.config.deleteConfirmMessage;
        
        if (!confirm(confirmMessage)) {
            return false;
        }

        // Find delete button for loading state
        const deleteButton = document.querySelector(`[onclick*="deleteRecipe(${id})"], [data-recipe-id="${id}"] .delete-btn`);
        const removeLoading = deleteButton ? RecipeBook.addLoadingState(deleteButton, 'Deleting...') : null;

        try {
            const response = await RecipeBook.apiRequest(`/api/recipes/${id}`, {
                method: 'DELETE'
            });

            // Handle success
            this.handleDeleteSuccess(id, options);
            RecipeBook.emit('recipe:deleted', { id, response });
            
            return true;
        } catch (error) {
            console.error('Failed to delete recipe:', error);
            RecipeBook.showNotification('Failed to delete recipe. Please try again.', 'error');
            RecipeBook.emit('recipe:delete:error', { id, error });
            
            return false;
        } finally {
            if (removeLoading) removeLoading();
        }
    },

    /**
     * Handle successful recipe deletion
     */
    handleDeleteSuccess(id, options) {
        RecipeBook.showNotification('Recipe deleted successfully', 'success');
        
        // If we're on the recipe detail page, redirect to recipes list
        if (window.location.pathname.includes('/recipe/')) {
            setTimeout(() => {
                window.location.href = '/recipes';
            }, 1000);
        } else {
            // Remove recipe card from the current page
            this.removeRecipeCard(id);
        }
    },

    /**
     * Remove recipe card from page
     */
    removeRecipeCard(id) {
        const recipeCard = document.querySelector(`[data-recipe-id="${id}"], .recipe-card:has([onclick*="deleteRecipe(${id})"])`);
        if (recipeCard) {
            RecipeBook.hideElement(recipeCard);
        } else {
            // Fallback: reload the page
            setTimeout(() => location.reload(), 1000);
        }
    },

    /**
     * Load recipe data
     */
    async loadRecipe(id) {
        try {
            const recipe = await RecipeBook.apiRequest(`/api/recipes/${id}`);
            this.state.recipeData = recipe;
            RecipeBook.emit('recipe:loaded', { recipe });
            return recipe;
        } catch (error) {
            console.error('Failed to load recipe:', error);
            RecipeBook.showNotification('Failed to load recipe', 'error');
            throw error;
        }
    },

    /**
     * Event handlers for recipe operations
     */
    onRecipeCreated(data) {
        RecipeBook.showNotification('Recipe created successfully!', 'success');
    },

    onRecipeUpdated(data) {
        RecipeBook.showNotification('Recipe updated successfully!', 'success');
    },

    onRecipeDeleted(data) {
        // Additional cleanup if needed
    },

    // ============================================
    // SERVING CALCULATOR
    // ============================================

    /**
     * Initialize serving size calculator
     */
    initializeServingCalculator() {
        const servingInput = document.querySelector(this.config.servingCalculatorSelector);
        const resetButton = document.querySelector(this.config.resetButtonSelector);
        
        if (!servingInput) return;

        // Get original servings from data attribute or input value
        this.state.originalServings = parseInt(servingInput.dataset.original || servingInput.value) || 1;
        this.state.currentServings = this.state.originalServings;

        // Set data attribute for reference
        servingInput.dataset.original = this.state.originalServings;

        // Bind events
        this.bindServingCalculatorEvents(servingInput, resetButton);
        
        console.log(`📊 Serving calculator initialized (original: ${this.state.originalServings})`);
    },

    /**
     * Bind serving calculator events
     */
    bindServingCalculatorEvents(servingInput, resetButton) {
        // Debounced recalculation on input
        const debouncedRecalculate = RecipeBook.debounce((value) => {
            this.recalculateIngredients(parseInt(value) || 1);
        }, this.config.recalculateDebounce);

        servingInput.addEventListener('input', (e) => {
            debouncedRecalculate(e.target.value);
        });

        servingInput.addEventListener('change', (e) => {
            this.recalculateIngredients(parseInt(e.target.value) || 1);
        });

        // Reset button
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetServings();
            });
        }

        // Keyboard shortcuts
        servingInput.addEventListener('keydown', (e) => {
            this.handleServingKeydown(e);
        });
    },

    /**
     * Handle keyboard shortcuts for serving input
     */
    handleServingKeydown(e) {
        const servingInput = e.target;
        const currentValue = parseInt(servingInput.value) || 1;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                servingInput.value = Math.min(currentValue + 1, 50);
                this.recalculateIngredients(parseInt(servingInput.value));
                break;
            
            case 'ArrowDown':
                e.preventDefault();
                servingInput.value = Math.max(currentValue - 1, 1);
                this.recalculateIngredients(parseInt(servingInput.value));
                break;
            
            case 'Escape':
                this.resetServings();
                break;
        }
    },

    /**
     * Recalculate ingredient quantities based on new serving size
     */
    recalculateIngredients(newServings) {
        if (!newServings || newServings < 1 || newServings > 50) {
            console.warn('Invalid serving size:', newServings);
            return;
        }

        const originalServings = this.state.originalServings;
        if (!originalServings) return;

        this.state.currentServings = newServings;
        const ratio = newServings / originalServings;

        const ingredientItems = document.querySelectorAll('.ingredient-item');
        
        ingredientItems.forEach(item => {
            this.updateIngredientQuantity(item, ratio);
        });

        // Update calculator visual state
        this.updateCalculatorState(ratio !== 1);

        // Emit event for other modules
        RecipeBook.emit('recipe:servings:changed', {
            originalServings,
            newServings,
            ratio
        });

        console.log(`📊 Recalculated for ${newServings} servings (ratio: ${ratio.toFixed(2)})`);
    },

    /**
     * Update individual ingredient quantity
     */
    updateIngredientQuantity(item, ratio) {
        const quantitySpan = item.querySelector('.quantity');
        const originalQuantity = parseFloat(item.dataset.originalQuantity);
        
        if (!quantitySpan || isNaN(originalQuantity)) return;

        const newQuantity = originalQuantity * ratio;
        const displayQuantity = this.formatQuantity(newQuantity);
        
        quantitySpan.textContent = displayQuantity;
        
        // Add visual indicator for adjusted quantities
        if (ratio !== 1) {
            quantitySpan.classList.add('quantity-adjusted');
            quantitySpan.title = `Original: ${this.formatQuantity(originalQuantity)}`;
        } else {
            quantitySpan.classList.remove('quantity-adjusted');
            quantitySpan.removeAttribute('title');
        }
    },

    /**
     * Update calculator visual state
     */
    updateCalculatorState(isActive) {
        const calculator = document.querySelector('.serving-calculator');
        const resetButton = document.querySelector(this.config.resetButtonSelector);
        
        if (calculator) {
            calculator.classList.toggle('calculator-active', isActive);
        }
        
        if (resetButton) {
            resetButton.style.display = isActive ? 'inline-flex' : 'none';
        }

        this.state.servingCalculatorActive = isActive;
    },

    /**
     * Reset servings to original amount
     */
    resetServings() {
        const servingInput = document.querySelector(this.config.servingCalculatorSelector);
        if (!servingInput || !this.state.originalServings) return;

        servingInput.value = this.state.originalServings;
        this.recalculateIngredients(this.state.originalServings);
        
        RecipeBook.showNotification('Servings reset to original amount', 'info');
        RecipeBook.emit('recipe:servings:reset', { 
            servings: this.state.originalServings 
        });
    },

    // ============================================
    // QUANTITY FORMATTING
    // ============================================

    /**
     * Format cooking quantity with fractions
     */
    formatQuantity(quantity) {
        if (!quantity || quantity === 0) return '0';

        // Common cooking fractions
        const fractions = {
            0.125: '⅛',
            0.25: '¼', 
            0.33: '⅓',
            0.375: '⅜',
            0.5: '½',
            0.625: '⅝',
            0.67: '⅔',
            0.75: '¾',
            0.875: '⅞'
        };
        
        // If it's a whole number, return as-is
        if (quantity === Math.floor(quantity)) {
            return quantity.toString();
        }
        
        // Round to 3 decimal places for comparison
        const rounded = Math.round(quantity * 1000) / 1000;
        
        // Check for exact fraction matches
        for (const [decimal, fraction] of Object.entries(fractions)) {
            if (Math.abs(rounded - decimal) < 0.01) {
                return fraction;
            }
        }
        
        // Check for mixed numbers (whole + fraction)
        const whole = Math.floor(quantity);
        const remainder = quantity - whole;
        
        for (const [decimal, fraction] of Object.entries(fractions)) {
            if (Math.abs(remainder - decimal) < 0.01) {
                return whole > 0 ? `${whole} ${fraction}` : fraction;
            }
        }
        
        // Fallback to decimal with appropriate precision
        if (quantity < 1) {
            return quantity.toFixed(2);
        } else if (quantity < 10) {
            return quantity.toFixed(1);
        } else {
            return Math.round(quantity).toString();
        }
    },

    /**
     * Parse quantity from string (reverse of formatQuantity)
     */
    parseQuantity(quantityString) {
        if (!quantityString || typeof quantityString !== 'string') return 0;

        const fractions = {
            '⅛': 0.125,
            '¼': 0.25,
            '⅓': 0.33,
            '⅜': 0.375,
            '½': 0.5,
            '⅝': 0.625,
            '⅔': 0.67,
            '¾': 0.75,
            '⅞': 0.875
        };

        // Handle mixed numbers (e.g., "2 ½")
        const mixedMatch = quantityString.match(/^(\d+)\s*([⅛¼⅓⅜½⅝⅔¾⅞])$/);
        if (mixedMatch) {
            const whole = parseInt(mixedMatch[1]);
            const fraction = fractions[mixedMatch[2]];
            return whole + fraction;
        }

        // Handle pure fractions
        if (fractions[quantityString]) {
            return fractions[quantityString];
        }

        // Handle regular numbers
        const number = parseFloat(quantityString);
        return isNaN(number) ? 0 : number;
    },

    // ============================================
    // IMAGE MODAL
    // ============================================

    /**
     * Initialize image modal for recipe photos
     */
    initializeImageModal() {
        // Create modal if it doesn't exist
        this.ensureImageModal();
        
        // Bind events for existing images
        this.bindImageEvents();
        
        console.log('🖼️ Recipe image modal initialized');
    },

    /**
     * Ensure image modal exists
     */
    ensureImageModal() {
        let modal = document.getElementById('recipe-image-modal');
        
        if (!modal) {
            modal = this.createImageModal();
            document.body.appendChild(modal);
        }
        
        this.state.imageModal = modal;
    },

    /**
     * Create image modal element
     */
    createImageModal() {
        const modal = document.createElement('div');
        modal.id = 'recipe-image-modal';
        modal.className = 'image-modal';
        modal.style.display = 'none';
        
        modal.innerHTML = `
            <div class="image-modal-backdrop"></div>
            <div class="image-modal-content">
                <button class="image-modal-close" type="button" aria-label="Close image">
                    <i class="fas fa-times"></i>
                </button>
                <div class="image-modal-navigation">
                    <button class="image-nav-prev" type="button" aria-label="Previous image">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="image-nav-next" type="button" aria-label="Next image">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <img class="image-modal-img" src="" alt="">
                <div class="image-modal-caption"></div>
                <div class="image-modal-counter"></div>
            </div>
        `;
        
        // Bind modal events
        this.bindImageModalEvents(modal);
        
        return modal;
    },

    /**
     * Bind image modal events
     */
    bindImageModalEvents(modal) {
        const closeBtn = modal.querySelector('.image-modal-close');
        const backdrop = modal.querySelector('.image-modal-backdrop');
        const prevBtn = modal.querySelector('.image-nav-prev');
        const nextBtn = modal.querySelector('.image-nav-next');
        
        // Close events
        closeBtn.addEventListener('click', () => this.closeImageModal());
        backdrop.addEventListener('click', () => this.closeImageModal());
        
        // Navigation events
        prevBtn.addEventListener('click', () => this.showPreviousImage());
        nextBtn.addEventListener('click', () => this.showNextImage());
        
        // Keyboard events
        modal.addEventListener('keydown', (e) => this.handleImageModalKeydown(e));
    },

    /**
     * Bind events for recipe images
     */
    bindImageEvents() {
        document.querySelectorAll('.recipe-image-main, .recipe-image-preview').forEach((img, index) => {
            img.addEventListener('click', () => this.openImageModal(img, index));
            img.style.cursor = 'pointer';
            img.title = 'Click to view full size';
        });
    },

    /**
     * Open image modal
     */
    openImageModal(img, index = 0) {
        if (!img || !this.state.imageModal) return;

        const allImages = document.querySelectorAll('.recipe-image-main, .recipe-image-preview');
        this.state.currentImageIndex = index;
        this.state.totalImages = allImages.length;
        
        this.updateImageModal(img);
        this.state.imageModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus management
        this.state.imageModal.focus();
        
        RecipeBook.emit('recipe:image:open', { img, index });
    },

    /**
     * Close image modal
     */
    closeImageModal() {
        if (!this.state.imageModal) return;
        
        this.state.imageModal.style.display = 'none';
        document.body.style.overflow = '';
        
        RecipeBook.emit('recipe:image:close');
    },

    /**
     * Show previous image
     */
    showPreviousImage() {
        if (this.state.currentImageIndex > 0) {
            this.state.currentImageIndex--;
        } else {
            this.state.currentImageIndex = this.state.totalImages - 1;
        }
        
        this.updateModalFromIndex();
    },

    /**
     * Show next image
     */
    showNextImage() {
        if (this.state.currentImageIndex < this.state.totalImages - 1) {
            this.state.currentImageIndex++;
        } else {
            this.state.currentImageIndex = 0;
        }
        
        this.updateModalFromIndex();
    },

    /**
     * Update modal from current index
     */
    updateModalFromIndex() {
        const allImages = document.querySelectorAll('.recipe-image-main, .recipe-image-preview');
        const currentImg = allImages[this.state.currentImageIndex];
        
        if (currentImg) {
            this.updateImageModal(currentImg);
        }
    },

    /**
     * Update image modal content
     */
    updateImageModal(img) {
        const modal = this.state.imageModal;
        if (!modal) return;

        const modalImg = modal.querySelector('.image-modal-img');
        const caption = modal.querySelector('.image-modal-caption');
        const counter = modal.querySelector('.image-modal-counter');
        const prevBtn = modal.querySelector('.image-nav-prev');
        const nextBtn = modal.querySelector('.image-nav-next');

        // Update image
        modalImg.src = img.src;
        modalImg.alt = img.alt || '';

        // Update caption
        const captionText = img.alt || img.title || img.closest('.recipe-image-card')?.querySelector('.recipe-image-caption')?.textContent || '';
        caption.textContent = captionText;
        caption.style.display = captionText ? 'block' : 'none';

        // Update counter
        if (this.state.totalImages > 1) {
            counter.textContent = `${this.state.currentImageIndex + 1} / ${this.state.totalImages}`;
            counter.style.display = 'block';
            prevBtn.style.display = 'block';
            nextBtn.style.display = 'block';
        } else {
            counter.style.display = 'none';
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
        }
    },

    /**
     * Handle image modal keyboard navigation
     */
    handleImageModalKeydown(e) {
        switch (e.key) {
            case 'Escape':
                this.closeImageModal();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.showPreviousImage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.showNextImage();
                break;
        }
    },

    // ============================================
    // RECIPE CARDS
    // ============================================

    /**
     * Initialize recipe cards functionality
     */
    initializeRecipeCards() {
        const recipeCards = document.querySelectorAll('.recipe-card');
        
        recipeCards.forEach(card => {
            this.enhanceRecipeCard(card);
        });
        
        console.log(`📇 Enhanced ${recipeCards.length} recipe cards`);
    },

    /**
     * Enhance individual recipe card
     */
    enhanceRecipeCard(card) {
        // Add click-to-view functionality (avoiding buttons/links)
        card.addEventListener('click', (e) => {
            if (this.shouldHandleCardClick(e)) {
                const viewLink = card.querySelector('a[href*="/recipe/"]');
                if (viewLink) {
                    window.location.href = viewLink.href;
                }
            }
        });

        // Add keyboard navigation
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.shouldHandleCardClick(e)) {
                e.preventDefault();
                const viewLink = card.querySelector('a[href*="/recipe/"]');
                if (viewLink) {
                    viewLink.click();
                }
            }
        });

        // Make card focusable
        if (!card.hasAttribute('tabindex')) {
            card.setAttribute('tabindex', '0');
        }

        // Add hover effect class
        card.style.cursor = 'pointer';

        // Add loading states to action buttons
        this.enhanceCardButtons(card);
    },

    /**
     * Check if card click should be handled
     */
    shouldHandleCardClick(e) {
        const clickableElements = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
        const isClickableElement = clickableElements.includes(e.target.tagName);
        const isInClickableElement = e.target.closest('button, a, input, select, textarea');
        
        return !isClickableElement && !isInClickableElement;
    },

    /**
     * Enhance recipe card buttons
     */
    enhanceCardButtons(card) {
        const deleteBtn = card.querySelector('[onclick*="deleteRecipe"], .delete-btn');
        const editBtn = card.querySelector('a[href*="/edit"], .edit-btn');
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
            });
        }
        
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
            });
        }
    },

    // ============================================
    // RECIPE SEARCH & FILTERING
    // ============================================

    /**
     * Filter recipes by criteria
     */
    filterRecipes(criteria) {
        const { 
            searchQuery = '', 
            tags = [], 
            cookTime = null, 
            difficulty = null 
        } = criteria;

        const recipeCards = document.querySelectorAll('.recipe-card');
        let visibleCount = 0;

        recipeCards.forEach(card => {
            const shouldShow = this.shouldShowRecipe(card, criteria);
            
            if (shouldShow) {
                this.showRecipeCard(card);
                visibleCount++;
            } else {
                this.hideRecipeCard(card);
            }
        });

        // Update empty state
        this.updateEmptyState(visibleCount);

        RecipeBook.emit('recipe:filter:complete', { 
            criteria, 
            visibleCount, 
            totalCount: recipeCards.length 
        });

        return visibleCount;
    },

    /**
     * Check if recipe should be shown based on criteria
     */
    shouldShowRecipe(card, criteria) {
        const { searchQuery, tags, cookTime, difficulty } = criteria;

        // Search query check
        if (searchQuery) {
            const title = card.querySelector('.recipe-title')?.textContent.toLowerCase() || '';
            const description = card.querySelector('.recipe-description')?.textContent.toLowerCase() || '';
            
            if (!title.includes(searchQuery.toLowerCase()) && !description.includes(searchQuery.toLowerCase())) {
                return false;
            }
        }

        // Tags check
        if (tags && tags.length > 0) {
            const recipeTags = Array.from(card.querySelectorAll('.recipe-tag')).map(tag => 
                tag.textContent.trim().toLowerCase()
            );
            
            const hasMatchingTag = tags.some(tag => 
                recipeTags.includes(tag.toLowerCase())
            );
            
            if (!hasMatchingTag) {
                return false;
            }
        }

        // Additional filters can be added here
        
        return true;
    },

    /**
     * Show recipe card with animation
     */
    showRecipeCard(card) {
        card.style.display = 'block';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    },

    /**
     * Hide recipe card with animation
     */
    hideRecipeCard(card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            card.style.display = 'none';
        }, 300);
    },

    /**
     * Update empty state visibility
     */
    updateEmptyState(visibleCount) {
        const emptyState = document.querySelector('.empty-state');
        const recipeGrid = document.querySelector('.recipe-grid, .recipe-list-compact');
        
        if (emptyState && recipeGrid) {
            if (visibleCount === 0) {
                emptyState.style.display = 'block';
                recipeGrid.style.display = 'none';
            } else {
                emptyState.style.display = 'none';
                recipeGrid.style.display = '';
            }
        }
    },

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Get recipe data from page
     */
    getRecipeDataFromPage() {
        // Try to get from window.recipeData first
        if (window.recipeData) {
            return window.recipeData;
        }

        // Extract from page elements
        const titleElement = document.querySelector('.recipe-title, h1');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        const servingElement = document.querySelector(this.config.servingCalculatorSelector);
        const servings = servingElement ? parseInt(servingElement.value) : null;

        return {
            title,
            servings,
            // Add more fields as needed
        };
    },

    /**
     * Validate recipe data
     */
    validateRecipeData(data) {
        const errors = [];

        if (!data.title || data.title.trim().length === 0) {
            errors.push('Recipe title is required');
        }

        if (data.servings && (data.servings < 1 || data.servings > 50)) {
            errors.push('Servings must be between 1 and 50');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Reset module state
     */
    reset() {
        this.state.originalServings = null;
        this.state.currentServings = null;
        this.state.servingCalculatorActive = false;
        this.state.recipeData = null;
        
        this.closeImageModal();
        
        RecipeBook.emit('recipe:manager:reset');
    },

    /**
     * Get module debug information
     */
    getDebugInfo() {
        return {
            state: { ...this.state },
            config: { ...this.config },
            hasImageModal: !!this.state.imageModal,
            servingCalculatorActive: this.state.servingCalculatorActive
        };
    }
};

// ============================================
// BACKWARD COMPATIBILITY & GLOBAL FUNCTIONS
// ============================================

/**
 * Global function for backward compatibility
 * Called from templates with onclick handlers
 */
function deleteRecipe(id) {
    return RecipeManager.deleteRecipe(id);
}

/**
 * Global function for opening image modal
 * Called from templates
 */
function openImageModal(img) {
    const index = Array.from(document.querySelectorAll('.recipe-image-main, .recipe-image-preview')).indexOf(img);
    return RecipeManager.openImageModal(img, index);
}

/**
 * Global function for closing image modal
 */
function closeImageModal() {
    return RecipeManager.closeImageModal();
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

// Initialize when core app is ready
RecipeBook.on('app:initialized', () => {
    RecipeManager.init();
});

// Initialize immediately if core is already ready
if (RecipeBook.state && RecipeBook.state.isInitialized) {
    RecipeManager.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecipeManager;
} else if (typeof window !== 'undefined') {
    window.RecipeManager = RecipeManager;
}