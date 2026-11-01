#!/usr/bin/env python3
"""Reproducible, opt-in local Muse Glimmer setup. Python standard library only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

MODEL_REPO = "meta-models/Muse-Glimmer-30B-GGUF"
MODEL_REVISION = "b44f1072cf75e918a1b82a3a17b45c4389b076e7"
RUNTIME_REPO = "https://github.com/ggml-org/llama.cpp.git"
RUNTIME_REVISION = "a91eab67d8389d979d29fdf6633b2edd0718eb4b"
FILES = {
    "Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf":
        (16756683904, "4cc57c0f51040a226e5a72cc47b7613f7772950e460a665f7083de89f183f60e"),
    "mmproj-Muse-Glimmer-30B-Q4_K_M.gguf":
        (1400328928, "f48b452316f9b213758e8659444029b961a24a07f99a1abb2a9f88b06f7c00c6"),
    "LICENSE": (11358, "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"),
}
PORT = 8088


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(command, **kwargs):
    subprocess.run(command, check=True, **kwargs)


def endpoint(path="health"):
    return f"http://127.0.0.1:{PORT}/{path}"


def health():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(endpoint(), timeout=2) as response:
            return response.status == 200 and json.load(response).get("status") == "ok"
    except (OSError, ValueError):
        return False


def occupied():
    with socket.socket() as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", PORT)) == 0


def binary(root):
    return root / "build/bin/llama-server"


def owned_pid(root):
    """A stale PID never authorizes stopping an unrelated process."""
    try:
        state = json.loads((root / "server-state.json").read_text())
        pid = state["pid"]
        if not isinstance(pid, int) or pid < 2:
            return None
        command = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "comm="], text=True, stderr=subprocess.DEVNULL
        ).strip()
        started = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "lstart="], text=True, stderr=subprocess.DEVNULL
        ).strip()
        return pid if command == str(binary(root)) and started == state["process_start"] else None
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
        return None


def doctor(root):
    result = {
        "platform": sys.platform,
        "python": sys.version.split()[0],
        "tools": {name: shutil.which(name) for name in ["git", "cmake", "curl", "clang", "clang++"]},
        "free_disk_bytes": shutil.disk_usage(root if root.exists() else Path.home()).free,
        "runtime_directory": str(root),
        "server_binary_present": binary(root).exists(),
        "owned_server_pid": owned_pid(root),
        "port_occupied": occupied(),
        "health_ok": health(),
        "model_bytes": FILES[next(iter(FILES))][0],
    }
    if sys.platform == "darwin":
        result["memory_bytes"] = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True))
    print(json.dumps(result, indent=2))


def setup(root, vision):
    if sys.platform != "darwin" or subprocess.check_output(["uname", "-m"], text=True).strip() != "arm64":
        raise RuntimeError("This tested recipe targets Apple silicon macOS; use Meta's official runtime guide for other systems.")
    for name in ["git", "cmake", "curl"]:
        if not shutil.which(name):
            raise RuntimeError(f"Install {name} from its official source, then run setup again.")
    root.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(root).free < 30 * 1024**3:
        raise RuntimeError("Keep at least30GiB of free space for model, runtime and build artifacts.")
    weights = root / "weights"
    weights.mkdir(exist_ok=True)
    selected = [next(iter(FILES)), "LICENSE"]
    if vision:
        selected.append("mmproj-Muse-Glimmer-30B-Q4_K_M.gguf")
    verified = []
    for name in selected:
        size, expected = FILES[name]
        target = weights / name
        url = f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{name}"
        if not target.exists():
            temporary = weights / (name + ".part")
            run(["curl", "--fail", "--location", "--retry", "2", "--connect-timeout", "30",
                 "--max-time", "7200", "--continue-at", "-", "--output", str(temporary), url])
            temporary.rename(target)
        if target.stat().st_size != size or sha256(target) != expected:
            raise RuntimeError(f"Integrity check failed for{name}; no model will be started.")
        verified.append({"name": name, "bytes": size, "sha256": expected, "source": url})
    source = root / "llama.cpp"
    if not source.exists():
        source.mkdir()
        run(["git", "init", str(source)])
        run(["git", "-C", str(source), "remote", "add", "origin", RUNTIME_REPO])
        run(["git", "-C", str(source), "fetch", "--depth", "1", "origin", RUNTIME_REVISION])
        run(["git", "-C", str(source), "checkout", "--detach", "FETCH_HEAD"])
    revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    if revision != RUNTIME_REVISION or subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip():
        raise RuntimeError("Runtime checkout differs from the pinned clean source; choose a new runtime directory.")
    sdk = subprocess.check_output(["xcrun", "--show-sdk-path"], text=True).strip()
    flags = ["-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_C_COMPILER=/usr/bin/clang",
             "-DCMAKE_CXX_COMPILER=/usr/bin/clang++", "-DCMAKE_C_FLAGS=",
             f"-DCMAKE_CXX_FLAGS=-isystem {sdk}/usr/include/c++/v1",
             "-DCMAKE_EXE_LINKER_FLAGS=", "-DCMAKE_SHARED_LINKER_FLAGS=",
             "-DGGML_METAL=ON", "-DGGML_OPENMP=OFF", "-DLLAMA_OPENSSL=OFF",
             "-DLLAMA_BUILD_TESTS=OFF", "-DLLAMA_USE_PREBUILT_UI=OFF"]
    run(["cmake", "-S", str(source), "-B", str(root / "build"), *flags])
    run(["cmake", "--build", str(root / "build"), "--config", "Release", "-j", "4", "--target", "llama-server"])
    key = root / "local-api-key"
    if not key.exists():
        descriptor = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(secrets.token_urlsafe(36) + "\n")
    key.chmod(0o600)
    (root / "provenance.json").write_text(json.dumps({
        "model_repo": MODEL_REPO, "model_revision": MODEL_REVISION, "files": verified,
        "runtime_repo": RUNTIME_REPO, "runtime_revision": RUNTIME_REVISION,
        "binary_sha256": sha256(binary(root)), "cmake_flags": flags,
        "vision_projector_downloaded": vision, "active_mode": "text-only",
    }, indent=2) + "\n")
    print("Verified setup complete. The model and generated local token stay outside the app repository.")


def start(root):
    if occupied():
        raise RuntimeError("Port8088 is occupied; no existing process was changed. Use status to inspect this setup.")
    model = root / "weights" / next(iter(FILES))
    if not binary(root).exists() or not (root / "provenance.json").exists() or not (root / "local-api-key").exists():
        raise RuntimeError("Run setup first.")
    if model.stat().st_size != FILES[model.name][0] or sha256(model) != FILES[model.name][1]:
        raise RuntimeError("The model integrity check failed.")
    args = [str(binary(root)), "-m", str(model), "--alias", "muse-glimmer",
            "--host", "127.0.0.1", "--port", str(PORT), "--api-key-file", str(root / "local-api-key"),
            "-ngl", "99", "-c", "16384", "-np", "1", "-t", "4", "-tb", "4",
            "--chat-template-kwargs", '{"reasoning_strength":"low"}', "--jinja", "--no-webui", "--log-disable"]
    with (root / "server.log").open("ab") as log:
        process = subprocess.Popen(args, stdout=log, stderr=log, start_new_session=True)
    time.sleep(0.2)
    started = subprocess.check_output(["ps", "-p", str(process.pid), "-o", "lstart="], text=True).strip()
    (root / "server-state.json").write_text(json.dumps({"pid": process.pid, "process_start": started}) + "\n")
    print(f"Starting authenticated local Muse Glimmer on127.0.0.1:{PORT}. Use status after the model loads.")


def stop(root):
    pid = owned_pid(root)
    if pid is None:
        print("No matching server process owned by this setup; nothing stopped.")
        return
    os.kill(pid, signal.SIGTERM)
    print("Sent a graceful stop to this setup's matching server process only.")


def configure_app(root, app):
    if app is None or not (app / "package.json").is_file():
        raise RuntimeError("Provide --app-dir pointing to the GEONOS source checkout.")
    destination = app.resolve() / ".dev.vars"
    if destination.is_symlink():
        raise RuntimeError("Use a regular ignored .dev.vars file, not a symbolic link.")
    # Require Git's ignore mechanism before writing any credential to a checkout.
    ignored = subprocess.run(["git", "-C", str(app), "check-ignore", "--quiet", ".dev.vars"]).returncode == 0
    if not ignored:
        raise RuntimeError("The app must ignore .dev.vars before configuration can be written.")
    key = (root / "local-api-key").read_text().strip()
    values = {"GEONOS_LOCAL_REVIEW": "true", "GEONOS_GLIMMER_URL": endpoint("v1/chat/completions"), "GEONOS_GLIMMER_API_KEY": key}
    existing = destination.read_text().splitlines() if destination.exists() else []
    lines = [line for line in existing if line.split("=", 1)[0] not in values]
    lines.extend(name + "=" + value for name, value in values.items())
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write("\n".join(lines) + "\n")
    destination.chmod(0o600)
    print("Updated only the three local-review settings in ignored .dev.vars. No credential printed. Restart the local app.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["doctor", "setup", "start", "status", "stop", "configure-app"])
    parser.add_argument("--runtime-dir", type=Path, default=Path.home() / "Library/Caches/geonos-glimmer")
    parser.add_argument("--app-dir", type=Path)
    parser.add_argument("--with-vision", action="store_true", help="Download and verify the optional projector; text review remains the active mode.")
    args = parser.parse_args()
    root = args.runtime_dir.expanduser().resolve()
    if root.is_relative_to(Path(__file__).resolve().parents[2]):
        raise RuntimeError("Choose a runtime directory outside the app repository so weights and local credentials stay separate.")
    if args.command in ["doctor", "status"]:
        doctor(root)
    elif args.command == "setup":
        setup(root, args.with_vision)
    elif args.command == "start":
        start(root)
    elif args.command == "stop":
        stop(root)
    else:
        configure_app(root, args.app_dir)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
