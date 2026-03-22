extends PopupPanel

signal model_selected(model_id: String)

@onready var filter_input: LineEdit = $VBoxContainer/FilterInput
@onready var model_list_container: VBoxContainer = $VBoxContainer/ScrollContainer/ModelListContainer

var _models: Array = []
var _show_default_option: bool = false

func _ready():
	filter_input.text_changed.connect(_on_filter_changed)
	
	# Focus filter input when popup is shown
	popup_hide.connect(_on_popup_hide)

func show_picker(models: Array, show_default: bool = false, screen_size: Vector2 = Vector2.ZERO) -> void:
	_models = models
	_show_default_option = show_default
	
	_populate_list("")
	
	if screen_size == Vector2.ZERO:
		screen_size = get_viewport().get_visible_rect().size
	
	var popup_size = Vector2(screen_size.x * 0.85, screen_size.y * 0.75)
	popup_centered(popup_size)
	
	# Focus filter input for immediate typing
	filter_input.grab_focus()

func _populate_list(filter: String) -> void:
	# Clear existing children
	for child in model_list_container.get_children():
		child.queue_free()
	
	var filter_lower = filter.to_lower()
	
	# Add "Default" option if requested
	if _show_default_option:
		if filter.is_empty() or "default".contains(filter_lower):
			var default_btn = Button.new()
			default_btn.text = "Default"
			default_btn.custom_minimum_size = Vector2(0, 80)
			default_btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
			default_btn.pressed.connect(func():
				model_selected.emit("")
				hide()
			)
			model_list_container.add_child(default_btn)
	
	# Add model buttons
	for m in _models:
		if filter.is_empty() or m.id.to_lower().contains(filter_lower):
			var btn = Button.new()
			btn.text = m.id
			btn.custom_minimum_size = Vector2(0, 80)
			btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
			btn.clip_text = true
			var model_id = m.id
			btn.pressed.connect(func():
				model_selected.emit(model_id)
				hide()
			)
			model_list_container.add_child(btn)
	
	# If no models loaded yet, show placeholder
	if _models.is_empty() and filter.is_empty():
		var lbl = Label.new()
		lbl.text = "No models loaded. Check API settings."
		model_list_container.add_child(lbl)

func _on_filter_changed(filter_text: String) -> void:
	_populate_list(filter_text)

func _on_popup_hide() -> void:
	# Clear filter when closing
	filter_input.text = ""
