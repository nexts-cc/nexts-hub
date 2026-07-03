import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "universal_email_mcp.py"


def load_module():
    spec = importlib.util.spec_from_file_location("universal_email_mcp", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["universal_email_mcp"] = module
    spec.loader.exec_module(module)
    return module


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.original_env = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.original_env)

    def write_accounts(self, data):
        handle = tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8", suffix=".json")
        with handle:
            json.dump(data, handle)
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        os.environ["EMAIL_ACCOUNTS_FILE"] = handle.name
        return handle.name

    def test_loads_default_account_with_provider_preset(self):
        self.write_accounts(
            {
                "default": "work",
                "accounts": {
                    "work": {
                        "provider": "gmail",
                        "email": "me@example.com",
                        "password": "secret",
                    }
                },
            }
        )

        config = self.module.load_config()

        self.assertEqual(config.account, "work")
        self.assertEqual(config.provider, "gmail")
        self.assertEqual(config.imap_host, "imap.gmail.com")
        self.assertEqual(config.smtp_host, "smtp.gmail.com")
        self.assertEqual(config.imap_username, "me@example.com")
        self.assertEqual(config.smtp_password, "secret")

    def test_selects_named_account_and_allows_host_overrides(self):
        self.write_accounts(
            {
                "default": "work",
                "accounts": {
                    "work": {
                        "provider": "gmail",
                        "email": "work@example.com",
                        "password": "work-secret",
                    },
                    "custom": {
                        "provider": "custom",
                        "email": "custom@example.com",
                        "password": "custom-secret",
                        "imap_host": "imap.mail.example",
                        "smtp_host": "smtp.mail.example",
                        "smtp_port": 465,
                        "smtp_ssl": True,
                        "smtp_starttls": False,
                    },
                },
            }
        )

        config = self.module.load_config("custom")

        self.assertEqual(config.account, "custom")
        self.assertEqual(config.imap_host, "imap.mail.example")
        self.assertEqual(config.smtp_host, "smtp.mail.example")
        self.assertEqual(config.smtp_port, 465)
        self.assertTrue(config.smtp_ssl)
        self.assertFalse(config.smtp_starttls)

    def test_password_env_is_resolved(self):
        self.write_accounts(
            {
                "default": "personal",
                "accounts": {
                    "personal": {
                        "provider": "qq",
                        "email": "123@qq.com",
                        "password_env": "TEST_EMAIL_PASSWORD",
                    }
                },
            }
        )
        os.environ["TEST_EMAIL_PASSWORD"] = "from-env"

        config = self.module.load_config()

        self.assertEqual(config.imap_host, "imap.qq.com")
        self.assertEqual(config.smtp_host, "smtp.qq.com")
        self.assertEqual(config.imap_password, "from-env")

    def test_lists_accounts_without_passwords(self):
        self.write_accounts(
            {
                "default": "work",
                "accounts": {
                    "work": {
                        "provider": "gmail",
                        "email": "work@example.com",
                        "password": "secret",
                    },
                    "personal": {
                        "provider": "163",
                        "email": "me@163.com",
                        "password": "secret",
                    },
                },
            }
        )

        result = self.module.tool_list_accounts({})

        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["default"], "work")
        self.assertEqual(result["data"]["accounts"][0]["name"], "personal")
        self.assertNotIn("password", result["data"]["accounts"][0])


if __name__ == "__main__":
    unittest.main()
