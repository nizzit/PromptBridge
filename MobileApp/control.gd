extends Node

func _ready():
	if OS.get_name() != "Android":
		return

	var android_runtime = Engine.get_singleton("AndroidRuntime")
	if not android_runtime:
		print("AndroidRuntime не доступен")
		return

	var activity = android_runtime.getActivity()
	if not activity:
		print("Activity не получена")
		return

	process_intent(activity)

func _process(_delta):
	if OS.get_name() != "Android":
		return

	var android_runtime = Engine.get_singleton("AndroidRuntime")
	if not android_runtime:
		return

	var activity = android_runtime.getActivity()
	if activity:
		process_intent(activity)

func process_intent(activity):
	var Intent = JavaClassWrapper.wrap("android.content.Intent")
	var intent = activity.getIntent()
	if intent:
		var action = intent.getAction()
		if action == Intent.ACTION_SEND:
			var mime_type = intent.getType()
			if mime_type == "text/plain":
				var shared_text = intent.getStringExtra(Intent.EXTRA_TEXT)
				if shared_text:
					print("Получен новый текст из шаринга: ", shared_text)
					%EmptyContainer.visible = false
					%Label.text = shared_text
			else:
				print("Неподдерживаемый MIME-тип: ", mime_type)
		elif action == "android.intent.action.PROCESS_TEXT":  # Или Intent.ACTION_PROCESS_TEXT, если оно определено как строка
			var process_text = intent.getStringExtra("android.intent.extra.PROCESS_TEXT")  # Или Intent.EXTRA_PROCESS_TEXT
			var readonly = intent.getBooleanExtra("android.intent.extra.PROCESS_TEXT_READONLY", false)
			if process_text:
				print("Получен текст для обработки: ", process_text)
				%ContentPlaceholderMargin.visible = false
				%ContentText.text = process_text
				if not readonly:
					# Пример модификации текста
					var modified_text = process_text.to_upper()
					# Создаем новый Intent для результата
					var resultIntent = Intent.Intent()  # Вызов конструктора
					resultIntent.putExtra("android.intent.extra.PROCESS_TEXT", modified_text)
					# Получаем константы Activity
					var Activity = JavaClassWrapper.wrap("android.app.Activity")
					activity.setResult(Activity.RESULT_OK, resultIntent)
					# activity.finish()  # Опционально: закрыть activity после обработки (может закрыть приложение)
			else:
				print("Текст для обработки не найден")

func _on_menu_button_pressed() -> void:
	%Settings.visible = true
	%MainView.visible = false

func _on_close_settings_button_pressed() -> void:
	%MainView.visible = true
	%Settings.visible = false
