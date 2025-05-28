// static/js/form-manager.js - Form Management Module with JSON API Support

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
     * Create new ingredient via API (JSON)
     */
    async createNewIngredient(name) {
        const response = await fetch('/api/ingredients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
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
    // FORM SUBMISSION (JSON API)
    // ============================================

    /**
     * Bind recipe form submission (JSON)
     */
    bindRecipeFormSubmission(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!this.validateRecipeForm(form)) {
                return;
            }
            
            // Show loading state on submit button
            const submitBtn = form.querySelector('button[type="submit"]');
            const removeLoading = submitBtn ? RecipeBook.addLoadingState(submitBtn, 'Saving...') : null;
            
            try {
                const recipeData = this.collectRecipeFormData(form);
                const isEdit = window.isEditMode;
                const url = isEdit ? `/recipe/${window.recipeId}/edit` : '/api/recipes';
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(recipeData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    RecipeBook.showNotification(data.message, 'success');
                    this.markFormClean();
                    
                    // Redirect after success
                    setTimeout(() => {
                        window.location.href = data.redirect;
                    }, 1000);
                } else {
                    RecipeBook.showNotification(data.error || 'Failed to save recipe', 'error');
                }
            } catch (error) {
                console.error('Recipe save error:', error);
                RecipeBook.showNotification('Failed to save recipe. Please try again.', 'error');
            } finally {
                if (removeLoading) removeLoading();
            }
        });
    },

    /**
     * Collect recipe form data as JSON
     */
    collectRecipeFormData(form) {
        const formData = new FormData(form);
        
        // Basic fields
        const recipeData = {
            title: formData.get('title')?.trim() || '',
            description: formData.get('description')?.trim() || '',
            instructions: formData.get('instructions')?.trim() || '',
            prep_time: parseInt(formData.get('prep_time')) || 0,
            cook_time: parseInt(formData.get('cook_time')) || 0,
            servings: parseInt(formData.get('servings')) || 1,
            serving_unit: formData.get('serving_unit')?.trim() || 'people',
            ingredients: [],
            tags: []
        };
        
        // Collect ingredients
        const ingredientRows = form.querySelectorAll('.ingredient-row');
        ingredientRows.forEach(row => {
            const ingredientSelect = row.querySelector('.ingredient-select');
            const quantityInput = row.querySelector('.quantity-input');
            const unitSelect = row.querySelector('.unit-select');
            
            if (ingredientSelect?.value && quantityInput?.value && unitSelect?.value) {
                recipeData.ingredients.push({
                    ingredient_id: parseInt(ingredientSelect.value),
                    quantity: parseFloat(quantityInput.value),
                    unit: unitSelect.value.trim()
                });
            }
        });
        
        // Collect selected tags
        recipeData.tags = this.getSelectedTags();
        
        return recipeData;
    },

    /**
     * Bind ingredient form submission (JSON)
     */
    bindIngredientFormSubmission(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const rules = this.state.formValidationRules.get(form);
            if (rules && !this.validateForm(form, rules)) {
                return;
            }
            
            // Show loading state
            const submitBtn = form.querySelector('button[type="submit"]');
            const removeLoading = submitBtn ? RecipeBook.addLoadingState(submitBtn, 'Saving...') : null;
            
            try {
                const ingredientData = {
                    name: form.querySelector('#name')?.value?.trim() || ''
                };
                
                const response = await fetch('/api/ingredients', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ingredientData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    RecipeBook.showNotification(data.message, 'success');
                    this.markFormClean();
                    
                    // Redirect after success
                    setTimeout(() => {
                        window.location.href = data.redirect || '/ingredients';
                    }, 1000);
                } else {
                    RecipeBook.showNotification(data.error || 'Failed to save ingredient', 'error');
                }
            } catch (error) {
                console.error('Ingredient save error:', error);
                RecipeBook.showNotification('Failed to save ingredient. Please try again.', 'error');
            } finally {
                if (removeLoading) removeLoading();
            }
        });
    },

    /**
     * Bind tag form submission (JSON)
     */
    bindTagFormSubmission(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const rules = this.state.formValidationRules.get(form);
            if (rules && !this.validateForm(form, rules)) {
                return;
            }
            
            // Show loading state
            const submitBtn = form.querySelector('button[type="submit"]');
            const removeLoading = submitBtn ? RecipeBook.addLoadingState(submitBtn, 'Saving...') : null;
            
            try {
                const tagData = {
                    name: form.querySelector('#name')?.value?.trim() || '',
                    color: form.querySelector('#color')?.value || '#ff6b6b'
                };
                
                const response = await fetch('/api/tags', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(tagData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    RecipeBook.showNotification(data.message, 'success');
                    this.markFormClean();
                    
                    // Redirect after success
                    setTimeout(() => {
                        window.location.href = data.redirect || '/tags';
                    }, 1000);
                } else {
                    RecipeBook.showNotification(data.error || 'Failed to save tag', 'error');
                }
            } catch (error) {
                console.error('Tag save error:', error);
                RecipeBook.showNotification('Failed to save tag. Please try again.', 'error');
            } finally {
                if (removeLoading) removeLoading();
            }
        });
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

        let isValid = this.validateBasicFields(form, rules);
        
        // Additional recipe-specific validation
        if (isValid) {
            isValid = this.validateIngredients() && isValid;
        }
        
        return isValid;
    },

    /**
     * Validate basic form fields
     */
    validateBasicFields(form, rules) {
        let isValid = true;
        
        Object.entries(rules).forEach(([fieldName, rule]) => {
            const field = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
            if (field && !this.validateField(field, rule)) {
                isValid = false;
            }
        });
        
        return isValid;
    },

    /**
     * Validate individual field
     */
    validateField(field, rule) {
        const value = field.value?.trim() || '';
        
        // Clear previous error
        this.clearFieldError(field);
        
        // Required validation
        if (rule.required && !value) {
            this.showFieldError(field, `${rule.label || field.name} is required`);
            return false;
        }
        
        // Skip other validations if field is empty and not required
        if (!value) return true;
        
        // Min length validation
        if (rule.minLength && value.length < rule.minLength) {
            this.showFieldError(field, `${rule.label || field.name} must be at least ${rule.minLength} characters`);
            return false;
        }
        
        // Max length validation
        if (rule.maxLength && value.length > rule.maxLength) {
            this.showFieldError(field, `${rule.label || field.name} must be no more than ${rule.maxLength} characters`);
            return false;
        }
        
        // Pattern validation
        if (rule.pattern && !rule.pattern.test(value)) {
            this.showFieldError(field, rule.patternMessage || `${rule.label || field.name} format is invalid`);
            return false;
        }
        
        // Custom validation
        if (rule.custom && !rule.custom(value)) {
            this.showFieldError(field, rule.customMessage || `${rule.label || field.name} is invalid`);
            return false;
        }
        
        return true;
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
    // IMAGE UPLOAD (Placeholder for future implementation)
    // ============================================

    /**
     * Initialize image upload functionality
     */
    initializeImageUpload() {
        const fileInput = document.getElementById('recipe_images');
        if (!fileInput) return;
        
        // For now, we'll keep the existing image upload logic
        // This would need to be updated for JSON API integration
        console.log('📷 Image upload placeholder initialized');
    },

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
    // EVENT HANDLERS
    // ============================================

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
    },

    // ============================================
    // UTILITY METHODS
    // ============================================

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
        
        RecipeBook.emit('form:manager:reset');
        console.log('🔄 Form Manager reset');
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