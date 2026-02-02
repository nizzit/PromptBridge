extends Node

signal response_received(response_text)
signal error_occurred(error_message)
signal models_received(models)

var http_request: HTTPRequest
var model_http_request: HTTPRequest

func _ready():
	http_request = HTTPRequest.new()
	add_child(http_request)
	http_request.request_completed.connect(_on_request_completed)
	
	model_http_request = HTTPRequest.new()
	add_child(model_http_request)
	model_http_request.request_completed.connect(_on_model_request_completed)

func chat_completions(messages: Array, model: String, api_url: String, api_token: String):
	if api_url.is_empty() or api_token.is_empty():
		error_occurred.emit("API URL and Token are required")
		return

	var endpoint = api_url
	if not endpoint.ends_with("/"):
		endpoint += "/"
	if not endpoint.ends_with("chat/completions"):
		endpoint += "chat/completions"

	var headers = [
		"Content-Type: application/json",
		"Authorization: Bearer " + api_token
	]

	var body = JSON.stringify({
		"model": model,
		"messages": messages
	})

	var error = http_request.request(endpoint, headers, HTTPClient.METHOD_POST, body)
	if error != OK:
		error_occurred.emit("Failed to make HTTP request: " + str(error))

func fetch_models(api_url: String, api_token: String):
	if api_url.is_empty() or api_token.is_empty():
		error_occurred.emit("API URL and Token are required")
		return

	# Abort any in-progress model request to avoid ERR_BUSY (44) when refreshing quickly
	if model_http_request.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		model_http_request.cancel_request()

	var endpoint = api_url
	if not endpoint.ends_with("/"):
		endpoint += "/"
	# JS uses /models/user, let's follow that. 
	# Wait, check if the base URL already includes 'v1' or similar in JS.
	# JS: const testUrl = apiUrl.endsWith('/') ? `${apiUrl}models/user` : `${apiUrl}/models/user`;
	endpoint += "models/user"

	var headers = [
		"Content-Type: application/json",
		"Authorization: Bearer " + api_token
	]

	var error = model_http_request.request(endpoint, headers, HTTPClient.METHOD_GET)
	if error != OK:
		error_occurred.emit("Failed to make model request: " + str(error))

func _on_request_completed(result, response_code, _headers, body):
	if result != HTTPRequest.RESULT_SUCCESS:
		var error_msg = "Request failed: " + get_result_string(result) + " (Code: " + str(result) + ")"
		error_occurred.emit(error_msg)
		return

	if response_code >= 400:
		var error_msg = "API Error: " + str(response_code)
		var json = JSON.new()
		if json.parse(body.get_string_from_utf8()) == OK:
			if json.data.has("error"):
				error_msg += " - " + str(json.data.error)
		error_occurred.emit(error_msg)
		return

	var json = JSON.new()
	var parse_result = json.parse(body.get_string_from_utf8())
	if parse_result != OK:
		error_occurred.emit("Failed to parse JSON response")
		return

	var response = json.data
	if response.has("choices") and response.choices.size() > 0:
		var content = response.choices[0].message.content
		response_received.emit(content)
	else:
		error_occurred.emit("Unexpected response format")

func _on_model_request_completed(result, response_code, _headers, body):
	if result != HTTPRequest.RESULT_SUCCESS:
		# Fail silently or emit error? 
		# JS highlights field. We'll emit error.
		var error_msg = "Model request failed: " + get_result_string(result)
		error_occurred.emit(error_msg)
		return

	if response_code >= 400:
		error_occurred.emit("Model API Error: " + str(response_code))
		return
		
	var json = JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK:
		error_occurred.emit("Failed to parse model JSON")
		return
		
	var data = json.data
	# JS: expects { data: [...] }
	if data.has("data") and data.data is Array:
		models_received.emit(data.data)
	else:
		error_occurred.emit("Unexpected model response format")

func get_result_string(result_code: int) -> String:
	match result_code:
		HTTPRequest.RESULT_CHUNKED_BODY_SIZE_MISMATCH: return "Chunked body size mismatch"
		HTTPRequest.RESULT_CANT_CONNECT: return "Can't connect"
		HTTPRequest.RESULT_CANT_RESOLVE: return "Can't resolve host"
		HTTPRequest.RESULT_CONNECTION_ERROR: return "Connection error"
		HTTPRequest.RESULT_TLS_HANDSHAKE_ERROR: return "TLS handshake error"
		HTTPRequest.RESULT_NO_RESPONSE: return "No response"
		HTTPRequest.RESULT_BODY_SIZE_LIMIT_EXCEEDED: return "Body size limit exceeded"
		HTTPRequest.RESULT_REQUEST_FAILED: return "Request failed"
		HTTPRequest.RESULT_DOWNLOAD_FILE_CANT_OPEN: return "Can't open download file"
		HTTPRequest.RESULT_DOWNLOAD_FILE_WRITE_ERROR: return "Download file write error"
		HTTPRequest.RESULT_REDIRECT_LIMIT_REACHED: return "Redirect limit reached"
		HTTPRequest.RESULT_TIMEOUT: return "Timeout"
		_: return "Unknown error"
