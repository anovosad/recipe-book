// Code generated by templ - DO NOT EDIT.

// templ: version: v0.3.865

// templates/login.templ

package templates

//lint:file-ignore SA4006 This context is only used if a nested component is present.

import "github.com/a-h/templ"
import templruntime "github.com/a-h/templ/runtime"

import "recipe-book/models"

func Login(data *models.PageData) templ.Component {
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
			templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 1, "<div class=\"auth-container\"><div class=\"auth-card\"><h2><i class=\"fas fa-sign-in-alt\"></i> Login</h2><form id=\"loginForm\" class=\"auth-form\" data-api-endpoint=\"/api/login\" data-redirect=\"/recipes\"><div class=\"form-group\"><label for=\"username\">Username</label> <input type=\"text\" id=\"username\" name=\"username\" class=\"form-control\" required></div><div class=\"form-group\"><label for=\"password\">Password</label> <input type=\"password\" id=\"password\" name=\"password\" class=\"form-control\" required></div><button type=\"submit\" class=\"btn btn-primary btn-full\"><i class=\"fas fa-sign-in-alt\"></i> Login</button></form><div class=\"auth-links\"><p>Don't have an account? <a href=\"/register\">Register here</a></p></div></div></div>")
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			templ_7745c5c3_Err = LoginScript().Render(ctx, templ_7745c5c3_Buffer)
			if templ_7745c5c3_Err != nil {
				return templ_7745c5c3_Err
			}
			return nil
		})
		templ_7745c5c3_Err = Base("Login", data).Render(templ.WithChildren(ctx, templ_7745c5c3_Var2), templ_7745c5c3_Buffer)
		if templ_7745c5c3_Err != nil {
			return templ_7745c5c3_Err
		}
		return nil
	})
}

// Minimal script that uses RecipeBook core functionality
func LoginScript() templ.Component {
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
		templ_7745c5c3_Var3 := templ.GetChildren(ctx)
		if templ_7745c5c3_Var3 == nil {
			templ_7745c5c3_Var3 = templ.NopComponent
		}
		ctx = templ.ClearChildren(ctx)
		templ_7745c5c3_Err = templruntime.WriteString(templ_7745c5c3_Buffer, 2, "<script>\n\t\tRecipeBook.on('app:initialized', function() {\n\t\t\tconst form = document.getElementById('loginForm');\n\t\t\tif (!form) return;\n\t\t\t\n\t\t\tform.addEventListener('submit', async function(e) {\n\t\t\t\te.preventDefault();\n\t\t\t\t\n\t\t\t\tconst submitBtn = this.querySelector('button[type=\"submit\"]');\n\t\t\t\tconst removeLoading = RecipeBook.addLoadingState(submitBtn, 'Logging in...');\n\t\t\t\t\n\t\t\t\ttry {\n\t\t\t\t\tconst loginData = {\n\t\t\t\t\t\tusername: this.querySelector('#username').value.trim(),\n\t\t\t\t\t\tpassword: this.querySelector('#password').value\n\t\t\t\t\t};\n\t\t\t\t\t\n\t\t\t\t\tconst response = await RecipeBook.apiRequest('/api/login', {\n\t\t\t\t\t\tmethod: 'POST',\n\t\t\t\t\t\theaders: { 'Content-Type': 'application/json' },\n\t\t\t\t\t\tbody: JSON.stringify(loginData)\n\t\t\t\t\t});\n\t\t\t\t\t\n\t\t\t\t\tif (response.success) {\n\t\t\t\t\t\tRecipeBook.showNotification(response.message, 'success');\n\t\t\t\t\t\tsetTimeout(() => {\n\t\t\t\t\t\t\twindow.location.href = response.redirect || '/recipes';\n\t\t\t\t\t\t}, 1000);\n\t\t\t\t\t} else {\n\t\t\t\t\t\tRecipeBook.showNotification(response.error || 'Login failed', 'error');\n\t\t\t\t\t}\n\t\t\t\t} catch (error) {\n\t\t\t\t\tconsole.error('Login error:', error);\n\t\t\t\t\tRecipeBook.showNotification('Login failed. Please try again.', 'error');\n\t\t\t\t} finally {\n\t\t\t\t\tremoveLoading();\n\t\t\t\t}\n\t\t\t});\n\t\t});\n\t</script>")
		if templ_7745c5c3_Err != nil {
			return templ_7745c5c3_Err
		}
		return nil
	})
}

var _ = templruntime.GeneratedTemplate
