import importlib.util
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
