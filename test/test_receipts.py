import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    "sync_gmail_tickets",
    Path(__file__).parents[1] / "scripts" / "sync_gmail_tickets.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReceiptParserTest(unittest.TestCase):
    def test_parses_minimal_receipt(self):
        receipt = MODULE.parse_receipt_text(
            """NIF A00000000
Example Store
Atès per: Staff 13/07/26 12:00:00
FACTURA SIMPLIFICADA: 2026/1/00000001
Article Quantitat Preu Import
Quefir natural AO 4x125g 1 1,99 1,99
SUBTOTAL 1,99 €
TOTAL 1,99 €"""
        )

        self.assertEqual(receipt["date"], "2026-07-13")
        self.assertEqual(receipt["items"][0]["name"], "Quefir natural AO 4x125g")
        self.assertEqual(receipt["totalAmount"], 1.99)

    def test_ticket_json_is_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ticket.json"
            MODULE.write_private_json(path, {"id": "synthetic"})
            self.assertEqual(json.loads(path.read_text()), {"id": "synthetic"})
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)

    def test_sync_startup_failure_is_sanitized(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with mock.patch.object(MODULE, "list_message_ids", side_effect=RuntimeError("private failure")):
                with mock.patch.object(sys, "argv", ["sync", "--tickets-dir", directory]):
                    with redirect_stdout(output):
                        code = MODULE.main()
            summary = json.loads(output.getvalue())
            self.assertEqual(code, 1)
            self.assertEqual(summary["failed"], 1)
            self.assertNotIn("private failure", output.getvalue())


if __name__ == "__main__":
    unittest.main()
