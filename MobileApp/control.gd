extends Control

const LLMClient = preload("res://LLMClient.gd")

var llm_client: Node
var current_editing_index: int = -1
var pending_shared_text: String = ""

func _ready():
	# Initialize LLM Client
	llm_client = LLMClient.new()
	add_child(llm_client)
	llm_client.response_received.connect(_on_llm_response)
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
	
	# Initialize Model OptionButton with saved model if any
	%ModelInput.clear()
	if not Global.settings.modelName.is_empty():
		%ModelInput.add_item(Global.settings.modelName)
		%ModelInput.select(0)
	else:
		%ModelInput.add_item("Select a model")
		%ModelInput.set_item_disabled(0, true)
		
	# Trigger model fetch
	refresh_models()

func refresh_models():
	var api_url = Global.settings.apiUrl
	var api_token = Global.settings.apiToken
	
	if not api_url.is_empty() and not api_token.is_empty():
		llm_client.fetch_models(api_url, api_token)

func _on_models_received(models: Array):
	# Update Main Model Dropdown
	var current_model = Global.settings.modelName
	if %ModelInput.item_count > 0 and %ModelInput.get_selected_id() != -1:
		# If user changed it in the meantime, might want to keep? 
		# But usually we just refresh list.
		pass
		
	populate_model_params(%ModelInput, models, current_model)
	
	# Update Prompt Model Dropdown if visible
	var current_prompt_model = ""
	if %PromptEditor.visible:
		# Get currently selected text if any
		if %PromptModelInput.selected != -1:
			current_prompt_model = %PromptModelInput.get_item_text(%PromptModelInput.selected)
			if current_prompt_model == "Default": current_prompt_model = ""
	
	populate_model_params(%PromptModelInput, models, current_prompt_model, true)

func populate_model_params(option_button: OptionButton, models: Array, current_selection: String, include_default: bool = false):
	option_button.clear()
	
	if include_default:
		option_button.add_item("Default") # Value ""
	
	# Sort models by id
	models.sort_custom(func(a, b): return a.id < b.id)
	
	var idx_to_select = -1
	for i in range(models.size()):
		var m = models[i]
		option_button.add_item(m.id)
		if m.id == current_selection:
			# Account for default item if present
			idx_to_select = i + (1 if include_default else 0)
			
	if idx_to_select != -1:
		option_button.select(idx_to_select)
	elif include_default and current_selection.is_empty():
		option_button.select(0)
	elif not include_default and not current_selection.is_empty():
		# Current model not in fresh list, add it?
		# JS logic: "Restore previously selected model if it exists in the new list"
		# If it doesn't exist, we might want to add it as a fallback or leave unselected.
		# Let's add it to ensure it's not lost.
		option_button.add_item(current_selection)
		option_button.select(option_button.item_count - 1)

func save_ui_to_settings():
	Global.settings.apiUrl = %ApiUrlInput.text
	Global.settings.apiToken = %ApiTokenInput.text
	
	if %ModelInput.selected != -1:
		Global.settings.modelName = %ModelInput.get_item_text(%ModelInput.selected)
		# Handle "Select a model" placeholder if accidentally selected? 
		# Should be disabled.
	
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
	%ContentText.text = "Processing..."

func _on_llm_response(response_text):
	%ContentPlaceholderMargin.visible = false
	%PromptListScroll.visible = false
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
	%Settings.visible = false # Hide settings momentarily or keep behind?
	# Stack: Main -> Settings -> PromptEditor. 
	# Hiding Settings ensures clean focus.
	
	# Prepare model dropdown (PromptModelInput) - should already be populated if fetch happened
	# But if fetch failed, we might need to populate with stored value
	
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
	
	# Select correct model in dropdown
	# If dropdown is empty (no fetch yet), just add this one
	if %PromptModelInput.item_count == 0:
		%PromptModelInput.add_item("Default")
		if not stored_prompt_model.is_empty():
			%PromptModelInput.add_item(stored_prompt_model)
			%PromptModelInput.select(1)
		else:
			%PromptModelInput.select(0)
	else:
		# Try to find it
		var found = false
		for i in range(%PromptModelInput.item_count):
			var txt = %PromptModelInput.get_item_text(i)
			if txt == stored_prompt_model or (stored_prompt_model.is_empty() and txt == "Default"):
				%PromptModelInput.select(i)
				found = true
				break
		if not found and not stored_prompt_model.is_empty():
			%PromptModelInput.add_item(stored_prompt_model)
			%PromptModelInput.select(%PromptModelInput.item_count - 1)

func _on_prompt_cancel_button_pressed():
	%PromptEditor.visible = false
	%Settings.visible = true

func _on_prompt_save_button_pressed():
	var prompt_name = %NameInput.text
	var text = %ContentInput.text
	
	var model = ""
	if %PromptModelInput.selected != -1:
		model = %PromptModelInput.get_item_text(%PromptModelInput.selected)
		if model == "Default": model = ""
	
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
