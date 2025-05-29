/**
 * app.js - Recipe-specific functions that extend RecipeBook core
 * This file contains only recipe-specific functionality not in core.js
 */

// ============================================
// RECIPE-SPECIFIC DELETE FUNCTIONS
// ============================================

/**
 * Delete recipe with enhanced error handling
 */
async function deleteRecipe(id) {
    if (!confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
        return false;
    }

    const deleteButton = document.querySelector(`[onclick*="deleteRecipe(${id})"], [data-recipe-id="${id}"] .delete-btn`);
    const removeLoading = deleteButton ? RecipeBook.addLoadingState(deleteButton, 'Deleting...') : null;

    try {
        const response = await RecipeBook.apiRequest(`/api/recipes/${id}`, {
            method: 'DELETE'
        });

        if (response.success) {
            RecipeBook.showNotification(response.message, 'success');
            
            if (window.location.pathname.includes('/recipe/')) {
                setTimeout(() => window.location.href = '/recipes', 1000);
            } else {
                const recipeCard = document.querySelector(`[data-recipe-id="${id}"], .recipe-card:has([onclick*="deleteRecipe(${id})"])`);
                if (recipeCard) {
                    RecipeBook.hideElement(recipeCard);
                } else {
                    setTimeout(() => location.reload(), 1000);
                }
            }
            return true;
        } else {
            RecipeBook.showNotification(response.error || 'Failed to delete recipe', 'error');
            return false;
        }
    } catch (error) {
        console.error('Delete recipe error:', error);
        RecipeBook.showNotification('Failed to delete recipe. Please try again.', 'error');
        return false;
    } finally {
        if (removeLoading) removeLoading();
    }
}

/**
 * Delete ingredient with usage validation
 */
async function deleteIngredient(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return false;
    }

    const deleteButton = document.querySelector(`[onclick*="deleteIngredient(${id}"], .btn-delete[data-ingredient-id="${id}"]`);
    const removeLoading = deleteButton ? RecipeBook.addLoadingState(deleteButton, 'Checking...') : null;

    try {
        const response = await RecipeBook.apiRequest(`/api/ingredients/${id}`, {
            method: 'DELETE'
        });

        if (response.success) {
            RecipeBook.showNotification(response.message, 'success');
            setTimeout(() => location.reload(), 1000);
            return true;
        } else if (response.usedInRecipes) {
            showIngredientUsageError(response);
            return false;
        } else {
            RecipeBook.showNotification(response.error || 'Failed to delete ingredient', 'error');
            return false;
        }
    } catch (error) {
        console.error('Delete ingredient error:', error);
        RecipeBook.showNotification('Failed to delete ingredient. Please try again.', 'error');
        return false;
    } finally {
        if (removeLoading) removeLoading();
    }
}

/**
 * Delete tag
 */
async function deleteTag(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This will remove it from all recipes.`)) {
        return false;
    }

    const deleteButton = document.querySelector(`[onclick*="deleteTag(${id}"], .btn-delete[data-tag-id="${id}"]`);
    const removeLoading = deleteButton ? RecipeBook.addLoadingState(deleteButton, 'Deleting...') : null;

    try {
        const response = await RecipeBook.apiRequest(`/api/tags/${id}`, {
            method: 'DELETE'
        });

        if (response.success) {
            RecipeBook.showNotification(response.message, 'success');
            setTimeout(() => location.reload(), 1000);
            return true;
        } else {
            RecipeBook.showNotification(response.error || 'Failed to delete tag', 'error');
            return false;
        }
    } catch (error) {
        console.error('Delete tag error:', error);
        RecipeBook.showNotification('Failed to delete tag. Please try again.', 'error');
        return false;
    } finally {
        if (removeLoading) removeLoading();
    }
}

// ============================================
// INGREDIENT USAGE ERROR MODAL
// ============================================

/**
 * Show ingredient usage error modal
 */
function showIngredientUsageError(data) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center;
        align-items: center; z-index: 1000; backdrop-filter: blur(5px);
    `;
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-exclamation-triangle" style="color: #ff6b6b;"></i> Cannot Delete Ingredient</h3>
                <button type="button" class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p><strong>${data.error}</strong></p>
                
                ${data.recipeNames && data.recipeNames.length > 0 ? `
                    <div style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <h4 style="margin: 0 0 0.5rem 0; color: #495057;">Used in these recipes:</h4>
                        <ul style="margin: 0; padding-left: 1.5rem;">
                            ${data.recipeNames.map(name => `<li style="margin: 0.25rem 0;">${name}</li>`).join('')}
                        </ul>
                        ${data.recipeCount > data.recipeNames.length ? 
                            `<p style="margin: 0.5rem 0 0 0; font-style: italic; color: #6c757d;">
                                ...and ${data.recipeCount - data.recipeNames.length} more recipe${data.recipeCount - data.recipeNames.length > 1 ? 's' : ''}
                            </p>` : ''}
                    </div>
                ` : ''}
                
                <div style="margin-top: 1.5rem; padding: 1rem; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                    <p style="margin: 0; color: #1976d2;">
                        <i class="fas fa-info-circle"></i> 
                        To delete this ingredient, you must first remove it from all recipes that use it, or delete those recipes.
                    </p>
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-check"></i> Understood
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    // Close on escape key
    const closeOnEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEscape);
        }
    };
    document.addEventListener('keydown', closeOnEscape);
}

// ============================================
// RECIPE FORM VALIDATION
// ============================================

/**
 * Validate recipe form
 */
function validateRecipeForm(form) {
    const title = form.querySelector('#title');
    const instructions = form.querySelector('#instructions');
    
    if (!title.value.trim()) {
        RecipeBook.showNotification('Recipe title is required.', 'error');
        title.focus();
        return false;
    }
    
    if (!instructions.value.trim()) {
        RecipeBook.showNotification('Cooking instructions are required.', 'error');
        instructions.focus();
        return false;
    }
    
    // Check if at least one ingredient is added
    const ingredientRows = form.querySelectorAll('.ingredient-row');
    let hasValidIngredient = false;
    
    ingredientRows.forEach(row => {
        const select = row.querySelector('.ingredient-select');
        const quantity = row.querySelector('.quantity-input');
        
        if (select && quantity && select.value && quantity.value && quantity.value > 0) {
            hasValidIngredient = true;
        }
    });
    
    if (!hasValidIngredient) {
        RecipeBook.showNotification('Please add at least one ingredient with a valid quantity.', 'error');
        return false;
    }
    
    return true;
}

/**
 * Validate ingredient form
 */
function validateIngredientForm(form) {
    const name = form.querySelector('#name, #ingredient-name, #new-ingredient-name');
    
    if (!name || !name.value.trim()) {
        RecipeBook.showNotification('Ingredient name is required.', 'error');
        if (name) name.focus();
        return false;
    }
    
    return true;
}

/**
 * Validate tag form
 */
function validateTagForm(form) {
    const name = form.querySelector('#name, #tag-name, #new-tag-name');
    
    if (!name || !name.value.trim()) {
        RecipeBook.showNotification('Tag name is required.', 'error');
        if (name) name.focus();
        return false;
    }
    
    return true;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format time duration
 */
function formatTime(minutes) {
    if (!minutes || minutes === 0) return 'Not specified';
    
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

/**
 * Format date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ============================================
// RECIPE-SPECIFIC INITIALIZATION
// ============================================

// Wait for RecipeBook to be initialized
RecipeBook.on('app:initialized', function() {
    console.log('🍳 Recipe-specific functionality loaded');
    
    // Set up recipe-specific form validation
    document.querySelectorAll('.recipe-form').forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!validateRecipeForm(this)) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    });
    
    // Set up ingredient form validation
    document.querySelectorAll('.ingredient-form').forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!validateIngredientForm(this)) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    });
    
    // Set up tag form validation  
    document.querySelectorAll('.tag-form').forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!validateTagForm(this)) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    });
});

// Export functions for global access (for onclick handlers in templates)
window.deleteRecipe = deleteRecipe;
window.deleteIngredient = deleteIngredient;
window.deleteTag = deleteTag;
window.showIngredientUsageError = showIngredientUsageError;
window.validateRecipeForm = validateRecipeForm;
window.validateIngredientForm = validateIngredientForm;
window.validateTagForm = validateTagForm;   