"""Tests for the checked-in backend environment configuration contract."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main


class EnvironmentConfigTests(unittest.TestCase):
    def test_blank_values_use_the_supplied_default(self):
        with patch.dict(os.environ, {"TEST_CONFIG_VALUE": "   "}):
            self.assertEqual(main._env_value("TEST_CONFIG_VALUE", "fallback"), "fallback")

    def test_values_are_trimmed(self):
        with patch.dict(os.environ, {"TEST_CONFIG_VALUE": "  configured-value  "}):
            self.assertEqual(main._env_value("TEST_CONFIG_VALUE"), "configured-value")

    def test_example_includes_all_runtime_settings(self):
        example = Path(main.PROJECT_ROOT, "backend", ".env.example").read_text(encoding="utf-8")
        expected_names = [
            "PORT",
            "PERXONA_API_BASE_URL",
            "PRESENTER_URL",
            "PERXONA_CONNECT_EMAIL",
            "PERXONA_CONNECT_PASSWORD",
            "LLM_API_KEY",
            "LLM_BASE_URL",
            "LLM_MODEL",
        ]
        actual_names = [
            line.split("=", 1)[0]
            for line in example.splitlines()
            if line and not line.startswith("#") and "=" in line
        ]
        self.assertEqual(actual_names, expected_names)


if __name__ == "__main__":
    unittest.main()
