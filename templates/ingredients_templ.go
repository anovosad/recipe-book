// Code generated by templ - DO NOT EDIT.

// templ: version: v0.3.865

// templates/ingredients.templ

package templates

//lint:file-ignore SA4006 This context is only used if a nested component is present.

import "github.com/a-h/templ"
import templruntime "github.com/a-h/templ/runtime"

import (
	"recipe-book/models"
	"strconv"
)

func Ingredients(data *models.PageData) templ.Component {
	return templruntime.GeneratedTemplate(func(templ_7745c5c3_Input templruntime.GeneratedComponentInput) (templ_7745c5c3_Err error) {
		templ_7745c5c3_W, ctx := templ_7745c5c3_Input.Writer, templ_7745c5c3_Input.Context
		if templ_7745c5c3_CtxErr := ctx.Err(); templ_7745c5c3_CtxErr != nil {
			return templ_7745c5c3_CtxErr
		}
		templ_7745c5c3_Buffer, templ_7745c5c3_IsBuffer := templruntime.GetBuffer(templ_7745c5c3_W)
		if !templ_7745c5c3_IsBuffer {
			defer func() {
				templ_7745c5c3_BufErr := templruntime.ReleaseBuffer(templ_7745c5c3_Buffer)
				if templ_7745c5c3_Err == nil {
					templ_7745c5c3_Err = templ_7745c5c3_BufErr
				}
			}()
		}
		ctx = templ.InitializeContext(ctx)
		templ_7745c5c3_Var1 := templ.GetChildren(ctx)
		if templ_7745c5c3_Var1 == nil {
			templ_7745c5c3_Var1 = templ.NopComponent
		}
		ctx = templ.ClearChildren(ctx)
		templ_7745c5c3_Var2 := templruntime.GeneratedTemplate(func(templ_7745c5c3_Input templruntime.GeneratedComponentInput) (templ_7745c5c3_Err error) {
			templ_7745c5c3_W, ctx := templ_7745c5c3_Input.Writer, templ_7745c5c3_Input.Context
			templ_7745c5c3_Buffer, templ_7745c5c3_IsBuffer := templruntime.GetBuffer(templ_7745c5c3_W)
			if !templ_7745c5c3_IsBuffer {
				defer func() {
					templ_7745c5c3_BufErr := templruntime.ReleaseBuffer(templ_7745c5c3_Buffer)
					if templ_7745c5c3_Err == nil {
						templ_7745c5c3_Err = templ_7745c5c3_BufErr
					}
				}()
			}
			ctx = templ.InitializeContext(ctx)
			templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 1, "<div class=\"page-header compact\"><h1><i class=\"fas fa-leaf\"></i> Ingredients</h1>")
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			if data.IsLoggedIn {
				templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 2, "<button type=\"button\" id=\"add-ingredient-btn\" class=\"btn btn-primary btn-sm\"><i class=\"fas fa-plus\"></i> Add Ingredient</button>")
				if templ_7745c5c3_Err != nil {
					return templ_7745c5c3_Err
				}
			}
			templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 3, "</div>")
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			if len(data.Ingredients) > 0 {
				templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 4, "<div class=\"ingredients-grid compact\">")
				if templ_7745c5c3_Err != nil {
					return templ_7745c5c3_Err
				}
				for _, ingredient := range data.Ingredients {
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 5, "<div class=\"ingredient-card compact\"><div class=\"ingredient-content\"><a href=\"")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					var templ_7745c5c3_Var3 templ.SafeURL = templ.URL("/recipes?search=" + ingredient.Name)
					_, templ_7745c5c3_Err = templ_7745c5c3_Buffer.WriteString(templ.EscapeString(string(templ_7745c5c3_Var3)))
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 6, "\" class=\"tag-name\" title=\"")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					var templ_7745c5c3_Var4 string
					templ_7745c5c3_Var4, templ_7745c5c3_Err = templ.JoinStringErrs("Find recipes using " + ingredient.Name)
					if templ_7745c5c3_Err != nil {
						return templ.Error{Err: templ_7745c5c3_Err, FileName: `templates/ingredients.templ`, Line: 25, Col: 131}
					}
					_, templ_7745c5c3_Err = templ_7745c5c3_Buffer.WriteString(templ.EscapeString(templ_7745c5c3_Var4))
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 7, "\">")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					var templ_7745c5c3_Var5 string
					templ_7745c5c3_Var5, templ_7745c5c3_Err = templ.JoinStringErrs(ingredient.Name)
					if templ_7745c5c3_Err != nil {
						return templ.Error{Err: templ_7745c5c3_Err, FileName: `templates/ingredients.templ`, Line: 26, Col: 25}
					}
					_, templ_7745c5c3_Err = templ_7745c5c3_Buffer.WriteString(templ.EscapeString(templ_7745c5c3_Var5))
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 8, "</a> ")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
					if data.IsLoggedIn {
						templ_7745c5c3_Err = templ.RenderScriptItems(ctx, templ_7745c5c3_Buffer, templ.JSFuncCall("deleteIngredient", strconv.Itoa(ingredient.ID), ingredient.Name))
						if templ_7745c5c3_Err != nil {
							return templ_7745c5c3_Err
						}
						templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 9, "<button onclick=\"")
						if templ_7745c5c3_Err != nil {
							return templ_7745c5c3_Err
						}
						var templ_7745c5c3_Var6 templ.ComponentScript = templ.JSFuncCall("deleteIngredient", strconv.Itoa(ingredient.ID), ingredient.Name)
						_, templ_7745c5c3_Err = templ_7745c5c3_Buffer.WriteString(templ_7745c5c3_Var6.Call)
						if templ_7745c5c3_Err != nil {
							return templ_7745c5c3_Err
						}
						templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 10, "\" class=\"btn-delete\" title=\"")
						if templ_7745c5c3_Err != nil {
							return templ_7745c5c3_Err
						}
						var templ_7745c5c3_Var7 string
						templ_7745c5c3_Var7, templ_7745c5c3_Err = templ.JoinStringErrs("Delete " + ingredient.Name)
						if templ_7745c5c3_Err != nil {
							return templ.Error{Err: templ_7745c5c3_Err, FileName: `templates/ingredients.templ`, Line: 29, Col: 165}
						}
						_, templ_7745c5c3_Err = templ_7745c5c3_Buffer.WriteString(templ.EscapeString(templ_7745c5c3_Var7))
						if templ_7745c5c3_Err != nil {
							return templ_7745c5c3_Err
						}
						templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 11, "\"><i class=\"fas fa-trash\"></i></button>")
						if templ_7745c5c3_Err != nil {
							return templ_7745c5c3_Err
						}
					}
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 12, "</div></div>")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
				}
				templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 13, "</div>")
				if templ_7745c5c3_Err != nil {
					return templ_7745c5c3_Err
				}
			} else {
				templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 14, "<div class=\"empty-state compact\"><i class=\"fas fa-leaf\"></i><h3>No ingredients found</h3><p>")
				if templ_7745c5c3_Err != nil {
					return templ_7745c5c3_Err
				}
				if data.IsLoggedIn {
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 15, "Add some ingredients to get started!")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
				} else {
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 16, "Please log in to manage ingredients.")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
				}
				templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 17, "</p>")
				if templ_7745c5c3_Err != nil {
					return templ_7745c5c3_Err
				}
				if data.IsLoggedIn {
					templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 18, "<button type=\"button\" id=\"add-first-ingredient-btn\" class=\"btn btn-primary\"><i class=\"fas fa-plus\"></i> Add Your First Ingredient</button>")
					if templ_7745c5c3_Err != nil {
						return templ_7745c5c3_Err
					}
				}
				templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 19, "</div>")
				if templ_7745c5c3_Err != nil {
					return templ_7745c5c3_Err
				}
			}
			templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 20, " ")
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			templ_7745c5c3_Err = IngredientFormModal().Render(ctx, templ_7745c5c3_Buffer)
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 21, " ")
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			templ_7745c5c3_Err = IngredientsScript().Render(ctx, templ_7745c5c3_Buffer)
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			return nil
		})
		templ_7745c5c3_Err = Base("Ingredients", data).Render(templ.WithChildren(ctx, templ_7745c5c3_Var2), templ_7745c5c3_Buffer)
		if templ_7745c5c3_Err != nil {
			return templ_7745c5c3_Err
		}
		return nil
	})
}

func IngredientFormModal() templ.Component {
	return templruntime.GeneratedTemplate(func(templ_7745c5c3_Input templruntime.GeneratedComponentInput) (templ_7745c5c3_Err error) {
		templ_7745c5c3_W, ctx := templ_7745c5c3_Input.Writer, templ_7745c5c3_Input.Context
		if templ_7745c5c3_CtxErr := ctx.Err(); templ_7745c5c3_CtxErr != nil {
			return templ_7745c5c3_CtxErr
		}
		templ_7745c5c3_Buffer, templ_7745c5c3_IsBuffer := templruntime.GetBuffer(templ_7745c5c3_W)
		if !templ_7745c5c3_IsBuffer {
			defer func() {
				templ_7745c5c3_BufErr := templruntime.ReleaseBuffer(templ_7745c5c3_Buffer)
				if templ_7745c5c3_Err == nil {
					templ_7745c5c3_Err = templ_7745c5c3_BufErr
				}
			}()
		}
		ctx = templ.InitializeContext(ctx)
		templ_7745c5c3_Var8 := templ.GetChildren(ctx)
		if templ_7745c5c3_Var8 == nil {
			templ_7745c5c3_Var8 = templ.NopComponent
		}
		ctx = templ.ClearChildren(ctx)
		templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 22, "<div id=\"ingredient-form-modal\" class=\"modal hidden\"><div class=\"modal-content\"><div class=\"modal-header\"><h3><i class=\"fas fa-plus-circle\"></i> New Ingredient</h3><button type=\"button\" class=\"modal-close\"><i class=\"fas fa-times\"></i></button></div><div class=\"modal-body\"><form id=\"ingredientFormModal\" class=\"ingredient-form\"><div class=\"form-group\"><label for=\"ingredient-name\">Ingredient Name *</label> <input type=\"text\" id=\"ingredient-name\" name=\"name\" class=\"form-control\" required></div><div class=\"modal-actions\"><button type=\"button\" class=\"btn btn-secondary modal-close\"><i class=\"fas fa-times\"></i> Cancel</button> <button type=\"submit\" class=\"btn btn-primary\"><i class=\"fas fa-save\"></i> Save Ingredient</button></div></form></div></div></div>")
		if templ_7745c5c3_Err != nil {
			return templ_7745c5c3_Err
		}
		return nil
	})
}

// Simplified script using RecipeBook functionality
func IngredientsScript() templ.Component {
	return templruntime.GeneratedTemplate(func(templ_7745c5c3_Input templruntime.GeneratedComponentInput) (templ_7745c5c3_Err error) {
		templ_7745c5c3_W, ctx := templ_7745c5c3_Input.Writer, templ_7745c5c3_Input.Context
		if templ_7745c5c3_CtxErr := ctx.Err(); templ_7745c5c3_CtxErr != nil {
			return templ_7745c5c3_CtxErr
		}
		templ_7745c5c3_Buffer, templ_7745c5c3_IsBuffer := templruntime.GetBuffer(templ_7745c5c3_W)
		if !templ_7745c5c3_IsBuffer {
			defer func() {
				templ_7745c5c3_BufErr := templruntime.ReleaseBuffer(templ_7745c5c3_Buffer)
				if templ_7745c5c3_Err == nil {
					templ_7745c5c3_Err = templ_7745c5c3_BufErr
				}
			}()
		}
		ctx = templ.InitializeContext(ctx)
		templ_7745c5c3_Var9 := templ.GetChildren(ctx)
		if templ_7745c5c3_Var9 == nil {
			templ_7745c5c3_Var9 = templ.NopComponent
		}
		ctx = templ.ClearChildren(ctx)
		templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 23, "<script>\n\t\tRecipeBook.on('app:initialized', function() {\n\t\t\tconst modal = document.getElementById('ingredient-form-modal');\n\t\t\tconst form = document.getElementById('ingredientFormModal');\n\t\t\tconst addBtn = document.getElementById('add-ingredient-btn');\n\t\t\tconst addFirstBtn = document.getElementById('add-first-ingredient-btn');\n\t\t\t\n\t\t\t// Open modal handlers\n\t\t\t[addBtn, addFirstBtn].forEach(btn => {\n\t\t\t\tif (btn) {\n\t\t\t\t\tbtn.addEventListener('click', () => {\n\t\t\t\t\t\tmodal.classList.remove('hidden');\n\t\t\t\t\t\tmodal.style.display = 'flex';\n\t\t\t\t\t\tdocument.getElementById('ingredient-name').focus();\n\t\t\t\t\t});\n\t\t\t\t}\n\t\t\t});\n\t\t\t\n\t\t\t// Close modal handlers (using RecipeBook modal system)\n\t\t\tmodal.querySelectorAll('.modal-close').forEach(btn => {\n\t\t\t\tbtn.addEventListener('click', () => {\n\t\t\t\t\tRecipeBook.closeModal(modal);\n\t\t\t\t\tmodal.classList.add('hidden');\n\t\t\t\t\tdocument.getElementById('ingredient-name').value = '';\n\t\t\t\t});\n\t\t\t});\n\t\t\t\n\t\t\t// Form submission\n\t\t\tform.addEventListener('submit', async function(e) {\n\t\t\t\te.preventDefault();\n\t\t\t\t\n\t\t\t\t// Use centralized validation\n\t\t\t\tif (!validateIngredientForm(this)) return;\n\t\t\t\t\n\t\t\t\tconst submitBtn = this.querySelector('button[type=\"submit\"]');\n\t\t\t\tconst removeLoading = RecipeBook.addLoadingState(submitBtn, 'Saving...');\n\t\t\t\t\n\t\t\t\ttry {\n\t\t\t\t\tconst ingredientData = {\n\t\t\t\t\t\tname: this.querySelector('#ingredient-name').value.trim()\n\t\t\t\t\t};\n\t\t\t\t\t\n\t\t\t\t\tconst response = await RecipeBook.apiRequest('/api/ingredients', {\n\t\t\t\t\t\tmethod: 'POST',\n\t\t\t\t\t\theaders: { 'Content-Type': 'application/json' },\n\t\t\t\t\t\tbody: JSON.stringify(ingredientData)\n\t\t\t\t\t});\n\t\t\t\t\t\n\t\t\t\t\tif (response.success) {\n\t\t\t\t\t\tRecipeBook.showNotification(response.message, 'success');\n\t\t\t\t\t\tRecipeBook.closeModal(modal);\n\t\t\t\t\t\tmodal.classList.add('hidden');\n\t\t\t\t\t\tsetTimeout(() => window.location.reload(), 1000);\n\t\t\t\t\t} else {\n\t\t\t\t\t\tRecipeBook.showNotification(response.error || 'Failed to save ingredient', 'error');\n\t\t\t\t\t}\n\t\t\t\t} catch (error) {\n\t\t\t\t\tconsole.error('Ingredient save error:', error);\n\t\t\t\t\tRecipeBook.showNotification('Failed to save ingredient. Please try again.', 'error');\n\t\t\t\t} finally {\n\t\t\t\t\tremoveLoading();\n\t\t\t\t}\n\t\t\t});\n\t\t});\n\t</script>")
		if templ_7745c5c3_Err != nil {
			return templ_7745c5c3_Err
		}
		return nil
	})
}

var _ = templruntime.GeneratedTemplate
