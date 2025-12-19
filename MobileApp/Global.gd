extends Node

var settings_file_path = "user://settings.json"
var settings = {
	"apiUrl": "https://api.openai.com/v1",
	"apiToken": "",
	"modelName": "gpt-3.5-turbo",
	"prompts": []
}

func _ready():
	load_settings()

func load_settings():
	if FileAccess.file_exists(settings_file_path):
		var file = FileAccess.open(settings_file_path, FileAccess.READ)
		var content = file.get_as_text()
		var json = JSON.new()
		var error = json.parse(content)
		if error == OK:
			var loaded_settings = json.data
			# Merge loaded settings with defaults to ensure all keys exist
			for key in settings.keys():
				if loaded_settings.has(key):
					settings[key] = loaded_settings[key]
			print("Settings loaded")
		else:
			print("Error parsing settings: ", json.get_error_message())
	else:
		print("Settings file not found, using defaults")
		save_settings()

func save_settings():
	var file = FileAccess.open(settings_file_path, FileAccess.WRITE)
	var json_string = JSON.stringify(settings, "\t")
	file.store_string(json_string)
	print("Settings saved")

func add_prompt(prompt_name: String, text: String, model: String = ""):
	var new_prompt = {
		"name": prompt_name,
		"text": text,
		"modelName": model
	}
	settings.prompts.append(new_prompt)
	save_settings()

func update_prompt(index: int, prompt_name: String, text: String, model: String = ""):
	if index >= 0 and index < settings.prompts.size():
		settings.prompts[index] = {
			"name": prompt_name,
			"text": text,
			"modelName": model
		}
		save_settings()

func delete_prompt(index: int):
	if index >= 0 and index < settings.prompts.size():
		settings.prompts.remove_at(index)
		save_settings()

func get_prompts():
	return settings.prompts

func export_settings_to_json() -> String:
	var export_data = {
		"exportDate": Time.get_datetime_string_from_system(true, true),
		"settings": settings
	}
	return JSON.stringify(export_data, "\t")

func import_settings_from_json(json_string: String) -> bool:
	var json = JSON.new()
	var error = json.parse(json_string)
	if error != OK:
		print("JSON Parse Error: ", json.get_error_message())
		return false
		
	var data = json.data
	if not data is Dictionary:
		return false
		
	var new_settings = {}
	
	# Handle both wrapped format ("settings": {...}) and raw format
	if data.has("settings") and data.settings is Dictionary:
		new_settings = data.settings
	else:
		new_settings = data
		
	# Update fields
	if new_settings.has("apiUrl"): settings.apiUrl = new_settings.apiUrl
	if new_settings.has("apiToken"): settings.apiToken = new_settings.apiToken
	if new_settings.has("modelName"): settings.modelName = new_settings.modelName
	
	# Import prompts
	if new_settings.has("prompts") and new_settings.prompts is Array:
		settings.prompts.clear()
		for p in new_settings.prompts:
			if p is Dictionary and p.has("name") and p.has("text"):
				var new_prompt = {
					"name": str(p.name),
					"text": str(p.text),
					"modelName": ""
				}
				if p.has("modelName"):
					new_prompt.modelName = str(p.modelName)
				settings.prompts.append(new_prompt)
	
	save_settings()
	return true
