@tool
class_name ThemeGenerator
extends Node

## ThemeGenerator — regenerates theme.tres from ThemeConfig parameters.
## Usage:
##   1. Open the ThemeGenerator scene in the Godot editor.
##   2. Select the ThemeGenerator node.
##   3. Assign or edit the `config` property in the Inspector.
##   4. Click "Generate Theme" button (or call generate_theme() from code).

const ThemeConfigScript = preload("res://style/theme_config.gd")

@export_group("Light Theme")

## The ThemeConfig resource for the light theme.
@export var config: Resource:
	set(value):
		config = value
		notify_property_list_changed()

## Path to the output theme file for the light theme.
@export var theme_output_path: String = "res://style/theme.tres"

## Path to the Panel StyleBox file used by the light theme (control.tres).
@export var panel_stylebox_path: String = "res://style/control.tres"

## Path to the Content Panel StyleBox file for the light theme.
@export var content_panel_path: String = "res://style/content_panel.tres"

## Generate and save the light theme.
@export_tool_button("Generate Light Theme", "ThemeDB") var _generate_action = _on_generate_pressed

@export_group("Dark Theme")

## The ThemeConfig resource for the dark theme.
@export var config_dark: Resource:
	set(value):
		config_dark = value
		notify_property_list_changed()

## Path to the output theme file for the dark theme.
@export var theme_output_path_dark: String = "res://style/theme_dark.tres"

## Path to the Panel StyleBox file used by the dark theme (control_dark.tres).
@export var panel_stylebox_path_dark: String = "res://style/control_dark.tres"

## Path to the Content Panel StyleBox file for the dark theme.
@export var content_panel_path_dark: String = "res://style/content_panel_dark.tres"

## Generate and save the dark theme.
@export_tool_button("Generate Dark Theme", "ThemeDB") var _generate_dark_action = _on_generate_dark_pressed


func _on_generate_pressed() -> void:
	generate_theme()


func _on_generate_dark_pressed() -> void:
	generate_theme_dark()


## Generates and saves the light theme.
func generate_theme() -> void:
	_generate(config, theme_output_path, panel_stylebox_path, content_panel_path, "light")


## Generates and saves the dark theme.
func generate_theme_dark() -> void:
	_generate(config_dark, theme_output_path_dark, panel_stylebox_path_dark, content_panel_path_dark, "dark")


## Internal: builds and saves a theme from the given config.
func _generate(cfg_res: Resource, out_path: String, panel_sb_path: String, content_sb_path: String, label: String) -> void:
	if cfg_res == null:
		push_error("ThemeGenerator: No ThemeConfig assigned for %s theme!" % label)
		return

	if not (cfg_res is ThemeConfigScript):
		push_error("ThemeGenerator: config_%s must be a ThemeConfig resource!" % label)
		return

	var cfg: Resource = cfg_res
	print("ThemeGenerator: Generating %s theme..." % label)

	# --- Update Panel StyleBox (background) ---
	_save_panel_stylebox(cfg, panel_sb_path)

	# --- Update Content Panel StyleBox ---
	_save_content_panel_stylebox(cfg, content_sb_path)

	# --- Build the Theme ---
	var theme := Theme.new()

	var c_primary:   Color = cfg.get("color_primary")
	var c_hover:     Color = cfg.get("color_hover")
	var c_pressed:   Color = cfg.get("color_pressed")
	var c_highlight: Color = cfg.get("color_highlight")

	# ── Button ──────────────────────────────────────────────────────────────
	theme.set_stylebox("hover",   "Button", _make_flat(cfg, c_hover,    true))
	theme.set_stylebox("normal",  "Button", _make_flat(cfg, c_primary,  true))
	theme.set_stylebox("pressed", "Button", _make_flat(cfg, c_pressed,  true))

	# ── HBoxContainer ───────────────────────────────────────────────────────
	theme.set_constant("separation", "HBoxContainer", cfg.get("hbox_separation"))

	# ── LineEdit ────────────────────────────────────────────────────────────
	theme.set_stylebox("focus",  "LineEdit", _make_flat_border(cfg, c_primary))
	theme.set_stylebox("normal", "LineEdit", _make_flat_border(cfg, c_primary, true))

	# ── OptionButton ────────────────────────────────────────────────────────
	# All states must have the same content_margin to prevent text shifting on hover
	theme.set_constant("arrow_margin", "OptionButton", cfg.get("option_button_arrow_margin"))
	theme.set_stylebox("hover",        "OptionButton", _make_flat(cfg, c_hover,    true))
	theme.set_stylebox("hover_pressed","OptionButton", _make_flat(cfg, c_hover,    true))
	theme.set_stylebox("normal",       "OptionButton", _make_flat(cfg, c_primary,  true))
	theme.set_stylebox("pressed",      "OptionButton", _make_flat(cfg, c_pressed,  true))

	# ── Panel ────────────────────────────────────────────────────────────────
	# Panel uses an external StyleBox — load it at runtime
	var panel_sb: StyleBox = load(panel_sb_path)
	if panel_sb:
		theme.set_stylebox("panel", "Panel", panel_sb)
	else:
		push_warning("ThemeGenerator: Could not load panel stylebox from: " + panel_sb_path)

	# ── PopupMenu ────────────────────────────────────────────────────────────
	theme.set_stylebox("hover", "PopupMenu", _make_flat(cfg, c_primary,   false))
	theme.set_stylebox("panel", "PopupMenu", _make_flat(cfg, c_highlight, false))

	# ── TextEdit ─────────────────────────────────────────────────────────────
	theme.set_stylebox("normal", "TextEdit", _make_flat_border_all(cfg, c_primary))

	# ── RichTextLabel ────────────────────────────────────────────────────────
	var c_content_bg:   Color = cfg.get("content_bg_color")
	var c_content_text: Color = cfg.get("content_text_color")
	var content_corner: int   = cfg.get("content_panel_corner_radius")
	theme.set_color("default_color", "RichTextLabel", c_content_text)
	theme.set_stylebox("normal", "RichTextLabel", _make_flat_custom(c_content_bg, content_corner))

	# --- Save ---
	var err := ResourceSaver.save(theme, out_path)
	if err == OK:
		print("ThemeGenerator: %s theme saved to %s" % [label.capitalize(), out_path])
	else:
		push_error("ThemeGenerator: Failed to save %s theme! Error code: %s" % [label, str(err)])


# ── Helpers ──────────────────────────────────────────────────────────────────

## Creates a StyleBoxFlat with optional horizontal content margins.
func _make_flat(cfg: Resource, color: Color, with_margin: bool) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.corner_radius_top_left     = cfg.get("corner_radius")
	sb.corner_radius_top_right    = cfg.get("corner_radius")
	sb.corner_radius_bottom_right = cfg.get("corner_radius")
	sb.corner_radius_bottom_left  = cfg.get("corner_radius")
	if with_margin:
		sb.content_margin_left  = cfg.get("content_margin_horizontal")
		sb.content_margin_right = cfg.get("content_margin_horizontal")
	return sb


## Creates a StyleBoxFlat with left+right border (for LineEdit normal/focus).
## When `filled` is true, adds corner_detail = 10 (hover_pressed style).
func _make_flat_border(cfg: Resource, color: Color, filled: bool = false) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.border_width_left  = cfg.get("border_width")
	sb.border_width_right = cfg.get("border_width")
	sb.border_color = color
	sb.corner_radius_top_left     = cfg.get("corner_radius")
	sb.corner_radius_top_right    = cfg.get("corner_radius")
	sb.corner_radius_bottom_right = cfg.get("corner_radius")
	sb.corner_radius_bottom_left  = cfg.get("corner_radius")
	if filled:
		sb.corner_detail = 10
	return sb


## Creates a StyleBoxFlat with all-sides border (for TextEdit normal).
func _make_flat_border_all(cfg: Resource, color: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.border_width_left   = cfg.get("border_width")
	sb.border_width_top    = cfg.get("border_width")
	sb.border_width_right  = cfg.get("border_width")
	sb.border_width_bottom = cfg.get("border_width")
	sb.border_color = color
	sb.corner_radius_top_left     = cfg.get("corner_radius")
	sb.corner_radius_top_right    = cfg.get("corner_radius")
	sb.corner_radius_bottom_right = cfg.get("corner_radius")
	sb.corner_radius_bottom_left  = cfg.get("corner_radius")
	return sb


## Creates a StyleBoxFlat with a custom corner radius (no margins, no border).
func _make_flat_custom(color: Color, corner: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.corner_radius_top_left     = corner
	sb.corner_radius_top_right    = corner
	sb.corner_radius_bottom_right = corner
	sb.corner_radius_bottom_left  = corner
	return sb


## Saves/updates the Content Panel StyleBox (content_panel.tres) with bg and corner from config.
func _save_content_panel_stylebox(cfg: Resource, sb_path: String) -> void:
	var sb: StyleBoxFlat
	if ResourceLoader.exists(sb_path):
		var loaded = load(sb_path)
		if loaded is StyleBoxFlat:
			sb = loaded
		else:
			sb = StyleBoxFlat.new()
	else:
		sb = StyleBoxFlat.new()

	var corner: int = cfg.get("content_panel_corner_radius")
	sb.bg_color = cfg.get("content_bg_color")
	sb.corner_radius_top_left     = corner
	sb.corner_radius_top_right    = corner
	sb.corner_radius_bottom_right = corner
	sb.corner_radius_bottom_left  = corner

	var err := ResourceSaver.save(sb, sb_path)
	if err != OK:
		push_warning("ThemeGenerator: Could not save content panel stylebox to %s. Error: %s" % [sb_path, str(err)])


## Saves/updates a Panel StyleBox file with the highlight color from config.
func _save_panel_stylebox(cfg: Resource, sb_path: String) -> void:
	var sb: StyleBoxFlat
	if ResourceLoader.exists(sb_path):
		var loaded = load(sb_path)
		if loaded is StyleBoxFlat:
			sb = loaded
		else:
			sb = StyleBoxFlat.new()
	else:
		sb = StyleBoxFlat.new()

	sb.bg_color = cfg.get("color_highlight")

	var err := ResourceSaver.save(sb, sb_path)
	if err != OK:
		push_warning("ThemeGenerator: Could not save panel stylebox to %s. Error: %s" % [sb_path, str(err)])
