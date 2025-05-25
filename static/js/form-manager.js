// static/js/form-manager.js - Form Management Module

/**
 * Form Management Module
 * Handles all form-related functionality including recipe forms,
 * ingredient management, validation, and dynamic form components
 */
const FormManager = {
    // Module configuration
    config: {
        recipeFormSelector: '.recipe-form',
        ingredientFormSelector: '.ingredient-form',
        tagFormSelector: '.tag-form',
        ingredientsContainerSelector: '#ingredients-container',
        addIngredientButtonSelector: '#add-ingredient',
        addNewIngredientButtonSelector: '#add-new-ingredient-btn',
        ingredientModalSelector: '#ingredient-modal',
        newIngredientFormSelector: '#new-ingredient-form',
        tagFiltersSelector: '.tag-filters',
        imagePreviewContainerSelector: '#image-preview-container',
        maxIngredients: 50,
        maxImages: 10,
        debounceDelay: 300
    },

    // Module state
    state: {
        ingredientCounter: 0,
        allIngredients: [],
        selectedTags: new Set(),
        uploadedImages: [],
        formValidationRules: new Map(),
        activeForm: null,
        isDirty: false
    },

    /**
     * Initialize Form Manager
     */
    init() {
        console.log('📝 Initializing Form Manager...');
        
        this.loadInitialData();
        this.bindEvents();
        this.initializeForms();
        
        console.log('✅ Form Manager initialized');
    },

    /**
     * Load initial data from window or page
     */
    loadInitialData() {
        // Load ingredients data
        if (window.allIngredients) {
            this.state.allIngredients = window.allIngredients;
        }

        // Load recipe data if editing
        if (window.recipeData) {
            this.state.ingredientCounter = window.recipeData.ingredientCount || 0;
        }

        console.log(`📋 Loaded ${this.state.allIngredients.length} ingredients`);
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Listen for core app events
        RecipeBook.on('dom:ready', () => this.onDOMReady());
        RecipeBook.on('form:submit:success', (data) => this.onFormSubmitSuccess(data));
        RecipeBook.on('form:submit:error', (data) => this.onFormSubmitError(data));
        
        // Form dirty state tracking
        document.addEventListener('input', (e) => this.trackFormChanges(e));
        document.addEventListener('change', (e) => this.trackFormChanges(e));
        
        // Prevent accidental navigation
        window.addEventListener('beforeunload', (e) => this.handleBeforeUnload(e));
    },

    /**
     * Handle DOM ready event
     */
    onDOMReady() {
        this.initializeForms();
    },

    // ============================================
    // FORM INITIALIZATION
    // ============================================

    /**
     * Initialize all forms on the page
     */
    initializeForms() {
        this.initializeRecipeForm();
        this.initializeIngredientForm();
        this.initializeTagForm();
        this.setupFormValidation();
    },

    /**
     * Initialize recipe form
     */
    initializeRecipeForm() {
        const form = document.querySelector(this.config.recipeFormSelector);
        if (!form) return;

        this.state.activeForm = form;
        
        this.initializeTagToggles();
        this.initializeIngredientRows();
        this.initializeImageUpload();
        this.initializeServingUnitSelect();
        this.bindRecipeFormSubmission(form);
        this.setupIngredientModal();
        this.enhanceFormAccessibility(form);
        
        console.log('🍳 Recipe form initialized');
    },

    /**
     * Initialize ingredient form
     */
    initializeIngredientForm() {
        const form = document.querySelector(this.config.ingredientFormSelector);
        if (!form) return;

        this.bindIngredientFormSubmission(form);
        this.enhanceFormAccessibility(form);
        
        console.log('🥕 Ingredient form initialized');
    },

    /**
     * Initialize tag form
     */
    initializeTagForm() {
        const form = document.querySelector(this.config.tagFormSelector);
        if (!form) return;

        this.initializeColorPicker();
        this.bindTagFormSubmission(form);
        this.enhanceFormAccessibility(form);
        
        console.log('🏷️ Tag form initialized');
    },

    // ============================================
    // TAG MANAGEMENT
    // ============================================

    /**
     * Initialize tag toggles for recipe form
     */
    initializeTagToggles() {
        const tagFilters = document.querySelectorAll('.tag-filter');
        
        tagFilters.forEach(button => {
            const tagId = parseInt(button.dataset.tagId);
            const checkbox = document.getElementById(`tag_${tagId}`);
            
            if (!tagId || !checkbox) return;
            
            // Set initial state based on checkbox (for edit mode)
            if (checkbox.checked) {
                button.classList.add('active');
                this.state.selectedTags.add(tagId);
            }
            
            // Add click handler
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleTag(tagId, button, checkbox);
            });
        });
        
        console.log(`🏷️ Initialized ${tagFilters.length} tag toggles`);
    },

    /**
     * Toggle tag selection
     */
    toggleTag(tagId, button, checkbox) {
        const isSelected = this.state.selectedTags.has(tagId);
        
        if (isSelected) {
            this.state.selectedTags.delete(tagId);
            button.classList.remove('active');
            checkbox.checked = false;
        } else {
            this.state.selectedTags.add(tagId);
            button.classList.add('active');
            checkbox.checked = true;
        }
        
        this.markFormDirty();
        RecipeBook.emit('form:tag:toggle', { tagId, selected: !isSelected });
    },

    /**
     * Get selected tags
     */
    getSelectedTags() {
        return Array.from(this.state.selectedTags);
    },

    /**
     * Set selected tags (for programmatic updates)
     */
    setSelectedTags(tagIds) {
        this.state.selectedTags.clear();
        
        tagIds.forEach(tagId => {
            this.state.selectedTags.add(tagId);
            
            const button = document.querySelector(`.tag-filter[data-tag-id="${tagId}"]`);
            const checkbox = document.getElementById(`tag_${tagId}`);
            
            if (button) button.classList.add('active');
            if (checkbox) checkbox.checked = true;
        });
    },

    // ============================================
    // INGREDIENT MANAGEMENT
    // ============================================

    /**
     * Initialize ingredient rows in recipe form
     */
    initializeIngredientRows() {
        // Bind add ingredient button
        const addButton = document.querySelector(this.config.addIngredientButtonSelector);
        if (addButton) {
            addButton.addEventListener('click', () => this.addIngredientRow());
        }

        // Initialize existing ingredient rows
        this.initializeExistingIngredientRows();
        
        // Ensure at least one row exists
        this.ensureMinimumIngredientRows();
        
        console.log(`🥕 Initialized ingredient management (counter: ${this.state.ingredientCounter})`);
    },

    /**
     * Initialize existing ingredient rows (for edit mode)
     */
    initializeExistingIngredientRows() {
        const existingRows = document.querySelectorAll('.ingredient-row');
        
        existingRows.forEach((row, index) => {
            // Set ingredient selection
            const ingredientId = row.dataset.ingredientId;
            const unit = row.dataset.unit;
            
            if (ingredientId) {
                const select = row.querySelector('.ingredient-select');
                if (select) select.value = ingredientId;
            }
            
            if (unit) {
                const unitSelect = row.querySelector('.unit-select');
                if (unitSelect) unitSelect.value = unit;
            }
            
            // Bind remove button
            this.bindIngredientRowEvents(row);
        });
        
        // Update counter to match existing rows
        this.state.ingredientCounter = Math.max(this.state.ingredientCounter, existingRows.length);
    },

    /**
     * Ensure minimum number of ingredient rows
     */
    ensureMinimumIngredientRows() {
        const container = document.querySelector(this.config.ingredientsContainerSelector);
        if (!container) return;
        
        const existingRows = container.querySelectorAll('.ingredient-row');
        if (existingRows.length === 0) {
            this.addIngredientRow();
        }
    },

    /**
     * Add new ingredient row
     */
    addIngredientRow() {
        const container = document.querySelector(this.config.ingredientsContainerSelector);
        if (!container) {
            console.error('Ingredients container not found');
            return null;
        }

        if (container.children.length >= this.config.maxIngredients) {
            RecipeBook.showNotification(`Maximum ${this.config.maxIngredients} ingredients allowed`, 'warning');
            return null;
        }

        const row = this.createIngredientRow(this.state.ingredientCounter);
        container.appendChild(row);
        
        this.bindIngredientRowEvents(row);
        this.state.ingredientCounter++;
        this.markFormDirty();
        
        // Focus the ingredient select
        const select = row.querySelector('.ingredient-select');
        if (select) select.focus();
        
        RecipeBook.emit('form:ingredient:added', { counter: this.state.ingredientCounter });
        
        return row;
    },

    /**
     * Create ingredient row element
     */
    createIngredientRow(counter) {
        const row = document.createElement('div');
        row.className = 'ingredient-row';
        
        const ingredientOptions = this.generateIngredientOptions();
        const unitOptions = this.generateUnitOptions();
        
        row.innerHTML = `
            <select name="ingredient_${counter}" class="form-control ingredient-select" required>
                <option value="">Select ingredient...</option>
                ${ingredientOptions}
            </select>
            <input type="number" name="quantity_${counter}" class="form-control quantity-input" 
                   placeholder="Quantity" step="0.1" min="0.1" max="1000" required>
            <select name="unit_${counter}" class="form-control unit-select" required>
                <option value="">Unit...</option>
                ${unitOptions}
            </select>
            <button type="button" class="btn btn-danger btn-sm remove-ingredient" 
                    title="Remove ingredient" aria-label="Remove ingredient">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        return row;
    },

    /**
     * Generate ingredient options HTML
     */
    generateIngredientOptions() {
        return this.state.allIngredients
            .map(ingredient => `<option value="${ingredient.id}">${ingredient.name}</option>`)
            .join('');
    },

    /**
     * Generate unit options HTML
     */
    generateUnitOptions() {
        const units = [
            { group: 'Volume', options: [
                { value: 'tsp', label: 'Teaspoon' },
                { value: 'tbsp', label: 'Tablespoon' },
                { value: 'cup', label: 'Cup' },
                { value: 'ml', label: 'Milliliter' },
                { value: 'l', label: 'Liter' },
                { value: 'fl oz', label: 'Fluid Ounce' }
            ]},
            { group: 'Weight', options: [
                { value: 'g', label: 'Gram' },
                { value: 'kg', label: 'Kilogram' },
                { value: 'oz', label: 'Ounce' },
                { value: 'lb', label: 'Pound' }
            ]},
            { group: 'Count', options: [
                { value: 'piece', label: 'Piece' },
                { value: 'clove', label: 'Clove' },
                { value: 'slice', label: 'Slice' },
                { value: 'can', label: 'Can' },
                { value: 'package', label: 'Package' }
            ]},
            { group: 'Other', options: [
                { value: 'pinch', label: 'Pinch' },
                { value: 'dash', label: 'Dash' },
                { value: 'to taste', label: 'To taste' }
            ]}
        ];

        return units.map(group => `
            <optgroup label="${group.group}">
                ${group.options.map(option => 
                    `<option value="${option.value}">${option.label}</option>`
                ).join('')}
            </optgroup>
        `).join('');
    },

    /**
     * Bind events for ingredient row
     */
    bindIngredientRowEvents(row) {
        const removeButton = row.querySelector('.remove-ingredient');
        const ingredientSelect = row.querySelector('.ingredient-select');
        const quantityInput = row.querySelector('.quantity-input');
        
        // Remove button
        if (removeButton) {
            removeButton.addEventListener('click', () => this.removeIngredientRow(row));
        }
        
        // Ingredient selection change
        if (ingredientSelect) {
            ingredientSelect.addEventListener('change', () => {
                this.markFormDirty();
                this.validateIngredientRow(row);
            });
        }
        
        // Quantity input validation
        if (quantityInput) {
            quantityInput.addEventListener('input', () => {
                this.markFormDirty();
                this.validateQuantityInput(quantityInput);
            });
        }
    },

    /**
     * Remove ingredient row
     */
    removeIngredientRow(row) {
        const container = document.querySelector(this.config.ingredientsContainerSelector);
        if (!container) return;
        
        const remainingRows = container.querySelectorAll('.ingredient-row').length;
        
        if (remainingRows <= 1) {
            RecipeBook.showNotification('At least one ingredient is required', 'warning');
            return;
        }
        
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            if (row.parentNode) {
                row.parentNode.removeChild(row);
            }
        }, 300);
        
        this.markFormDirty();
        RecipeBook.emit('form:ingredient:removed');
    },

    /**
     * Validate ingredient row
     */
    validateIngredientRow(row) {
        const select = row.querySelector('.ingredient-select');
        const quantity = row.querySelector('.quantity-input');
        const unit = row.querySelector('.unit-select');
        
        let isValid = true;
        
        // Clear previous errors
        [select, quantity, unit].forEach(field => {
            if (field) field.classList.remove('field-error');
        });
        
        // Validate ingredient selection
        if (!select.value) {
            this.showFieldError(select, 'Please select an ingredient');
            isValid = false;
        }
        
        // Validate quantity
        if (!quantity.value || parseFloat(quantity.value) <= 0) {
            this.showFieldError(quantity, 'Please enter a valid quantity');
            isValid = false;
        }
        
        // Validate unit
        if (!unit.value) {
            this.showFieldError(unit, 'Please select a unit');
            isValid = false;
        }
        
        return isValid;
    },

    /**
     * Validate quantity input
     */
    validateQuantityInput(input) {
        const value = parseFloat(input.value);
        
        if (isNaN(value) || value <= 0) {
            this.showFieldError(input, 'Quantity must be greater than 0');
            return false;
        }
        
        if (value > 1000) {
            this.showFieldError(input, 'Quantity seems too large');
            return false;
        }
        
        this.clearFieldError(input);
        return true;
    },

    // ============================================
    // NEW INGREDIENT MODAL
    // ============================================

    /**
     * Setup ingredient modal for adding new ingredients
     */
    setupIngredientModal() {
        const addNewButton = document.querySelector(this.config.addNewIngredientButtonSelector);
        const modal = document.querySelector(this.config.ingredientModalSelector);
        const form = document.querySelector(this.config.newIngredientFormSelector);
        
        if (!addNewButton || !modal || !form) return;
        
        // Bind add new ingredient button
        addNewButton.addEventListener('click', () => this.openIngredientModal());
        
        // Bind form submission
        form.addEventListener('submit', (e) => this.handleNewIngredientSubmission(e));
        
        console.log('➕ Ingredient modal setup complete');
    },

    /**
     * Open ingredient modal
     */
    openIngredientModal() {
        const modal = document.querySelector(this.config.ingredientModalSelector);
        const nameInput = document.getElementById('new-ingredient-name');
        
        if (modal) {
            RecipeBook.openModal(modal);
            
            // Focus the name input
            setTimeout(() => {
                if (nameInput) nameInput.focus();
            }, 100);
        }
    },

    /**
     * Handle new ingredient form submission
     */
    async handleNewIngredientSubmission(e) {
        e.preventDefault();
        
        const form = e.target;
        const nameInput = form.querySelector('#new-ingredient-name');
        const name = nameInput.value.trim();
        
        if (!name) {
            this.showFieldError(nameInput, 'Ingredient name is required');
            return;
        }
        
        // Check if ingredient already exists
        const existingIngredient = this.state.allIngredients.find(
            ing => ing.name.toLowerCase() === name.toLowerCase()
        );
        
        if (existingIngredient) {
            this.showFieldError(nameInput, 'This ingredient already exists');
            return;
        }
        
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const removeLoading = RecipeBook.addLoadingState(submitBtn, 'Adding...');
        
        try {
            // Create the ingredient via API
            await this.createNewIngredient(name);
            
            // Close modal and reset form
            RecipeBook.closeModal(this.config.ingredientModalSelector);
            form.reset();
            
            RecipeBook.showNotification(`Ingredient "${name}" added successfully!`, 'success');
            
        } catch (error) {
            console.error('Failed to create ingredient:', error);
            RecipeBook.showNotification('Failed to create ingredient. Please try again.', 'error');
        } finally {
            removeLoading();
        }
    },

    /**
     * Create new ingredient via API
     */
    async createNewIngredient(name) {
        const formData = new FormData();
        formData.append('name', name);
        
        const response = await fetch('/api/ingredients', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Add to local array with temporary ID
        const newId = Math.max(...this.state.allIngredients.map(i => i.id), 0) + 1;
        const newIngredient = { id: newId, name };
        this.state.allIngredients.push(newIngredient);
        
        // Update all ingredient selects
        this.updateIngredientSelects();
        
        RecipeBook.emit('form:ingredient:created', { ingredient: newIngredient });
        
        return newIngredient;
    },

    /**
     * Update all ingredient select dropdowns
     */
    updateIngredientSelects() {
        const selects = document.querySelectorAll('.ingredient-select');
        
        selects.forEach(select => {
            const currentValue = select.value;
            const options = this.generateIngredientOptions();
            
            // Update options
            select.innerHTML = `<option value="">Select ingredient...</option>${options}`;
            
            // Restore selection
            if (currentValue) {
                select.value = currentValue;
            }
        });
    },

    // ============================================
    // IMAGE UPLOAD MANAGEMENT
    // ============================================

    /**
     * Initialize image upload functionality
     */
    initializeImageUpload() {
        const fileInput = document.getElementById('recipe_images');
        if (!fileInput) return;
        
        fileInput.addEventListener('change', (e) => this.handleImageSelection(e));
        
        // Initialize existing image delete buttons
        this.initializeExistingImageControls();
        
        console.log('📷 Image upload initialized');
    },

    /**
     * Initialize controls for existing images (edit mode)
     */
    initializeExistingImageControls() {
        document.querySelectorAll('.delete-image').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.deleteExistingImage(button.dataset.imageId, button);
            });
        });
    },

    /**
     * Handle image file selection
     */
    handleImageSelection(e) {
        const files = Array.from(e.target.files);
        
        if (files.length === 0) return;
        
        // Validate file count
        if (files.length > this.config.maxImages) {
            RecipeBook.showNotification(`Maximum ${this.config.maxImages} images allowed`, 'warning');
            return;
        }
        
        // Clear previous previews
        this.clearImagePreviews();
        
        // Process each file
        files.forEach((file, index) => {
            this.processImageFile(file, index);
        });
        
        this.markFormDirty();
    },

    /**
     * Process individual image file
     */
    processImageFile(file, index) {
        // Validate file
        const validation = RecipeBook.validateImageFile(file);
        if (!validation.valid) {
            RecipeBook.showNotification(validation.error, 'error');
            return;
        }
        
        // Create preview
        RecipeBook.createImagePreview(file, (dataUrl, error) => {
            if (error) {
                RecipeBook.showNotification(`Error processing image: ${error}`, 'error');
                return;
            }
            
            this.addImagePreview(dataUrl, file.name, index);
        });
    },

    /**
     * Add image preview to container
     */
    addImagePreview(dataUrl, filename, index) {
        const container = document.querySelector(this.config.imagePreviewContainerSelector);
        if (!container) return;
        
        const previewDiv = document.createElement('div');
        previewDiv.className = 'image-preview-item';
        previewDiv.dataset.index = index;
        
        previewDiv.innerHTML = `
            <img src="${dataUrl}" alt="Preview" class="image-preview">
            <input type="text" name="image_captions" placeholder="Caption for this image" 
                   class="form-control image-caption-input">
            <button type="button" class="btn btn-danger btn-sm remove-preview" 
                    title="Remove image" aria-label="Remove image">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Bind remove button
        const removeBtn = previewDiv.querySelector('.remove-preview');
        removeBtn.addEventListener('click', () => this.removeImagePreview(previewDiv, index));
        
        container.appendChild(previewDiv);
        
        // Track uploaded image
        this.state.uploadedImages.push({
            index,
            filename,
            dataUrl,
            element: previewDiv
        });
    },

    /**
     * Remove image preview
     */
    removeImagePreview(previewDiv, index) {
        previewDiv.style.opacity = '0';
        previewDiv.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            if (previewDiv.parentNode) {
                previewDiv.parentNode.removeChild(previewDiv);
            }
        }, 300);
        
        // Remove from state
        this.state.uploadedImages = this.state.uploadedImages.filter(img => img.index !== index);
        
        // Reset file input to update file list
        this.resetFileInput();
        this.markFormDirty();
    },

    /**
     * Clear all image previews
     */
    clearImagePreviews() {
        const container = document.querySelector(this.config.imagePreviewContainerSelector);
        if (container) {
            container.innerHTML = '';
        }
        
        this.state.uploadedImages = [];
    },

    /**
     * Reset file input
     */
    resetFileInput() {
        const fileInput = document.getElementById('recipe_images');
        if (fileInput) {
            fileInput.value = '';
        }
    },

    /**
     * Delete existing image
     */
    async deleteExistingImage(imageId, button) {
        if (!confirm('Are you sure you want to delete this image?')) return;
        
        const removeLoading = RecipeBook.addLoadingState(button, 'Deleting...');
        
        try {
            await RecipeBook.apiRequest(`/api/images/${imageId}`, {
                method: 'DELETE'
            });
            
            // Remove image item from DOM
            const imageItem = button.closest('.image-item');
            if (imageItem) {
                RecipeBook.hideElement(imageItem);
            }
            
            RecipeBook.showNotification('Image deleted successfully', 'success');
            this.markFormDirty();
            
        } catch (error) {
            console.error('Failed to delete image:', error);
            RecipeBook.showNotification('Failed to delete image', 'error');
        } finally {
            removeLoading();
        }
    },

    // ============================================
    // SERVING UNIT SELECT
    // ============================================

    /**
     * Initialize serving unit select dropdown
     */
    initializeServingUnitSelect() {
        const select = document.getElementById('serving_unit');
        if (!select) return;
        
        // Set value from data attribute (for edit mode)
        const dataValue = select.dataset.value;
        if (dataValue) {
            select.value = dataValue;
        }
        
        // Add change handler
        select.addEventListener('change', () => this.markFormDirty());
    },

    // ============================================
    // COLOR PICKER (Tag Form)
    // ============================================

    /**
     * Initialize color picker for tag form
     */
    initializeColorPicker() {
        const colorInput = document.getElementById('color');
        const colorTextInput = document.getElementById('color-text');
        const tagPreview = document.getElementById('tag-preview');
        const nameInput = document.getElementById('name');
        
        if (!colorInput || !tagPreview || !nameInput) return;
        
        const updatePreview = () => {
            const color = colorInput.value;
            const name = nameInput.value || 'Sample Tag';
            
            tagPreview.style.backgroundColor = color;
            tagPreview.textContent = name;
            
            if (colorTextInput) {
                colorTextInput.value = color;
            }
            
            // Calculate contrasting text color
            const textColor = this.getContrastingTextColor(color);
            tagPreview.style.color = textColor;
        };
        
        // Bind events
        colorInput.addEventListener('input', updatePreview);
        nameInput.addEventListener('input', updatePreview);
        
        if (colorTextInput) {
            colorTextInput.addEventListener('input', function() {
                const value = this.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    colorInput.value = value;
                    updatePreview();
                }
            });
        }
        
        // Initial preview update
        updatePreview();
        
        console.log('🎨 Color picker initialized');
    },

    /**
     * Get contrasting text color for background
     */
    getContrastingTextColor(hexColor) {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Calculate brightness using YIQ formula
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        
        return brightness > 155 ? '#333333' : '#ffffff';
    },

    // ============================================
    // FORM VALIDATION
    // ============================================

    /**
     * Setup form validation
     */
    setupFormValidation() {
        // Recipe form validation
        const recipeForm = document.querySelector(this.config.recipeFormSelector);
        if (recipeForm) {
            this.setupRecipeFormValidation(recipeForm);
        }
        
        // Ingredient form validation  
        const ingredientForm = document.querySelector(this.config.ingredientFormSelector);
        if (ingredientForm) {
            this.setupIngredientFormValidation(ingredientForm);
        }
        
        // Tag form validation
        const tagForm = document.querySelector(this.config.tagFormSelector);
        if (tagForm) {
            this.setupTagFormValidation(tagForm);
        }
    },

    /**
     * Setup recipe form validation
     */
    setupRecipeFormValidation(form) {
        const rules = {
            title: {
                required: true,
                minLength: 3,
                maxLength: 200,
                label: 'Recipe title'
            },
            instructions: {
                required: true,
                minLength: 10,
                label: 'Cooking instructions'
            },
            prep_time: {
                custom: (value) => !value || (parseInt(value) >= 0 && parseInt(value) <= 1440),
                customMessage: 'Prep time must be between 0 and 1440 minutes (24 hours)'
            },
            cook_time: {
                custom: (value) => !value || (parseInt(value) >= 0 && parseInt(value) <= 1440),
                customMessage: 'Cook time must be between 0 and 1440 minutes (24 hours)'
            },
            servings: {
                custom: (value) => !value || (parseInt(value) >= 1 && parseInt(value) <= 50),
                customMessage: 'Servings must be between 1 and 50'
            }
        };
        
        this.state.formValidationRules.set(form, rules);
    },

    /**
     * Setup ingredient form validation
     */
    setupIngredientFormValidation(form) {
        const rules = {
            name: {
                required: true,
                minLength: 2,
                maxLength: 100,
                label: 'Ingredient name',
                custom: (value) => {
                    // Check for duplicate ingredient names
                    const exists = this.state.allIngredients.some(
                        ing => ing.name.toLowerCase() === value.toLowerCase()
                    );
                    return !exists;
                },
                customMessage: 'This ingredient already exists'
            }
        };
        
        this.state.formValidationRules.set(form, rules);
    },

    /**
     * Setup tag form validation
     */
    setupTagFormValidation(form) {
        const rules = {
            name: {
                required: true,
                minLength: 2,
                maxLength: 50,
                label: 'Tag name'
            },
            color: {
                required: true,
                pattern: /^#[0-9A-Fa-f]{6}$/,
                patternMessage: 'Please enter a valid hex color code',
                label: 'Tag color'
            }
        };
        
        this.state.formValidationRules.set(form, rules);
    },

    /**
     * Validate recipe form
     */
    validateRecipeForm(form) {
        const rules = this.state.formValidationRules.get(form);
        if (!rules) return true;

        let isValid = RecipeBook.validateForm(form, rules);
        
        // Additional recipe-specific validation
        if (isValid) {
            isValid = this.validateIngredients() && isValid;
        }
        
        return isValid;
    },

    /**
     * Validate all ingredients
     */
    validateIngredients() {
        const ingredientRows = document.querySelectorAll('.ingredient-row');
        let hasValidIngredient = false;
        let allRowsValid = true;
        
        ingredientRows.forEach(row => {
            const rowValid = this.validateIngredientRow(row);
            allRowsValid = allRowsValid && rowValid;
            
            if (rowValid) {
                const select = row.querySelector('.ingredient-select');
                const quantity = row.querySelector('.quantity-input');
                
                if (select.value && quantity.value && quantity.value > 0) {
                    hasValidIngredient = true;
                }
            }
        });
        
        if (!hasValidIngredient) {
            RecipeBook.showNotification('Please add at least one ingredient with a valid quantity', 'error');
            return false;
        }
        
        if (!allRowsValid) {
            RecipeBook.showNotification('Please fix ingredient errors before submitting', 'error');
            return false;
        }
        
        return true;
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
    // FORM SUBMISSION
    // ============================================

    /**
     * Bind recipe form submission
     */
    bindRecipeFormSubmission(form) {
        form.addEventListener('submit', (e) => {
            if (!this.validateRecipeForm(form)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // Show loading state on submit button
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                RecipeBook.addLoadingState(submitBtn, 'Saving...');
            }
            
            this.markFormClean();
        });
    },

    /**
     * Bind ingredient form submission
     */
    bindIngredientFormSubmission(form) {
        form.addEventListener('submit', (e) => {
            const rules = this.state.formValidationRules.get(form);
            if (rules && !RecipeBook.validateForm(form, rules)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // Show loading state
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                RecipeBook.addLoadingState(submitBtn, 'Saving...');
            }
            
            this.markFormClean();
        });
    },

    /**
     * Bind tag form submission
     */
    bindTagFormSubmission(form) {
        form.addEventListener('submit', (e) => {
            const rules = this.state.formValidationRules.get(form);
            if (rules && !RecipeBook.validateForm(form, rules)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // Show loading state
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                RecipeBook.addLoadingState(submitBtn, 'Saving...');
            }
            
            this.markFormClean();
        });
    },

    /**
     * Handle successful form submission
     */
    onFormSubmitSuccess(data) {
        const { form, response } = data;
        
        if (form.classList.contains('recipe-form')) {
            RecipeBook.showNotification('Recipe saved successfully!', 'success');
        } else if (form.classList.contains('ingredient-form')) {
            RecipeBook.showNotification('Ingredient saved successfully!', 'success');
        } else if (form.classList.contains('tag-form')) {
            RecipeBook.showNotification('Tag saved successfully!', 'success');
        }
        
        this.markFormClean();
    },

    /**
     * Handle form submission error
     */
    onFormSubmitError(data) {
        const { form, error } = data;
        
        RecipeBook.showNotification('Failed to save. Please try again.', 'error');
        console.error('Form submission error:', error);
    },

    // ============================================
    // FORM STATE MANAGEMENT
    // ============================================

    /**
     * Track form changes for dirty state
     */
    trackFormChanges(e) {
        if (e.target.closest('form')) {
            this.markFormDirty();
        }
    },

    /**
     * Mark form as dirty (has unsaved changes)
     */
    markFormDirty() {
        this.state.isDirty = true;
        RecipeBook.emit('form:dirty', { isDirty: true });
    },

    /**
     * Mark form as clean (no unsaved changes)
     */
    markFormClean() {
        this.state.isDirty = false;
        RecipeBook.emit('form:clean', { isDirty: false });
    },

    /**
     * Check if form has unsaved changes
     */
    isFormDirty() {
        return this.state.isDirty;
    },

    /**
     * Handle before unload (prevent accidental navigation)
     */
    handleBeforeUnload(e) {
        if (this.state.isDirty) {
            const message = 'You have unsaved changes. Are you sure you want to leave?';
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    },

    // ============================================
    // FORM AUTO-SAVE (Optional Feature)
    // ============================================

    /**
     * Enable auto-save for forms
     */
    enableAutoSave(form, interval = 30000) {
        const formId = form.id || 'form_' + Date.now();
        
        const autoSave = () => {
            if (this.state.isDirty) {
                this.saveFormDraft(formId);
            }
        };
        
        const intervalId = setInterval(autoSave, interval);
        
        // Store interval ID for cleanup
        form.dataset.autoSaveInterval = intervalId;
        
        // Load existing draft
        this.loadFormDraft(formId);
        
        console.log(`💾 Auto-save enabled for form (${interval/1000}s interval)`);
    },

    /**
     * Disable auto-save for form
     */
    disableAutoSave(form) {
        const intervalId = form.dataset.autoSaveInterval;
        if (intervalId) {
            clearInterval(intervalId);
            delete form.dataset.autoSaveInterval;
        }
    },

    /**
     * Save form draft to localStorage
     */
    saveFormDraft(formId) {
        try {
            const form = this.state.activeForm;
            if (!form) return;
            
            const formData = new FormData(form);
            const draftData = {};
            
            for (const [key, value] of formData.entries()) {
                if (draftData[key]) {
                    // Handle multiple values (like checkboxes)
                    if (Array.isArray(draftData[key])) {
                        draftData[key].push(value);
                    } else {
                        draftData[key] = [draftData[key], value];
                    }
                } else {
                    draftData[key] = value;
                }
            }
            
            // Add selected tags
            draftData.selectedTags = this.getSelectedTags();
            
            // Add uploaded images info (not the actual files)
            draftData.uploadedImagesInfo = this.state.uploadedImages.map(img => ({
                filename: img.filename,
                index: img.index
            }));
            
            RecipeBook.setStorage(`form_draft_${formId}`, {
                data: draftData,
                timestamp: Date.now(),
                formType: form.className
            });
            
            console.log('📝 Form draft saved');
            RecipeBook.emit('form:draft:saved', { formId, timestamp: Date.now() });
        } catch (error) {
            console.warn('Failed to save form draft:', error);
        }
    },

    /**
     * Load form draft from localStorage
     */
    loadFormDraft(formId) {
        try {
            const draft = RecipeBook.getStorage(`form_draft_${formId}`);
            if (!draft) return;
            
            // Check if draft is not too old (24 hours)
            const maxAge = 24 * 60 * 60 * 1000;
            if (Date.now() - draft.timestamp > maxAge) {
                RecipeBook.removeStorage(`form_draft_${formId}`);
                return;
            }
            
            // Ask user if they want to restore draft
            if (confirm('A saved draft was found. Would you like to restore it?')) {
                this.restoreFormDraft(draft.data);
                this.clearFormDraft(formId);
            }
        } catch (error) {
            console.warn('Failed to load form draft:', error);
        }
    },

    /**
     * Restore form draft data
     */
    restoreFormDraft(draftData) {
        try {
            const form = this.state.activeForm;
            if (!form) return;
            
            // Restore form fields
            Object.entries(draftData).forEach(([key, value]) => {
                if (['selectedTags', 'uploadedImagesInfo'].includes(key)) return; // Handle separately
                
                const field = form.querySelector(`[name="${key}"]`);
                if (field) {
                    if (field.type === 'checkbox' || field.type === 'radio') {
                        if (Array.isArray(value)) {
                            field.checked = value.includes(field.value);
                        } else {
                            field.checked = field.value === value;
                        }
                    } else {
                        field.value = Array.isArray(value) ? value[0] : value;
                    }
                }
            });
            
            // Restore selected tags
            if (draftData.selectedTags) {
                this.setSelectedTags(draftData.selectedTags);
            }
            
            RecipeBook.showNotification('Draft restored successfully', 'success');
            this.markFormDirty();
            
            RecipeBook.emit('form:draft:restored', { draftData });
        } catch (error) {
            console.warn('Failed to restore form draft:', error);
            RecipeBook.showNotification('Failed to restore draft', 'error');
        }
    },

    /**
     * Clear form draft
     */
    clearFormDraft(formId) {
        RecipeBook.removeStorage(`form_draft_${formId}`);
        RecipeBook.emit('form:draft:cleared', { formId });
    },

    /**
     * Get all form drafts
     */
    getAllFormDrafts() {
        const drafts = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('recipe-book-form_draft_')) {
                    const draft = RecipeBook.getStorage(key.replace('recipe-book-', ''));
                    if (draft) {
                        drafts.push({
                            id: key.replace('recipe-book-form_draft_', ''),
                            ...draft
                        });
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to get form drafts:', error);
        }
        return drafts;
    },

    // ============================================
    // ACCESSIBILITY HELPERS
    // ============================================

    /**
     * Improve form accessibility
     */
    enhanceFormAccessibility(form) {
        // Add ARIA labels to required fields
        form.querySelectorAll('input[required], textarea[required], select[required]').forEach(field => {
            if (!field.getAttribute('aria-label') && !field.getAttribute('aria-labelledby')) {
                const label = form.querySelector(`label[for="${field.id}"]`);
                if (label) {
                    field.setAttribute('aria-labelledby', label.id || 'label_' + field.id);
                    if (!label.id) {
                        label.id = 'label_' + field.id;
                    }
                }
            }
        });
        
        // Add ARIA describedby for error messages
        form.querySelectorAll('.field-error-message').forEach(errorMsg => {
            const field = errorMsg.parentNode.querySelector('input, textarea, select');
            if (field) {
                errorMsg.id = errorMsg.id || 'error_' + field.id;
                field.setAttribute('aria-describedby', errorMsg.id);
            }
        });
        
        // Add form section landmarks
        form.querySelectorAll('.form-section').forEach((section, index) => {
            const heading = section.querySelector('h3');
            if (heading && !section.getAttribute('aria-labelledby')) {
                heading.id = heading.id || `section_heading_${index}`;
                section.setAttribute('role', 'group');
                section.setAttribute('aria-labelledby', heading.id);
            }
        });
        
        // Add fieldset and legend for ingredient rows
        const ingredientsContainer = form.querySelector(this.config.ingredientsContainerSelector);
        if (ingredientsContainer && !ingredientsContainer.closest('fieldset')) {
            const fieldset = document.createElement('fieldset');
            const legend = document.createElement('legend');
            legend.textContent = 'Recipe Ingredients';
            legend.className = 'sr-only'; // Screen reader only
            
            ingredientsContainer.parentNode.insertBefore(fieldset, ingredientsContainer);
            fieldset.appendChild(legend);
            fieldset.appendChild(ingredientsContainer);
        }
        
        // Announce form changes to screen readers
        this.setupFormAnnouncements(form);
    },

    /**
     * Setup form announcements for screen readers
     */
    setupFormAnnouncements(form) {
        // Create announcement region
        let announcements = document.getElementById('form-announcements');
        if (!announcements) {
            announcements = document.createElement('div');
            announcements.id = 'form-announcements';
            announcements.setAttribute('aria-live', 'polite');
            announcements.setAttribute('aria-atomic', 'true');
            announcements.className = 'sr-only';
            document.body.appendChild(announcements);
        }
        
        // Listen for ingredient additions/removals
        RecipeBook.on('form:ingredient:added', () => {
            announcements.textContent = 'Ingredient row added';
        });
        
        RecipeBook.on('form:ingredient:removed', () => {
            announcements.textContent = 'Ingredient row removed';
        });
        
        // Listen for tag selections
        RecipeBook.on('form:tag:toggle', (data) => {
            const action = data.selected ? 'selected' : 'deselected';
            announcements.textContent = `Tag ${action}`;
        });
    },

    // ============================================
    // FORM TEMPLATES & PRESETS
    // ============================================

    /**
     * Apply recipe template
     */
    applyRecipeTemplate(templateData) {
        const form = this.state.activeForm;
        if (!form || !templateData) return;
        
        try {
            // Apply basic fields
            if (templateData.title) {
                const titleField = form.querySelector('#title');
                if (titleField) titleField.value = templateData.title;
            }
            
            if (templateData.description) {
                const descField = form.querySelector('#description');
                if (descField) descField.value = templateData.description;
            }
            
            if (templateData.instructions) {
                const instrField = form.querySelector('#instructions');
                if (instrField) instrField.value = templateData.instructions;
            }
            
            // Apply time and serving data
            ['prep_time', 'cook_time', 'servings'].forEach(field => {
                if (templateData[field]) {
                    const fieldElement = form.querySelector(`#${field}`);
                    if (fieldElement) fieldElement.value = templateData[field];
                }
            });
            
            // Apply serving unit
            if (templateData.serving_unit) {
                const servingUnitField = form.querySelector('#serving_unit');
                if (servingUnitField) servingUnitField.value = templateData.serving_unit;
            }
            
            // Apply ingredients
            if (templateData.ingredients && Array.isArray(templateData.ingredients)) {
                this.applyIngredientTemplate(templateData.ingredients);
            }
            
            // Apply tags
            if (templateData.tags && Array.isArray(templateData.tags)) {
                this.setSelectedTags(templateData.tags);
            }
            
            this.markFormDirty();
            RecipeBook.showNotification('Template applied successfully', 'success');
            RecipeBook.emit('form:template:applied', { templateData });
            
        } catch (error) {
            console.error('Failed to apply recipe template:', error);
            RecipeBook.showNotification('Failed to apply template', 'error');
        }
    },

    /**
     * Apply ingredient template
     */
    applyIngredientTemplate(ingredients) {
        // Clear existing ingredients
        const container = document.querySelector(this.config.ingredientsContainerSelector);
        if (container) {
            container.innerHTML = '';
        }
        
        // Reset counter
        this.state.ingredientCounter = 0;
        
        // Add ingredients from template
        ingredients.forEach((ingredient, index) => {
            const row = this.addIngredientRow();
            if (row) {
                const select = row.querySelector('.ingredient-select');
                const quantity = row.querySelector('.quantity-input');
                const unit = row.querySelector('.unit-select');
                
                if (ingredient.ingredientId && select) {
                    select.value = ingredient.ingredientId;
                }
                if (ingredient.quantity && quantity) {
                    quantity.value = ingredient.quantity;
                }
                if (ingredient.unit && unit) {
                    unit.value = ingredient.unit;
                }
            }
        });
    },

    /**
     * Create recipe template from current form
     */
    createTemplateFromForm() {
        const form = this.state.activeForm;
        if (!form) return null;
        
        try {
            const template = {
                title: form.querySelector('#title')?.value || '',
                description: form.querySelector('#description')?.value || '',
                instructions: form.querySelector('#instructions')?.value || '',
                prep_time: parseInt(form.querySelector('#prep_time')?.value) || 0,
                cook_time: parseInt(form.querySelector('#cook_time')?.value) || 0,
                servings: parseInt(form.querySelector('#servings')?.value) || 1,
                serving_unit: form.querySelector('#serving_unit')?.value || 'people',
                ingredients: [],
                tags: this.getSelectedTags(),
                created: Date.now()
            };
            
            // Extract ingredients
            const ingredientRows = form.querySelectorAll('.ingredient-row');
            ingredientRows.forEach(row => {
                const select = row.querySelector('.ingredient-select');
                const quantity = row.querySelector('.quantity-input');
                const unit = row.querySelector('.unit-select');
                
                if (select?.value && quantity?.value && unit?.value) {
                    template.ingredients.push({
                        ingredientId: parseInt(select.value),
                        quantity: parseFloat(quantity.value),
                        unit: unit.value
                    });
                }
            });
            
            return template;
        } catch (error) {
            console.error('Failed to create template from form:', error);
            return null;
        }
    },

    /**
     * Save template to localStorage
     */
    saveTemplate(name, templateData) {
        try {
            const templates = this.getSavedTemplates();
            templates[name] = {
                ...templateData,
                name,
                saved: Date.now()
            };
            
            RecipeBook.setStorage('recipe_templates', templates);
            RecipeBook.showNotification(`Template "${name}" saved`, 'success');
            RecipeBook.emit('form:template:saved', { name, templateData });
            
            return true;
        } catch (error) {
            console.error('Failed to save template:', error);
            RecipeBook.showNotification('Failed to save template', 'error');
            return false;
        }
    },

    /**
     * Get saved templates
     */
    getSavedTemplates() {
        return RecipeBook.getStorage('recipe_templates', {});
    },

    /**
     * Delete saved template
     */
    deleteTemplate(name) {
        try {
            const templates = this.getSavedTemplates();
            delete templates[name];
            
            RecipeBook.setStorage('recipe_templates', templates);
            RecipeBook.showNotification(`Template "${name}" deleted`, 'success');
            RecipeBook.emit('form:template:deleted', { name });
            
            return true;
        } catch (error) {
            console.error('Failed to delete template:', error);
            RecipeBook.showNotification('Failed to delete template', 'error');
            return false;
        }
    },

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Get form data as object
     */
    getFormData(form) {
        const formData = new FormData(form);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            if (data[key]) {
                // Handle multiple values (like checkboxes)
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        return data;
    },

    /**
     * Reset form to initial state
     */
    resetForm(form) {
        if (!form) return;
        
        form.reset();
        
        // Clear error messages
        form.querySelectorAll('.field-error-message').forEach(error => {
            error.style.display = 'none';
        });
        
        // Remove error classes
        form.querySelectorAll('.field-error').forEach(field => {
            field.classList.remove('field-error');
        });
        
        // Reset custom states
        this.state.selectedTags.clear();
        this.state.uploadedImages = [];
        this.clearImagePreviews();
        
        // Update tag buttons
        form.querySelectorAll('.tag-filter.active').forEach(button => {
            button.classList.remove('active');
        });
        
        // Reset ingredient counter
        this.state.ingredientCounter = 0;
        
        this.markFormClean();
        RecipeBook.emit('form:reset', { form });
        
        console.log('🔄 Form reset to initial state');
    },

    /**
     * Get validation summary
     */
    getValidationSummary(form) {
        const errors = [];
        const rules = this.state.formValidationRules.get(form);
        
        if (rules) {
            Object.entries(rules).forEach(([fieldName, rule]) => {
                const field = form.querySelector(`[name="${fieldName}"]`);
                if (field && !RecipeBook.validateField(field, rule)) {
                    errors.push({
                        field: fieldName,
                        message: rule.message || `${rule.label || fieldName} is invalid`
                    });
                }
            });
        }
        
        return errors;
    },

    /**
     * Focus first error field
     */
    focusFirstError(form) {
        const firstErrorField = form.querySelector('.field-error');
        if (firstErrorField) {
            firstErrorField.focus();
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    /**
     * Count form fields
     */
    getFormStats(form) {
        if (!form) return null;
        
        return {
            totalFields: form.querySelectorAll('input, textarea, select').length,
            requiredFields: form.querySelectorAll('[required]').length,
            filledFields: Array.from(form.querySelectorAll('input, textarea, select')).filter(field => 
                field.value && field.value.trim() !== ''
            ).length,
            errorFields: form.querySelectorAll('.field-error').length,
            ingredients: form.querySelectorAll('.ingredient-row').length,
            selectedTags: this.state.selectedTags.size,
            uploadedImages: this.state.uploadedImages.length
        };
    },

    /**
     * Reset module state
     */
    reset() {
        this.state.ingredientCounter = 0;
        this.state.selectedTags.clear();
        this.state.uploadedImages = [];
        this.state.isDirty = false;
        this.state.activeForm = null;
        this.state.formValidationRules.clear();
        
        // Clear any auto-save intervals
        document.querySelectorAll('form[data-auto-save-interval]').forEach(form => {
            this.disableAutoSave(form);
        });
        
        RecipeBook.emit('form:manager:reset');
        console.log('🔄 Form Manager reset');
    },

    /**
     * Get module debug information
     */
    getDebugInfo() {
        return {
            state: {
                ...this.state,
                selectedTags: Array.from(this.state.selectedTags),
                formValidationRules: this.state.formValidationRules.size
            },
            config: { ...this.config },
            ingredientsCount: this.state.allIngredients.length,
            isDirty: this.state.isDirty,
            formStats: this.state.activeForm ? this.getFormStats(this.state.activeForm) : null,
            savedTemplates: Object.keys(this.getSavedTemplates()).length,
            savedDrafts: this.getAllFormDrafts().length
        };
    }
};

// ============================================
// BACKWARD COMPATIBILITY & GLOBAL FUNCTIONS
// ============================================

/**
 * Global functions for backward compatibility
 * These maintain compatibility with existing templates
 */

// Tag management
function toggleTag(tagId) {
    const button = document.querySelector(`.tag-filter[data-tag-id="${tagId}"]`);
    const checkbox = document.getElementById(`tag_${tagId}`);
    if (button && checkbox) {
        FormManager.toggleTag(tagId, button, checkbox);
    }
}

// Ingredient management
function addIngredientRow() {
    return FormManager.addIngredientRow();
}

function removeIngredientRow(button) {
    const row = button.closest('.ingredient-row');
    if (row) {
        FormManager.removeIngredientRow(row);
    }
}

// Modal management
function openIngredientModal() {
    FormManager.openIngredientModal();
}

function closeIngredientModal() {
    RecipeBook.closeModal(FormManager.config.ingredientModalSelector);
}

// Image management
function removeImagePreview(button) {
    const previewItem = button.closest('.image-preview-item');
    const index = parseInt(previewItem.dataset.index);
    if (previewItem && !isNaN(index)) {
        FormManager.removeImagePreview(previewItem, index);
    }
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

// Initialize when core app is ready
RecipeBook.on('app:initialized', () => {
    FormManager.init();
});

// Initialize immediately if core is already ready
if (RecipeBook.state && RecipeBook.state.isInitialized) {
    FormManager.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormManager;
} else if (typeof window !== 'undefined') {
    window.FormManager = FormManager;
}