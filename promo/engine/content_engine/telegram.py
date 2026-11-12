"""One-tap approval on Telegram, through a dedicated bot that is polled (getUpdates) from the cron job.

The stash worker's bot can't be reused: it has a webhook set, and Telegram refuses getUpdates while one is.
Only taps from the owner's chat count.
"""
from __future__ import annotations

import json
from pathlib import Path

from .http import Http


class Telegram:
    def __init__(self, token: str, chat_id: str, http: Http):
        self.base = f"https://api.telegram.org/bot{token}"
        self.chat = str(chat_id)
        self.http = http

    def _call(self, method: str, **kw) -> dict:
        d = self.http.json("POST", f"{self.base}/{method}", **kw)
        return d.get("result", d)

    def send(self, text: str, buttons: list[list[tuple[str, str]]] | None = None) -> int:
        data = {"chat_id": self.chat, "text": text[:4000], "disable_web_page_preview": True}
        if buttons:
            data["reply_markup"] = _markup(buttons)
        return self._call("sendMessage", json=data)["message_id"]

    def send_media(self, path: Path, caption: str, buttons: list[list[tuple[str, str]]] | None = None) -> int:
        """A video (so Parth can watch it right there) or a photo, with the approve buttons under it."""
        is_video = path.suffix.lower() in (".mp4", ".mov")
        method, field = ("sendVideo", "video") if is_video else ("sendPhoto", "photo")
        data = {"chat_id": self.chat, "caption": caption[:1024]}
        if is_video:
            data["supports_streaming"] = "true"
        if buttons:
            data["reply_markup"] = json.dumps(_markup(buttons))
        with path.open("rb") as f:
            return self._call(method, data=data, files={field: (path.name, f)})["message_id"]

    def send_album(self, paths: list[Path]) -> None:
        media, files = [], {}
        for i, p in enumerate(paths[:10]):
            media.append({"type": "photo", "media": f"attach://f{i}"})
            files[f"f{i}"] = (p.name, p.read_bytes())
        self._call("sendMediaGroup", data={"chat_id": self.chat, "media": json.dumps(media)}, files=files)

    def updates(self, offset: int) -> list[dict]:
        return self._call("getUpdates", json={"offset": offset, "timeout": 0,
                                               "allowed_updates": ["callback_query", "message"]}) or []

    def answer(self, callback_id: str, text: str) -> None:
        self._call("answerCallbackQuery", json={"callback_query_id": callback_id, "text": text[:190]})

    def clear_buttons(self, message_id: int) -> None:
        self._call("editMessageReplyMarkup", json={"chat_id": self.chat, "message_id": message_id,
                                                    "reply_markup": {"inline_keyboard": []}})


def _markup(buttons: list[list[tuple[str, str]]]) -> dict:
    return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in buttons]}


def approval_buttons(post_id: str) -> list[list[tuple[str, str]]]:
    return [[("Approve", f"ap:{post_id}"), ("Skip", f"sk:{post_id}")]]


def late_buttons(post_id: str) -> list[list[tuple[str, str]]]:
    return [[("Post now", f"now:{post_id}"), ("Skip", f"sk:{post_id}")]]
