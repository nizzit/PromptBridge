@tool
class_name ThemeConfig
extends Resource

## Configuration resource for UI theme generation.
## Edit these parameters in the Godot Inspector and use ThemeGenerator to apply them.

@export_group("Colors")

## Primary color used for normal/default state of buttons, inputs, etc.
@export var color_primary: Color = Color(0.2901961, 0.24705882, 0.72156864, 1.0)

## Hover state color (slightly darker than primary)
@export var color_hover: Color = Color(0.23560008, 0.2052, 0.57, 1.0)

## Pressed/active state color (darkest)
@export var color_pressed: Color = Color(0.16283873, 0.12970677, 0.44546074, 1.0)

## Highlight/accent color (lighter than primary, used for PopupMenu panel and Panel background)
@export var color_highlight: Color = Color(0.48235294, 0.4392157, 0.8784314, 1.0)

@export_group("Shape")

## Corner radius for all rounded elements
@export var corner_radius: int = 10

## Content margin (left and right padding) for buttons and input fields
@export var content_margin_horizontal: float = 20.0

## Border width used for focus/hover states (LineEdit focus, TextEdit, OptionButton hover)
@export var border_width: int = 20

@export_group("Spacing")

## Separation between items in HBoxContainer
@export var hbox_separation: int = 20

## Arrow margin for OptionButton
@export var option_button_arrow_margin: int = 20
