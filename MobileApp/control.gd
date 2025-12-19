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
	%ModelInput.text = Global.settings.modelName

func save_ui_to_settings():
	Global.settings.apiUrl = %ApiUrlInput.text
	Global.settings.apiToken = %ApiTokenInput.text
	Global.settings.modelName = %ModelInput.text
	Global.save_settings()

func render_prompts_list():
	# Clear existing
	for child in %PromptList.get_children():
		child.queue_free()
		
	for i in range(Global.settings.prompts.size()):
		var prompt = Global.settings.prompts[i]
		var btn = Button.new()
		btn.text = prompt.name
		btn.custom_minimum_size = Vector2(0, 60)
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
		{ "role": "user", "content": full_msg }
	]
	
	show_loading()
	llm_client.chat_completions(messages, model, Global.settings.apiUrl, Global.settings.apiToken)

func show_loading():
	%ResultView.visible = true
	%ResultText.text = "Loading..."
	%MainView.visible = false

func _on_llm_response(response_text):
	%ResultText.text = response_text

func _on_llm_error(error_msg):
	%ResultText.text = "Error: " + error_msg

# UI Event Handlers
func _on_menu_button_pressed():
	%Settings.visible = true
	%MainView.visible = false
	render_settings_prompts()

func _on_close_settings_button_pressed():
	save_ui_to_settings()
	render_prompts_list() # Refresh main list
	%Settings.visible = false
	%MainView.visible = true

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
		edit_btn.pressed.connect(open_prompt_editor.bind(i))
		hbox.add_child(edit_btn)
		
		var del_btn = Button.new()
		del_btn.text = "DEL"
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
	
	if index >= 0:
		var prompt = Global.settings.prompts[index]
		%NameInput.text = prompt.name
		%ContentInput.text = prompt.text
		%PromptModelInput.text = prompt.get("modelName", "")
	else:
		%NameInput.text = ""
		%ContentInput.text = ""
		%PromptModelInput.text = ""

func _on_prompt_cancel_button_pressed():
	%PromptEditor.visible = false
	%Settings.visible = true

func _on_prompt_save_button_pressed():
	var name = %NameInput.text
	var text = %ContentInput.text
	var model = %PromptModelInput.text
	
	if name.is_empty() or text.is_empty():
		print("Name and text required")
		return
		
	if current_editing_index >= 0:
		Global.update_prompt(current_editing_index, name, text, model)
	else:
		Global.add_prompt(name, text, model)
		
	_on_prompt_cancel_button_pressed() # Close editor
	render_settings_prompts() # Refresh list

func delete_prompt(index: int):
	Global.delete_prompt(index)
	render_settings_prompts()

# Result View Actions
func _on_result_back_button_pressed():
	%ResultView.visible = false
	%MainView.visible = true

func _on_copy_button_pressed():
	DisplayServer.clipboard_set(%ResultText.text)
	# Feedback?

func _on_share_button_pressed():
	# Use Android intent to share text
	if OS.get_name() == "Android":
		# Not strictly implemented in existing extensions, 
		# but typical godot-android-share plugins exist.
		# For now, we print or try a basic intent if possible using `JavaClassWrapper`.
		share_text_android(%ResultText.text)
	else:
		print("Sharing: " + %ResultText.text)

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
