extends Node

signal response_received(response_text)
signal stream_chunk(chunk_text)
signal stream_finished()
signal error_occurred(error_message)
signal models_received(models)

var model_http_request: HTTPRequest

# Streaming state
var _http_client: HTTPClient = null
var _streaming: bool = false
var _connecting: bool = false
var _stream_buffer: String = ""
var _accumulated_response: String = ""

# Pending request data (used while connecting)
var _pending_path: String = ""
var _pending_headers: Array = []
var _pending_body: String = ""

func _ready():
	model_http_request = HTTPRequest.new()
	add_child(model_http_request)
	model_http_request.request_completed.connect(_on_model_request_completed)

func _process(_delta):
	if _http_client == null:
		return

	_http_client.poll()
	var status = _http_client.get_status()

	if _connecting:
		_handle_connecting(status)
	elif _streaming:
		_handle_streaming(status)

func _handle_connecting(status: int):
	match status:
		HTTPClient.STATUS_CONNECTING, HTTPClient.STATUS_RESOLVING:
			# Still establishing connection, keep waiting
			pass

		HTTPClient.STATUS_CONNECTED:
			# Connection established — send the HTTP request
			var err = _http_client.request(
				HTTPClient.METHOD_POST,
				_pending_path,
				_pending_headers,
				_pending_body
			)
			if err != OK:
				_abort_stream("Failed to send streaming request: " + str(err))
			else:
				_connecting = false
				_streaming = true

		HTTPClient.STATUS_CANT_CONNECT, HTTPClient.STATUS_CANT_RESOLVE, \
		HTTPClient.STATUS_CONNECTION_ERROR, HTTPClient.STATUS_TLS_HANDSHAKE_ERROR:
			_abort_stream("Connection failed with status: " + str(status))

		HTTPClient.STATUS_DISCONNECTED:
			_abort_stream("Disconnected before request could be sent")

func _handle_streaming(status: int):
	match status:
		HTTPClient.STATUS_REQUESTING:
			# Request is being sent, keep polling
			pass

		HTTPClient.STATUS_BODY:
			# Check HTTP response code once we have a response
			var response_code = _http_client.get_response_code()
			if response_code >= 400:
				_abort_stream("API Error HTTP " + str(response_code))
				return
			var chunk: PackedByteArray = _http_client.read_response_body_chunk()
			if chunk.size() > 0:
				_stream_buffer += chunk.get_string_from_utf8()
				_process_sse_buffer()

		HTTPClient.STATUS_CONNECTED:
			# Body fully consumed (connection kept alive)
			_finish_streaming()

		HTTPClient.STATUS_DISCONNECTED:
			# Server closed connection after streaming
			# Process any remaining buffer before finishing
			if not _stream_buffer.is_empty():
				_process_sse_buffer()
			_finish_streaming()

		HTTPClient.STATUS_CANT_CONNECT, HTTPClient.STATUS_CANT_RESOLVE, \
		HTTPClient.STATUS_CONNECTION_ERROR, HTTPClient.STATUS_TLS_HANDSHAKE_ERROR:
			_abort_stream("Streaming connection error: " + str(status))

func _process_sse_buffer():
	# SSE lines are separated by "\n"
	while true:
		var newline_pos = _stream_buffer.find("\n")
		if newline_pos == -1:
			break

		var line = _stream_buffer.substr(0, newline_pos).strip_edges()
		_stream_buffer = _stream_buffer.substr(newline_pos + 1)

		if not line.begins_with("data: "):
			continue

		var data = line.substr(6)  # Remove "data: " prefix

		if data == "[DONE]":
			_finish_streaming()
			return

		var json = JSON.new()
		if json.parse(data) != OK:
			continue

		var parsed = json.data
		if not (parsed.has("choices") and parsed.choices.size() > 0):
			continue

		var choice = parsed.choices[0]
		if not (choice.has("delta") and choice.delta.has("content")):
			continue

		var content = choice.delta.content
		if content != null and content != "":
			_accumulated_response += content
			stream_chunk.emit(content)

func _finish_streaming():
	if not _streaming and not _connecting:
		return
	_streaming = false
	_connecting = false
	if _http_client != null:
		_http_client.close()
		_http_client = null
	stream_finished.emit()
	if not _accumulated_response.is_empty():
		response_received.emit(_accumulated_response)

func _abort_stream(error_msg: String):
	_streaming = false
	_connecting = false
	if _http_client != null:
		_http_client.close()
		_http_client = null
	error_occurred.emit(error_msg)

func chat_completions(messages: Array, model: String, api_url: String, api_token: String):
	if api_url.is_empty() or api_token.is_empty():
		error_occurred.emit("API URL and Token are required")
		return

	# Cancel any in-progress stream
	if _streaming or _connecting:
		_streaming = false
		_connecting = false
		if _http_client != null:
			_http_client.close()
			_http_client = null

	_accumulated_response = ""
	_stream_buffer = ""

	# Build the endpoint URL
	var endpoint = api_url
	if not endpoint.ends_with("/"):
		endpoint += "/"
	if not endpoint.ends_with("chat/completions"):
		endpoint += "chat/completions"

	# Parse scheme, host, port, path
	var use_tls = endpoint.begins_with("https://")
	var url_no_scheme: String
	if use_tls:
		url_no_scheme = endpoint.substr(8)
	elif endpoint.begins_with("http://"):
		url_no_scheme = endpoint.substr(7)
	else:
		error_occurred.emit("Invalid API URL scheme: " + endpoint)
		return

	var slash_pos = url_no_scheme.find("/")
	var host_port: String
	var path: String
	if slash_pos == -1:
		host_port = url_no_scheme
		path = "/"
	else:
		host_port = url_no_scheme.substr(0, slash_pos)
		path = url_no_scheme.substr(slash_pos)

	var host: String
	var port: int
	var colon_pos = host_port.rfind(":")
	if colon_pos != -1:
		host = host_port.substr(0, colon_pos)
		port = int(host_port.substr(colon_pos + 1))
	else:
		host = host_port
		port = 443 if use_tls else 80

	# Build request body with stream: true
	var body_str = JSON.stringify({
		"model": model,
		"messages": messages,
		"stream": true
	})

	# Store pending request data
	_pending_path = path
	_pending_body = body_str
	_pending_headers = [
		"Host: " + host,
		"Content-Type: application/json",
		"Authorization: Bearer " + api_token,
		"Accept: text/event-stream",
		"Cache-Control: no-cache",
		"Content-Length: " + str(body_str.to_utf8_buffer().size())
	]

	# Create HTTPClient and initiate connection
	_http_client = HTTPClient.new()
	var tls_options = TLSOptions.client() if use_tls else null
	var err = _http_client.connect_to_host(host, port, tls_options)
	if err != OK:
		_http_client = null
		error_occurred.emit("Failed to initiate connection: " + str(err))
		return

	_connecting = true

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
	endpoint += "models/user"

	var headers = [
		"Content-Type: application/json",
		"Authorization: Bearer " + api_token
	]

	var error = model_http_request.request(endpoint, headers, HTTPClient.METHOD_GET)
	if error != OK:
		error_occurred.emit("Failed to make model request: " + str(error))

func _on_model_request_completed(result, response_code, _headers, body):
	if result != HTTPRequest.RESULT_SUCCESS:
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
