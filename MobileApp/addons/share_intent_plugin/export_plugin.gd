@tool
extends EditorPlugin

var export_plugin: AndroidExportPlugin

func _enter_tree():
	export_plugin = AndroidExportPlugin.new()
	add_export_plugin(export_plugin)

func _exit_tree():
	remove_export_plugin(export_plugin)
	export_plugin = null

class AndroidExportPlugin extends EditorExportPlugin:
	func _supports_platform(platform):
		return platform is EditorExportPlatformAndroid


	func _get_name():
		return "MyManifestPlugin"

	func _get_android_manifest_activity_element_contents(platform: EditorExportPlatform, debug: bool) -> String:
		return """
		<intent-filter>
			<action android:name="android.intent.action.SEND" />
			<category android:name="android.intent.category.DEFAULT" />
			<data android:mimeType="text/plain" />
        </intent-filter>
	
		<intent-filter>
			<action android:name="android.intent.action.PROCESS_TEXT" />
			<category android:name="android.intent.category.DEFAULT" />
			<data android:mimeType="text/plain" />
    	</intent-filter>
		
		<intent-filter>
			<action android:name="android.intent.action.VIEW" />
			<category android:name="android.intent.category.DEFAULT" />
			<category android:name="android.intent.category.BROWSABLE" />
			<data android:scheme="http" />
			<data android:scheme="https" />
	    </intent-filter>
		"""
