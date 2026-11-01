import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("glimmer_setup", Path(__file__).with_name("setup-local.py"))
SETUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SETUP)


class LocalSetupSafety(unittest.TestCase):
    def test_configuration_requires_ignored_file_and_keeps_token_out_of_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "runtime"
            root.mkdir()
            (root / "local-api-key").write_text("fixture-token-that-must-not-be-printed\n")
            app = Path(directory) / "app"
            app.mkdir()
            (app / "package.json").write_text("{}")
            subprocess.run(["git", "init", "--quiet", str(app)], check=True)
            with self.assertRaisesRegex(RuntimeError, "ignore"):
                SETUP.configure_app(root, app)
            self.assertFalse((app / ".dev.vars").exists())
            (app / ".gitignore").write_text(".dev.vars\n")
            (app / ".dev.vars").write_text("OTHER_SETTING=keep-me\nGEONOS_LOCAL_REVIEW=false\n")
            captured = io.StringIO()
            with contextlib.redirect_stdout(captured):
                SETUP.configure_app(root, app)
            text = (app / ".dev.vars").read_text()
            self.assertIn("OTHER_SETTING=keep-me", text)
            self.assertEqual(text.count("GEONOS_LOCAL_REVIEW="), 1)
            self.assertIn("GEONOS_LOCAL_REVIEW=true", text)
            self.assertNotIn("fixture-token", captured.getvalue())
            self.assertEqual((app / ".dev.vars").stat().st_mode & 0o777, 0o600)

    def test_stale_or_foreign_pid_cannot_stop_an_unrelated_process(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            process = subprocess.Popen(["sleep", "30"])
            try:
                started = subprocess.check_output(["ps", "-p", str(process.pid), "-o", "lstart="], text=True).strip()
                (root / "server-state.json").write_text(json.dumps({"pid": process.pid, "process_start": started}))
                self.assertIsNone(SETUP.owned_pid(root))
                with contextlib.redirect_stdout(io.StringIO()):
                    SETUP.stop(root)
                self.assertIsNone(process.poll())
            finally:
                process.terminate()
                process.wait(timeout=5)

    def test_repository_cannot_be_used_as_a_weight_or_credential_directory(self):
        repository = Path(__file__).resolve().parents[2]
        command = [os.sys.executable, str(Path(__file__).with_name("setup-local.py")), "doctor", "--runtime-dir", str(repository / "uncreated-runtime")]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outside the app repository", result.stderr)
        self.assertFalse((repository / "uncreated-runtime").exists())


if __name__ == "__main__":
    unittest.main()
