// Recipe management functions
async function deleteRecipe(id) {
    if (!confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
        return false;
    }

    // Find delete button for loading state
    const deleteButton = document.querySelector(`[onclick*="deleteRecipe(${id})"], [data-recipe-id="${id}"] .delete-btn`);
    let removeLoading = null;
    
    if (deleteButton) {
        const originalText = deleteButton.innerHTML;
        deleteButton.disabled = true;
        deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        
        removeLoading = () => {
            deleteButton.disabled = false;
            deleteButton.innerHTML = originalText;
        };
    }

    try {
        const response = await fetch(`/api/recipes/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            RecipeBook.showNotification(data.message, 'success');
            
            // If we're on the recipe detail page, redirect to recipes list
            if (window.location.pathname.includes('/recipe/')) {
                setTimeout(() => {
                    window.location.href = '/recipes';
                }, 1000);
            } else {
                // Remove recipe card from the current page or reload
                const recipeCard = document.querySelector(`[data-recipe-id="${id}"], .recipe-card:has([onclick*="deleteRecipe(${id})"])`);
                if (recipeCard) {
                    recipeCard.style.opacity = '0';
                    recipeCard.style.transform = 'translateY(-20px)';
                    setTimeout(() => recipeCard.remove(), 300);
                } else {
                    setTimeout(() => location.reload(), 1000);
                }
            }
            return true;
        } else {
            RecipeBook.showNotification(data.error || 'Failed to delete recipe', 'error');
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

async function deleteIngredient(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return false;
    }

    // Find delete button for loading state
    const deleteButton = document.querySelector(`[onclick*="deleteIngredient(${id}"], .btn-delete[data-ingredient-id="${id}"]`);
    let removeLoading = null;
    
    if (deleteButton) {
        const originalText = deleteButton.innerHTML;
        deleteButton.disabled = true;
        deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        
        removeLoading = () => {
            deleteButton.disabled = false;
            deleteButton.innerHTML = originalText;
        };
    }

    try {
        const response = await fetch(`/api/ingredients/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            RecipeBook.showNotification(data.message, 'success');
            setTimeout(() => location.reload(), 1000);
            return true;
        } else if (response.status === 409 && data.usedInRecipes) {
            // Show detailed usage error modal
            showIngredientUsageError(data);
            return false;
        } else {
            RecipeBook.showNotification(data.error || 'Failed to delete ingredient', 'error');
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

async function deleteTag(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This will remove it from all recipes.`)) {
        return false;
    }

    // Find delete button for loading state
    const deleteButton = document.querySelector(`[onclick*="deleteTag(${id}"], .btn-delete[data-tag-id="${id}"]`);
    let removeLoading = null;
    
    if (deleteButton) {
        const originalText = deleteButton.innerHTML;
        deleteButton.disabled = true;
        deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        
        removeLoading = () => {
            deleteButton.disabled = false;
            deleteButton.innerHTML = originalText;
        };
    }

    try {
        const response = await fetch(`/api/tags/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            RecipeBook.showNotification(data.message, 'success');
            setTimeout(() => location.reload(), 1000);
            return true;
        } else {
            RecipeBook.showNotification(data.error || 'Failed to delete tag', 'error');
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

async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            RecipeBook.showNotification(data.message, 'success');
            setTimeout(() => {
                window.location.href = data.redirect || '/recipes';
            }, 1000);
        } else {
            RecipeBook.showNotification(data.error || 'Logout failed', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        RecipeBook.showNotification('Logout failed. Please try again.', 'error');
    }
}

async function performSearch(query) {
    if (!query || query.trim().length < 2) {
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await response.json();

        if (data.success) {
            // Handle search results
            displaySearchResults(data.results, data.query);
            return data.results;
        } else {
            RecipeBook.showNotification(data.error || 'Search failed', 'error');
            return [];
        }
    } catch (error) {
        console.error('Search error:', error);
        RecipeBook.showNotification('Search failed. Please try again.', 'error');
        return [];
    }
}

function displaySearchResults(results, query) {
    // This would be implemented if you want dynamic search results
    // For now, we rely on page refresh with query parameters
    console.log(`Search results for "${query}":`, results);
}

// Search functionality
function handleSearch(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const searchForm = event.target.closest('form');
        if (searchForm) {
            searchForm.submit();
        }
    }
}

// Add search event listeners when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Add search functionality
    const searchInputs = document.querySelectorAll('.search-input');
    searchInputs.forEach(input => {
        input.addEventListener('keypress', handleSearch);
    });
    
    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                alert.remove();
            }, 300);
        }, 5000);
    });
    
    // Smooth scroll for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Form validation helpers
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
        
        if (select.value && quantity.value && quantity.value > 0) {
            hasValidIngredient = true;
        }
    });
    
    if (!hasValidIngredient) {
        RecipeBook.showNotification('Please add at least one ingredient with a valid quantity.', 'error');
        return false;
    }
    
    return true;
}

function validateIngredientForm(form) {
    const name = form.querySelector('#name');
    const unit = form.querySelector('#unit');
    
    if (!name.value.trim()) {
        alert('Ingredient name is required.');
        name.focus();
        return false;
    }
    
    if (!unit.value) {
        alert('Unit of measurement is required.');
        unit.focus();
        return false;
    }
    
    return true;
}

// Add form validation on submit
document.addEventListener('DOMContentLoaded', function() {
    const recipeForm = document.querySelector('.recipe-form');
    if (recipeForm) {
        recipeForm.addEventListener('submit', function(e) {
            if (!validateRecipeForm(this)) {
                e.preventDefault();
            }
        });
    }
    
    const ingredientForm = document.querySelector('.ingredient-form');
    if (ingredientForm) {
        ingredientForm.addEventListener('submit', function(e) {
            if (!validateIngredientForm(this)) {
                e.preventDefault();
            }
        });
    }
});

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTime(minutes) {
    if (!minutes || minutes === 0) {
        return 'Not specified';
    }
    
    if (minutes < 60) {
        return `${minutes} minutes`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    
    return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minutes`;
}

// Add loading states for buttons
function addLoadingState(button, originalText) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    
    return function removeLoadingState() {
        button.disabled = false;
        button.innerHTML = originalText;
    };
}

// Enhanced delete functions with loading states
function deleteRecipeWithLoading(id, button) {
    const originalText = button.innerHTML;
    const removeLoading = addLoadingState(button, originalText);
    
    if (confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
        fetch(`/api/recipes/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            removeLoading();
            if (response.ok) {
                if (window.location.pathname.includes('/recipe/')) {
                    window.location.href = '/recipes';
                } else {
                    location.reload();
                }
            } else {
                alert('Failed to delete recipe. Please try again.');
            }
        })
        .catch(error => {
            removeLoading();
            alert('Error deleting recipe: ' + error.message);
        });
    } else {
        removeLoading();
    }
}

function deleteIngredientWithLoading(id, name, button) {
    const originalText = button.innerHTML;
    const removeLoading = addLoadingState(button, originalText);
    
    if (confirm(`Are you sure you want to delete "${name}"? This action cannot be undone and may affect existing recipes.`)) {
        fetch(`/api/ingredients/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            removeLoading();
            if (response.ok) {
                location.reload();
            } else {
                alert('Failed to delete ingredient. It might be used in existing recipes.');
            }
        })
        .catch(error => {
            removeLoading();
            alert('Error deleting ingredient: ' + error.message);
        });
    } else {
        removeLoading();
    }
}

// Handle mobile menu toggle
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.classList.toggle('mobile-open');
}

// Add mobile menu styles dynamically
const mobileStyles = `
@media (max-width: 768px) {
    .nav-links.mobile-open {
        display: flex !important;
        flex-direction: column;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(20px);
        padding: 20px;
        border-radius: 0 0 15px 15px;
        box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
    }
}
`;

// Add mobile styles to head
const styleSheet = document.createElement('style');
styleSheet.textContent = mobileStyles;
document.head.appendChild(styleSheet);

// Keyboard navigation support
document.addEventListener('keydown', function(e) {
    // ESC key to close modals or cancel actions
    if (e.key === 'Escape') {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.tagName === 'BUTTON') {
            activeElement.blur();
        }
    }
    
    // Enter key on buttons
    if (e.key === 'Enter' && e.target.tagName === 'BUTTON') {
        e.target.click();
    }
});

// Progressive enhancement for recipe cards
document.addEventListener('DOMContentLoaded', function() {
    const recipeCards = document.querySelectorAll('.recipe-card');
    
    recipeCards.forEach(card => {
        // Add click-to-view functionality
        card.addEventListener('click', function(e) {
            // Don't trigger if clicking on buttons or links
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.closest('button') || e.target.closest('a')) {
                return;
            }
            
            const viewLink = card.querySelector('a[href*="/recipe/"]');
            if (viewLink) {
                window.location.href = viewLink.href;
            }
        });
        
        // Add hover effect class
        card.style.cursor = 'pointer';
    });
});

// Service worker registration for offline support (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/static/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed');
            });
    });
}

// Definitive fix for instruction formatting
document.addEventListener('DOMContentLoaded', function() {
    const instructionsContent = document.querySelector('.instructions-content');
    if (instructionsContent) {
        // Get the original HTML content (which should have <br> tags from nl2br)
        let html = instructionsContent.innerHTML;
        
        // Remove any leading <br> tags or whitespace that cause initial padding
        html = html.replace(/^(\s|<br\s*\/?>\s*)+/i, '');
        
        // Ensure proper spacing: Convert single <br> to <br> and double <br><br> to paragraph spacing
        html = html.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br><br>'); // Ensure double breaks
        
        // Set the cleaned HTML back
        instructionsContent.innerHTML = html;
        
        // Ensure no CSS padding issues
        instructionsContent.style.paddingTop = '0';
        instructionsContent.style.marginTop = '0';
    }
});

function showIngredientUsageError(data) {
    const modal = createModal();
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-exclamation-triangle" style="color: #ff6b6b;"></i> Cannot Delete Ingredient</h3>
                <button type="button" class="modal-close" onclick="closeModal(this)">
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
                <button type="button" class="btn btn-secondary" onclick="closeModal(this)">
                    <i class="fas fa-check"></i> Understood
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function createModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        backdrop-filter: blur(5px);
    `;
    return modal;
}

function closeModal(element) {
    const modal = element.closest('.modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1001;
        max-width: 400px;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    const icon = type === 'success' ? 'check-circle' : 'exclamation-triangle';
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        ${message}
    `;
    
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Enhanced delete function with loading states for recipe form
function deleteIngredientWithLoading(id, name, button) {
    const originalText = button.innerHTML;
    const addLoadingState = () => {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    };
    
    const removeLoadingState = () => {
        button.disabled = false;
        button.innerHTML = originalText;
    };
    
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        addLoadingState();
        
        fetch(`/api/ingredients/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (response.ok) {
                return response.json().then(data => {
                    showSuccess(data.message || 'Ingredient deleted successfully');
                    location.reload();
                });
            } else if (response.status === 409) {
                return response.json().then(data => {
                    removeLoadingState();
                    showIngredientUsageError(data);
                });
            } else {
                throw new Error('Failed to delete ingredient');
            }
        })
        .catch(error => {
            removeLoadingState();
            showError('Error deleting ingredient: ' + error.message);
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('navLinks');
    const navOverlay = document.getElementById('navOverlay');
    const body = document.body;

    if (!mobileMenuToggle || !navLinks || !navOverlay) return;

    function toggleMobileMenu() {
        const isOpen = navLinks.classList.contains('mobile-open');
        
        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }

    function openMobileMenu() {
        navLinks.classList.add('mobile-open');
        mobileMenuToggle.classList.add('active');
        navOverlay.classList.add('active');
        body.classList.add('menu-open');
        mobileMenuToggle.setAttribute('aria-expanded', 'true');
    }

    function closeMobileMenu() {
        navLinks.classList.remove('mobile-open');
        mobileMenuToggle.classList.remove('active');
        navOverlay.classList.remove('active');
        body.classList.remove('menu-open');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
    }

    // Event listeners
    mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    navOverlay.addEventListener('click', closeMobileMenu);

    // Close menu when clicking on a nav link (mobile)
    navLinks.addEventListener('click', (e) => {
        if ((e.target.classList.contains('nav-link') || e.target.closest('.nav-link')) && window.innerWidth <= 768) {
            setTimeout(closeMobileMenu, 150); // Small delay for better UX
        }
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('mobile-open')) {
            closeMobileMenu();
        }
    });

    // Close menu on window resize if it gets too wide
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navLinks.classList.contains('mobile-open')) {
            closeMobileMenu();
        }
    });

    // Prevent scroll on touch devices when menu is open
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    });

    document.addEventListener('touchmove', (e) => {
        if (body.classList.contains('menu-open')) {
            const touchY = e.touches[0].clientY;
            const touchYDelta = touchY - touchStartY;
            
            // Only prevent scroll if not scrolling within the nav menu
            if (!e.target.closest('.nav-links')) {
                e.preventDefault();
            }
        }
    }, { passive: false });
});

document.addEventListener('DOMContentLoaded', function() {
    // Handle logout form submissions
    const logoutForms = document.querySelectorAll('form[action*="/logout"]');
    logoutForms.forEach(form => {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            await logout();
        });
    });
    
    // Handle search forms with enter key
    const searchInputs = document.querySelectorAll('.search-input');
    searchInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const form = e.target.closest('form');
                if (form) {
                    form.submit(); // Use regular form submission for search
                }
            }
        });
    });
    
    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.opacity = '0';
                alert.style.transform = 'translateY(-20px)';
                setTimeout(() => {
                    if (alert.parentNode) {
                        alert.remove();
                    }
                }, 300);
            }
        }, 5000);
    });
    
    // Enhanced tag filter interactions with loading states
    const tagFilters = document.querySelectorAll('.tag-filter, .recipe-tag');
    tagFilters.forEach(filter => {
        filter.addEventListener('click', function(e) {
            // Show loading state for navigation
            const originalContent = this.innerHTML;
            this.style.opacity = '0.7';
            const loadingContent = '<i class="fas fa-spinner fa-spin"></i> ' + this.textContent.trim();
            
            // Only show loading if this is a navigation link
            if (this.tagName === 'A') {
                this.innerHTML = loadingContent;
                
                // Restore content if navigation fails
                setTimeout(() => {
                    this.innerHTML = originalContent;
                    this.style.opacity = '1';
                }, 2000);
            }
        });
    });
});

// Mobile menu functionality (preserved from original)
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('navLinks');
    const navOverlay = document.getElementById('navOverlay');
    const body = document.body;

    if (!mobileMenuToggle || !navLinks || !navOverlay) return;

    function toggleMobileMenu() {
        const isOpen = navLinks.classList.contains('mobile-open');
        
        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }

    function openMobileMenu() {
        navLinks.classList.add('mobile-open');
        mobileMenuToggle.classList.add('active');
        navOverlay.classList.add('active');
        body.classList.add('menu-open');
        mobileMenuToggle.setAttribute('aria-expanded', 'true');
    }

    function closeMobileMenu() {
        navLinks.classList.remove('mobile-open');
        mobileMenuToggle.classList.remove('active');
        navOverlay.classList.remove('active');
        body.classList.remove('menu-open');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
    }

    // Event listeners
    mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    navOverlay.addEventListener('click', closeMobileMenu);

    // Close menu when clicking on a nav link (mobile)
    navLinks.addEventListener('click', (e) => {
        if ((e.target.classList.contains('nav-link') || e.target.closest('.nav-link')) && window.innerWidth <= 768) {
            setTimeout(closeMobileMenu, 150);
        }
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('mobile-open')) {
            closeMobileMenu();
        }
    });

    // Close menu on window resize if it gets too wide
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navLinks.classList.contains('mobile-open')) {
            closeMobileMenu();
        }
    });
});

// Debug helper - uncomment to see what's actually in the instructions
/*
document.addEventListener('DOMContentLoaded', function() {
    const instructionsContent = document.querySelector('.instructions-content');
    if (instructionsContent) {
        console.log('Original HTML:', instructionsContent.innerHTML);
        console.log('Text content:', instructionsContent.textContent);
    }
});
*/