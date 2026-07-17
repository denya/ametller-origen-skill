#!/usr/bin/env python3
"""Download and parse Ametller Origen digital receipts through the gws CLI."""

from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import shutil
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

DEFAULT_QUERY = '"Ametller Origen - El teu tiquet digital"'
DEFAULT_TICKET_DIR = Path(
    os.environ.get("AMETLLER_TICKET_DIR", Path.home() / ".ametller" / "tickets")
)


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.in_style = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "style":
            self.in_style = True
        elif tag in {"br", "div", "p", "tr", "table", "hr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "style":
            self.in_style = False

    def handle_data(self, data: str) -> None:
        if not self.in_style and data.strip():
            self.parts.append(data)

    def text(self) -> str:
        value = html.unescape("".join(self.parts)).replace("\xa0", " ")
        value = re.sub(r"[ \t]+", " ", value)
        return re.sub(r"\n+", "\n", value).strip()


def gws_binary() -> str:
    binary = os.environ.get("GWS_BIN") or shutil.which("gws")
    if not binary:
        raise RuntimeError("gws is not installed or not on PATH")
    return binary


def run_gws(resource: list[str], params: dict[str, Any]) -> dict[str, Any]:
    proc = subprocess.run(
        [gws_binary(), *resource, "--params", json.dumps(params, ensure_ascii=False)],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return json.loads(proc.stdout)


def list_message_ids(query: str) -> list[str]:
    ids: list[str] = []
    page_token = None
    while True:
        params: dict[str, Any] = {"userId": "me", "q": query, "maxResults": 500}
        if page_token:
            params["pageToken"] = page_token
        page = run_gws(["gmail", "users", "messages", "list"], params)
        ids.extend(message["id"] for message in page.get("messages", []))
        page_token = page.get("nextPageToken")
        if not page_token:
            return ids


def iter_parts(part: dict[str, Any]) -> list[dict[str, Any]]:
    parts = [part]
    for child in part.get("parts") or []:
        parts.extend(iter_parts(child))
    return parts


def decode_message_body(message: dict[str, Any]) -> str:
    parts = iter_parts(message.get("payload") or {})
    candidates = [
        part
        for mime in ("text/html", "text/plain")
        for part in parts
        if part.get("mimeType") == mime and part.get("body", {}).get("data")
    ]
    if not candidates:
        raise ValueError("Message has no readable body")
    encoded = candidates[0]["body"]["data"]
    raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    return raw.decode("utf-8", errors="replace")


def hydrate_attachment_bodies(message: dict[str, Any]) -> None:
    message_id = message.get("id")
    if not message_id:
        return
    for part in iter_parts(message.get("payload") or {}):
        body = part.get("body") or {}
        attachment_id = body.get("attachmentId")
        if body.get("data") or not attachment_id:
            continue
        attachment = run_gws(
            ["gmail", "users", "messages", "attachments", "get"],
            {"userId": "me", "messageId": message_id, "id": attachment_id},
        )
        if attachment.get("data"):
            body["data"] = attachment["data"]


def receipt_text(message_body: str) -> str:
    parser = TextExtractor()
    parser.feed(message_body)
    return parser.text()


def decimal(value: str) -> float:
    cleaned = value.strip().replace("€", "").replace(" ", "")
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    return round(float(cleaned), 3)


def parse_receipt_text(text: str) -> dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    date_line = next((line for line in lines if "Atès per:" in line or "Ates per:" in line), "")
    date_match = re.search(r"(\d{2})/(\d{2})/(\d{2})\s+(\d{2}:\d{2}:\d{2})", date_line)
    if not date_match:
        raise ValueError("Could not parse receipt date")
    day, month, year, _ = date_match.groups()
    date = f"20{year}-{month}-{day}"

    invoice_line = next((line for line in lines if "FACTURA SIMPLIFICADA:" in line), "")
    invoice_match = re.search(r"FACTURA SIMPLIFICADA:\s*([0-9/]+)", invoice_line)
    if not invoice_match:
        raise ValueError("Could not parse invoice number")
    invoice = invoice_match.group(1).rstrip(".")

    store = "Ametller Origen"
    for index, line in enumerate(lines):
        if line.startswith("NIF ") and index + 1 < len(lines):
            store = f"Ametller Origen - {lines[index + 1]}"
            break

    item_re = re.compile(
        r"^(?P<name>.+)\s+(?P<quantity>\d+(?:,\d+)?)\s+"
        r"(?P<unit_price>\d+(?:,\d+)?)\s+(?P<total>\d+(?:,\d+)?)$"
    )
    items: list[dict[str, Any]] = []
    in_items = False
    for line in lines:
        if line.startswith("Article "):
            in_items = True
            continue
        if line.startswith("SUBTOTAL"):
            break
        if not in_items or not (match := item_re.match(line)):
            continue
        quantity = decimal(match.group("quantity"))
        items.append(
            {
                "name": re.sub(r"\s+", " ", match.group("name")).strip(),
                "quantity": quantity,
                "unit": "kg" if "," in match.group("quantity") else "ud",
                "pricePerUnit": decimal(match.group("unit_price")),
                "totalPrice": decimal(match.group("total")),
            }
        )

    subtotal = next(
        (decimal(match.group(1)) for line in lines if (match := re.search(r"^SUBTOTAL\s+([0-9.,]+)\s*€", line))),
        None,
    )
    total = next(
        (decimal(match.group(1)) for line in lines if (match := re.search(r"^TOTAL\s+([0-9.,]+)\s*€", line))),
        None,
    )
    if total is None:
        raise ValueError("Could not parse receipt total")

    suffix = invoice.split("/")[-1][-4:]
    return {
        "id": f"{date.replace('-', '')}-{suffix}",
        "date": date,
        "store": store,
        "invoiceNumber": invoice,
        "subtotal": subtotal,
        "discounts": round(total - subtotal, 2) if subtotal is not None else 0.0,
        "items": items,
        "totalAmount": total,
        "source": "gmail",
    }


def parse_message(message: dict[str, Any]) -> dict[str, Any]:
    return parse_receipt_text(receipt_text(decode_message_body(message)))


def ticket_path(ticket: dict[str, Any], tickets_dir: Path) -> Path:
    path = tickets_dir / f"{ticket['id']}.json"
    if not path.exists():
        return path
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return path
    if existing.get("invoiceNumber") == ticket.get("invoiceNumber"):
        return path
    discriminator = ticket["invoiceNumber"].replace("/", "-")
    return tickets_dir / f"{ticket['date']}-{discriminator}.json"


def write_private_json(path: Path, value: dict[str, Any]) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.chmod(path, 0o600)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default=DEFAULT_QUERY)
    parser.add_argument("--tickets-dir", type=Path, default=DEFAULT_TICKET_DIR)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    args.tickets_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.tickets_dir, 0o700)
    try:
        message_ids = list_message_ids(args.query)
    except Exception as error:
        print(
            json.dumps(
                {
                    "matched_messages": 0,
                    "written": 0,
                    "skipped_existing": 0,
                    "failed": 1,
                    "failure_types": {type(error).__name__: 1},
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1
    if args.limit:
        message_ids = message_ids[: args.limit]

    written = skipped = 0
    failures: list[str] = []
    for message_id in message_ids:
        try:
            message = run_gws(
                ["gmail", "users", "messages", "get"],
                {"userId": "me", "id": message_id, "format": "full"},
            )
            hydrate_attachment_bodies(message)
            ticket = parse_message(message)
            path = ticket_path(ticket, args.tickets_dir)
            if path.exists() and not args.overwrite:
                skipped += 1
                continue
            write_private_json(path, ticket)
            written += 1
        except Exception as error:  # Continue syncing the remaining receipts.
            failures.append(type(error).__name__)

    print(
        json.dumps(
            {
                "query": args.query,
                "matched_messages": len(message_ids),
                "written": written,
                "skipped_existing": skipped,
                "failed": len(failures),
                "failure_types": dict(Counter(failures)),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
