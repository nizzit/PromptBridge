extends Control

const LLMClient = preload("res://LLMClient.gd")
const ModelPicker = preload("res://ModelPicker.tscn")

const THEME_LIGHT = preload("res://style/theme.tres")
const THEME_DARK  = preload("res://style/theme_dark.tres")
const CONTENT_PANEL_LIGHT = preload("res://style/content_panel.tres")
const CONTENT_PANEL_DARK  = preload("res://style/content_panel_dark.tres")

var llm_client: Node
var current_editing_index: int = -1
var pending_shared_text: String = ""
var _all_models: Array = []
var _model_popup: PopupPanel = null
var _prompt_model_selected: String = ""  # currently selected model in PromptEditor

func _ready():
	# Initialize LLM Client
	llm_client = LLMClient.new()
	add_child(llm_client)
	llm_client.response_received.connect(_on_llm_response)
	llm_client.stream_chunk.connect(_on_llm_stream_chunk)
	llm_client.stream_finished.connect(_on_llm_stream_finished)
	llm_client.error_occurred.connect(_on_llm_error)
	llm_client.models_received.connect(_on_models_received)
	
	# Load settings into UI
	load_ui_from_settings()
	render_prompts_list()
	render_settings_prompts()
	
	# Check Android Intent
	if OS.get_name() == "Android":
		check_intent()

func _process(_delta):
	# Continuous check for intent updates if needed, though mostly handled in _ready
	if OS.get_name() == "Android":
		var android_runtime = Engine.get_singleton("AndroidRuntime")
		if android_runtime:
			var activity = android_runtime.getActivity()
			if activity:
				process_intent(activity)

func check_intent():
	var android_runtime = Engine.get_singleton("AndroidRuntime")
	if not android_runtime:
		# print("AndroidRuntime not available")
		return

	var activity = android_runtime.getActivity()
	if not activity:
		# print("Activity not available")
		return

	process_intent(activity)

func process_intent(activity):
	var Intent = JavaClassWrapper.wrap("android.content.Intent")
	var intent = activity.getIntent()
	
	if not intent:
		return
		
	var action = intent.getAction()
	var type = intent.getType()
	
	# Avoid processing the same intent multiple times if possible, 
	# but for now we just check if text is different or just display it.
	
	if action == Intent.ACTION_SEND and type == "text/plain":
		var shared_text = intent.getStringExtra(Intent.EXTRA_TEXT)
		if shared_text and shared_text != pending_shared_text:
			pending_shared_text = shared_text
			set_content_text(shared_text)
			
	elif action == "android.intent.action.PROCESS_TEXT":
		var process_text = intent.getStringExtra("android.intent.extra.PROCESS_TEXT")
		if process_text and process_text != pending_shared_text:
			pending_shared_text = process_text
			set_content_text(process_text)

func _unhandled_key_input(event):
	if event.is_pressed() and event.keycode == KEY_V and event.is_ctrl_pressed():
		var clipboard = DisplayServer.clipboard_get()
		if not clipboard.strip_edges().is_empty():
			set_content_text(clipboard)

func set_content_text(text: String):
	%ContentPlaceholderMargin.visible = false
	%PromptListScroll.visible = true
	%ContentText.text = text

func load_ui_from_settings():
	%ApiUrlInput.text = Global.settings.apiUrl
	%ApiTokenInput.text = Global.settings.apiToken
	
	# Show current model name on the button
	if not Global.settings.modelName.is_empty():
		%ModelInput.text = Global.settings.modelName
	else:
		%ModelInput.text = "Select a model"

	# Theme selector
	var saved_theme = Global.settings.get("theme", "light")
	%ThemeInput.select(0 if saved_theme == "light" else 1)
	apply_theme(saved_theme)

	# Trigger model fetch
	refresh_models()


## Applies the named theme ("light" or "dark") to the Background panel and Content panel.
func apply_theme(theme_name: String) -> void:
	var background := $Background as Panel
	var content := %Content as Panel
	if theme_name == "dark":
		background.theme = THEME_DARK
		content.add_theme_stylebox_override("panel", CONTENT_PANEL_DARK)
	else:
		background.theme = THEME_LIGHT
		content.add_theme_stylebox_override("panel", CONTENT_PANEL_LIGHT)


func _on_theme_input_item_selected(index: int) -> void:
	var theme_name = "light" if index == 0 else "dark"
	Global.settings["theme"] = theme_name
	Global.save_settings()
	apply_theme(theme_name)

func refresh_models():
	var api_url = Global.settings.apiUrl
	var api_token = Global.settings.apiToken
	
	if not api_url.is_empty() and not api_token.is_empty():
		llm_client.fetch_models(api_url, api_token)

func _on_models_received(models: Array):
	# Sort and store all models
	models.sort_custom(func(a, b): return a.id < b.id)
	_all_models = models

# ── Model picker popup ────────────────────────────────────────────────────────

func _on_model_input_pressed():
	_show_model_picker(false)

func _show_model_picker(show_default_option: bool = false):
	# Close any existing popup
	if _model_popup and is_instance_valid(_model_popup):
		_model_popup.queue_free()
	
	_model_popup = ModelPicker.instantiate()
	add_child(_model_popup)
	_model_popup.model_selected.connect(_on_model_selected.bind(show_default_option))
	_model_popup.show_picker(_all_models, show_default_option, get_viewport_rect().size)

func _on_model_selected(model_id: String, is_prompt_model: bool) -> void:
	if is_prompt_model:
		_prompt_model_selected = model_id
		%PromptModelInput.text = model_id if not model_id.is_empty() else "Default"
	else:
		Global.settings.modelName = model_id
		%ModelInput.text = model_id

func _on_prompt_model_input_pressed():
	_show_model_picker(true)

func save_ui_to_settings():
	Global.settings.apiUrl = %ApiUrlInput.text
	Global.settings.apiToken = %ApiTokenInput.text
	# modelName is saved directly when user picks from the popup (_populate_model_picker_list)
	# so no extra action needed here for ModelInput
	Global.save_settings()

func render_prompts_list():
	# Clear existing
	for child in %PromptList.get_children():
		child.queue_free()
		
	for i in range(Global.settings.prompts.size()):
		var prompt = Global.settings.prompts[i]
		var btn = Button.new()
		btn.text = prompt.name
		btn.custom_minimum_size = Vector2(0, 80)
		btn.pressed.connect(_on_prompt_clicked.bind(i))
		%PromptList.add_child(btn)

func _on_prompt_clicked(index: int):
	var prompt = Global.settings.prompts[index]
	var text_to_process = %ContentText.text
	
	if text_to_process.strip_edges().is_empty():
		# TODO: Show error toast?
		print("No text to process")
		return
		
	# Prepare API call
	var prompt_content = prompt.text
	var model = Global.settings.modelName
	if prompt.has("modelName") and prompt.modelName != null and not prompt.modelName.is_empty():
		model = prompt.modelName
		
	# Construct messages
	# Using user/system role depending on how sophisticated we want. 
	# Extension uses: User content = Full Prompt (System + User Text?) 
	# Actually extension logic:
	# it constructs: "fullPrompt"
	# Usually user defines prompt like: "Summarize this: {{text}}"
	# We need to replace {{text}} or similar, or just append.
	# The Extension's logic: 
	# `const fullPrompt = prompt.content.replace('{{text}}', selectedText);`
	# If {{text}} is missing, it likely appends.
	
	var full_msg = prompt_content
	if "{{text}}" in full_msg:
		full_msg = full_msg.replace("{{text}}", text_to_process)
	else:
		full_msg += "\n\n" + text_to_process
		
	var messages = [
		{"role": "user", "content": full_msg}
	]
	
	show_loading()
	llm_client.chat_completions(messages, model, Global.settings.apiUrl, Global.settings.apiToken)

func show_loading():
	%PromptListScroll.visible = false
	%ContentPlaceholderMargin.visible = false
	%ContentText.text = ""

func _on_llm_stream_chunk(chunk_text: String):
	# Append each streamed token directly to the display label
	%ContentPlaceholderMargin.visible = false
	%PromptListScroll.visible = false
	%ContentText.text += chunk_text

func _on_llm_stream_finished():
	# Streaming complete — nothing extra needed; response_received will fire with full text
	pass

func _on_llm_response(response_text):
	# Called after streaming finishes with the full accumulated text.
	# The text is already displayed via stream_chunk; this is a no-op for streaming,
	# but kept for compatibility in case streaming is bypassed.
	%ContentPlaceholderMargin.visible = false
	%PromptListScroll.visible = false
	if %ContentText.text.is_empty():
		%ContentText.text = response_text

func _on_llm_error(error_msg):
	%ContentPlaceholderMargin.visible = false
	%PromptListScroll.visible = false
	%ContentText.text = "Error: " + error_msg

# UI Event Handlers
func _on_menu_button_pressed():
	%Settings.visible = true
	%MainView.visible = false
	# Refresh models when entering settings if possible
	refresh_models()
	render_settings_prompts()

func _on_close_settings_button_pressed():
	save_ui_to_settings()
	render_prompts_list() # Refresh main list
	%Settings.visible = false
	%MainView.visible = true

func _on_import_settings_button_pressed():
	var clipboard_text = DisplayServer.clipboard_get()
	if clipboard_text.strip_edges().is_empty():
		# TODO: Notify user empty clipboard
		return
		
	if Global.import_settings_from_json(clipboard_text):
		load_ui_from_settings()
		render_settings_prompts()
		# TODO: Notify success
	else:
		# TODO: Notify failure
		pass

func _on_export_settings_button_pressed():
	# Ensure current UI values are saved first (or just use what's in settings if we trust it matches UI)
	# Saving UI to settings first is safer to capture unsaved edits
	save_ui_to_settings()
	
	var json_str = Global.export_settings_to_json()
	DisplayServer.clipboard_set(json_str)
	# TODO: Notify copied

# Settings Prompts Management
func render_settings_prompts():
	for child in %PromptsContainer.get_children():
		child.queue_free()
		
	for i in range(Global.settings.prompts.size()):
		var prompt = Global.settings.prompts[i]
		var hbox = HBoxContainer.new()
		
		var lbl = Label.new()
		lbl.text = prompt.name
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hbox.add_child(lbl)
		
		var edit_btn = Button.new()
		edit_btn.text = "EDIT"
		edit_btn.custom_minimum_size = Vector2(0, 80)
		edit_btn.pressed.connect(open_prompt_editor.bind(i))
		hbox.add_child(edit_btn)
		
		var del_btn = Button.new()
		del_btn.text = "DEL"
		del_btn.custom_minimum_size = Vector2(0, 80)
		del_btn.pressed.connect(delete_prompt.bind(i))
		hbox.add_child(del_btn)
		
		%PromptsContainer.add_child(hbox)

func _on_add_prompt_button_pressed():
	open_prompt_editor(-1)

func open_prompt_editor(index: int):
	current_editing_index = index
	%PromptEditor.visible = true
	%Settings.visible = false
	
	var stored_prompt_model = ""
	var prompt_name = ""
	var prompt_text = ""
	
	if index >= 0:
		var prompt = Global.settings.prompts[index]
		prompt_name = prompt.name
		prompt_text = prompt.text
		stored_prompt_model = prompt.get("modelName", "")
	
	%NameInput.text = prompt_name
	%ContentInput.text = prompt_text
	
	# Set the model button label and internal state
	_prompt_model_selected = stored_prompt_model
	if stored_prompt_model.is_empty():
		%PromptModelInput.text = "Default"
	else:
		%PromptModelInput.text = stored_prompt_model

func _on_prompt_cancel_button_pressed():
	%PromptEditor.visible = false
	%Settings.visible = true

func _on_prompt_save_button_pressed():
	var prompt_name = %NameInput.text
	var text = %ContentInput.text
	var model = _prompt_model_selected  # set by _populate_prompt_model_picker_list
	
	if prompt_name.is_empty() or text.is_empty():
		print("Name and text required")
		return
		
	if current_editing_index >= 0:
		Global.update_prompt(current_editing_index, prompt_name, text, model)
	else:
		Global.add_prompt(prompt_name, text, model)
		
	_on_prompt_cancel_button_pressed() # Close editor
	render_settings_prompts() # Refresh list

func delete_prompt(index: int):
	Global.delete_prompt(index)
	render_settings_prompts()

func share_text_android(text):
	if not Engine.has_singleton("AndroidRuntime"):
		return
		
	var Intent = JavaClassWrapper.wrap("android.content.Intent")
	var intent = Intent.new()
	intent.setAction(Intent.ACTION_SEND)
	intent.setType("text/plain")
	intent.putExtra(Intent.EXTRA_TEXT, text)
	
	var android_runtime = Engine.get_singleton("AndroidRuntime")
	var activity = android_runtime.getActivity()
	
	# createChooser
	var chooser = Intent.createChooser(intent, "Share Result")
	activity.startActivity(chooser)
