import unittest

from main import app


async def asgi_get(
    path: str,
    query_string: str = "",
    headers: list[tuple[bytes, bytes]] | None = None,
) -> list[dict]:
    messages: list[dict] = []
    request_sent = False

    async def receive() -> dict:
        nonlocal request_sent
        if request_sent:
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    await app(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": query_string.encode(),
            "headers": headers or [(b"host", b"testserver")],
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 12345),
            "root_path": "",
        },
        receive,
        send,
    )
    return messages


class SocketAppTests(unittest.IsolatedAsyncioTestCase):
    async def test_conventional_app_entry_serves_socket_io(self) -> None:
        messages = await asgi_get(
            "/socket.io/",
            "EIO=4&transport=polling",
        )

        response = next(message for message in messages if message["type"] == "http.response.start")
        body = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        self.assertEqual(response["status"], 200)
        self.assertTrue(body.startswith(b"0"))
        self.assertIn(b'"sid"', body)

    async def test_socket_io_allows_configured_frontend_origin(self) -> None:
        origin = "https://pisosisosisosisosi.github.io"
        messages = await asgi_get(
            "/socket.io/",
            "EIO=4&transport=polling",
            headers=[(b"host", b"testserver"), (b"origin", origin.encode())],
        )

        response = next(message for message in messages if message["type"] == "http.response.start")
        body = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        response_headers = dict(response.get("headers", []))
        self.assertEqual(response["status"], 200)
        self.assertTrue(body.startswith(b"0"))
        normalized_headers = {key.lower(): value for key, value in response_headers.items()}
        self.assertEqual(normalized_headers.get(b"access-control-allow-origin"), origin.encode(), response_headers)

    async def test_socket_io_rejects_unconfigured_origin(self) -> None:
        messages = await asgi_get(
            "/socket.io/",
            "EIO=4&transport=polling",
            headers=[(b"host", b"testserver"), (b"origin", b"https://evil.example")],
        )

        response = next(message for message in messages if message["type"] == "http.response.start")
        response_headers = dict(response.get("headers", []))
        self.assertEqual(response["status"], 400)
        self.assertNotIn(b"access-control-allow-origin", response_headers)

    async def test_http_api_is_forwarded_by_conventional_app_entry(self) -> None:
        messages = await asgi_get("/health")

        response = next(message for message in messages if message["type"] == "http.response.start")
        body = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        self.assertEqual(response["status"], 200)
        self.assertEqual(body, b'{"status":"healthy"}')


if __name__ == "__main__":
    unittest.main()
