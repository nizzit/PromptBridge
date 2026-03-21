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

## The ThemeConfig resource holding all editable parameters.
@export var config: Resource:
	set(value):
		config = value
		notify_property_list_changed()

## Path to the output theme file (relative to res://)
@export var theme_output_path: String = "res://style/theme.tres"

## Path to the Panel StyleBox file (control.tres)
@export var panel_stylebox_path: String = "res://style/control.tres"

## Trigger generation from the Inspector via this button
@export_tool_button("Generate Theme", "ThemeDB") var _generate_action = _on_generate_pressed


func _on_generate_pressed() -> void:
	generate_theme()


## Generates and saves the theme based on current config values.
func generate_theme() -> void:
	if config == null:
		push_error("ThemeGenerator: No ThemeConfig assigned!")
		return

	if not (config is ThemeConfigScript):
		push_error("ThemeGenerator: config must be a ThemeConfig resource!")
		return

	# Use Resource.get() for property access to avoid type-cast issues in @tool context
	var cfg: Resource = config

	print("ThemeGenerator: Generating theme...")

	# --- Update Panel StyleBox (control.tres) ---
	_save_panel_stylebox(cfg)

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
	# Panel uses an external StyleBox (control.tres) — load it at runtime
	var panel_sb: StyleBox = load(panel_stylebox_path)
	if panel_sb:
		theme.set_stylebox("panel", "Panel", panel_sb)
	else:
		push_warning("ThemeGenerator: Could not load panel stylebox from: " + panel_stylebox_path)

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
	var err := ResourceSaver.save(theme, theme_output_path)
	if err == OK:
		print("ThemeGenerator: Theme saved to ", theme_output_path)
	else:
		push_error("ThemeGenerator: Failed to save theme! Error code: " + str(err))


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


## Saves/updates the Panel StyleBox (control.tres) with the highlight color.
func _save_panel_stylebox(cfg: Resource) -> void:
	var sb: StyleBoxFlat
	if ResourceLoader.exists(panel_stylebox_path):
		var loaded = load(panel_stylebox_path)
		if loaded is StyleBoxFlat:
			sb = loaded
		else:
			sb = StyleBoxFlat.new()
	else:
		sb = StyleBoxFlat.new()

	sb.bg_color = cfg.get("color_highlight")

	var err := ResourceSaver.save(sb, panel_stylebox_path)
	if err != OK:
		push_warning("ThemeGenerator: Could not save panel stylebox. Error: " + str(err))
