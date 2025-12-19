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

func add_prompt(name: String, text: String, model: String = ""):
	var new_prompt = {
		"name": name,
		"text": text,
		"modelName": model
	}
	settings.prompts.append(new_prompt)
	save_settings()

func update_prompt(index: int, name: String, text: String, model: String = ""):
	if index >= 0 and index < settings.prompts.size():
		settings.prompts[index] = {
			"name": name,
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
