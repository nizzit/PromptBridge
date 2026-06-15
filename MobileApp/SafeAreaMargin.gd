extends MarginContainer

func _ready():
	_update_margins()
	get_tree().root.size_changed.connect(_update_margins)

func _update_margins():
	# Capture the defaults (from inspector 'Theme Overrides' or the Theme resource)
	var default_top = get_theme_constant("margin_top")
	var default_bottom = get_theme_constant("margin_bottom")
	var default_left = get_theme_constant("margin_left")
	var default_right = get_theme_constant("margin_right")

	# Calculate Safe Area
	var safe_area = DisplayServer.get_display_safe_area()
	var window_size = DisplayServer.window_get_size()
	
	if safe_area == Rect2i(0, 0, 0, 0):
		safe_area = Rect2i(Vector2i.ZERO, window_size)

	var safe_top = safe_area.position.y
	var safe_bottom = window_size.y - safe_area.end.y
	var safe_left = safe_area.position.x
	var safe_right = window_size.x - safe_area.end.x
	
	# Apply max(safe, default)
	add_theme_constant_override("margin_top", max(safe_top, default_top))
	add_theme_constant_override("margin_bottom", max(safe_bottom, default_bottom))
	add_theme_constant_override("margin_left", max(safe_left, default_left))
	add_theme_constant_override("margin_right", max(safe_right, default_right))
