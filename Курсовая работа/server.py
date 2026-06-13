import json
import os
import re
import socket
import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, request, send_from_directory, session  # type: ignore
from werkzeug.security import check_password_hash, generate_password_hash  # type: ignore
from werkzeug.utils import secure_filename  # type: ignore


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DB_PATH", BASE_DIR / "server_data" / "lancelot.db"))
SESSION_KEY = os.environ.get("SESSION_KEY", "dev-secret-change-me")
UPLOADS_DIR = BASE_DIR / "uploads"
FRAMES_DIR = BASE_DIR / "assets" / "frames"
STICKERS_DIR = BASE_DIR / "assets" / "stickers"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".ogg", ".wav", ".m4a", ".mp3"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv"}
ALLOWED_FILE_EXTENSIONS = {".pdf", ".zip", ".rar", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx"}
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

app = Flask(__name__)
app.secret_key = SESSION_KEY


@app.before_request
def log_request():
    if request.path.startswith("/api/"):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {request.method} {request.path}", flush=True)


@app.after_request
def log_response(response):
    if request.path.startswith("/api/"):
        print(f"  -> {response.status_code}", flush=True)
    return response


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              name TEXT NOT NULL,
              avatar_url TEXT,
              banner_url TEXT,
              about_text TEXT,
              relation_status TEXT,
              education_place TEXT,
              city TEXT,
              birth_date TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS posts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_participants (
              chat_id INTEGER NOT NULL,
              user_id INTEGER NOT NULL,
              PRIMARY KEY(chat_id, user_id),
              FOREIGN KEY(chat_id) REFERENCES chats(id),
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              chat_id INTEGER NOT NULL,
              sender_id INTEGER NOT NULL,
              content TEXT NOT NULL,
              message_type TEXT NOT NULL DEFAULT 'text',
              image_url TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(chat_id) REFERENCES chats(id),
              FOREIGN KEY(sender_id) REFERENCES users(id)
            );
            """
        )
        ensure_column(conn, "users", "avatar_url", "TEXT")
        ensure_column(conn, "users", "banner_url", "TEXT")
        ensure_column(conn, "users", "about_text", "TEXT")
        ensure_column(conn, "users", "relation_status", "TEXT")
        ensure_column(conn, "users", "education_place", "TEXT")
        ensure_column(conn, "users", "city", "TEXT")
        ensure_column(conn, "users", "birth_date", "TEXT")
        ensure_column(conn, "users", "last_name", "TEXT")
        ensure_column(conn, "users", "patronymic", "TEXT")
        ensure_column(conn, "users", "god_mode", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "users", "banned", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "users", "avatar_frame_url", "TEXT")
        ensure_column(conn, "messages", "message_type", "TEXT NOT NULL DEFAULT 'text'")
        ensure_column(conn, "messages", "image_url", "TEXT")
        ensure_column(conn, "messages", "sticker_url", "TEXT")
        ensure_column(conn, "messages", "audio_url", "TEXT")
        ensure_column(conn, "messages", "waveform", "TEXT")
        ensure_column(conn, "messages", "video_url", "TEXT")
        ensure_column(conn, "messages", "repost_post_id", "INTEGER")
        ensure_column(conn, "posts", "post_scope", "TEXT NOT NULL DEFAULT 'feed'")
        ensure_column(conn, "posts", "image_url", "TEXT")
        ensure_column(conn, "posts", "video_url", "TEXT")
        ensure_column(conn, "posts", "file_url", "TEXT")
        ensure_column(conn, "posts", "file_name", "TEXT")
        ensure_column(conn, "posts", "original_post_id", "INTEGER")
        ensure_column(conn, "posts", "media_json", "TEXT")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS post_likes (
              post_id INTEGER NOT NULL,
              user_id INTEGER NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              PRIMARY KEY(post_id, user_id),
              FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS post_comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              post_id INTEGER NOT NULL,
              user_id INTEGER NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        conn.execute("UPDATE posts SET post_scope = 'feed' WHERE post_scope IS NULL OR post_scope = ''")
        conn.commit()
    finally:
        conn.close()


def ensure_column(conn, table_name: str, column_name: str, column_sql: str):
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    names = {row["name"] for row in rows}
    if column_name not in names:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")


def current_user_id():
    uid = session.get("user_id")
    if not uid:
        return None
    try:
        return int(uid)
    except Exception:
        return None


def require_auth():
    uid = current_user_id()
    if not uid:
        abort(401)
    conn = get_db()
    try:
        row = conn.execute("SELECT banned FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            session.clear()
            abort(401)
        if int(row["banned"] or 0) == 1:
            session.clear()
            abort(403)
    finally:
        conn.close()
    return uid


def json_error(message, status=400):
    return jsonify({"ok": False, "error": message}), status


def build_asset_url(value):
    return value or None


FRAME_REQUIRED_SIZE = 256
FRAME_ALLOWED_EXTENSIONS = {".svg", ".png"}


def format_display_name(name, last_name=None, patronymic=None):
    parts = []
    if (name or "").strip():
        parts.append(name.strip())
    if (last_name or "").strip():
        parts.append(last_name.strip())
    if (patronymic or "").strip():
        parts.append(patronymic.strip())
    return " ".join(parts) or "Пользователь"


def _parse_svg_dimensions(text: str):
    viewbox = re.search(r'viewBox=["\']([^"\']+)["\']', text, re.I)
    if viewbox:
        parts = viewbox.group(1).strip().split()
        if len(parts) == 4:
            try:
                return int(float(parts[2])), int(float(parts[3]))
            except ValueError:
                pass
    width_m = re.search(r'\bwidth=["\'](\d+(?:\.\d+)?)', text, re.I)
    height_m = re.search(r'\bheight=["\'](\d+(?:\.\d+)?)', text, re.I)
    if width_m and height_m:
        try:
            return int(float(width_m.group(1))), int(float(height_m.group(1)))
        except ValueError:
            pass
    return None, None


def is_valid_frame_file(path: Path) -> bool:
    if not path.is_file():
        return False
    ext = path.suffix.lower()
    if ext not in FRAME_ALLOWED_EXTENSIONS:
        return False
    if ext == ".png":
        try:
            with path.open("rb") as f:
                header = f.read(24)
            if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
                return False
            width = int.from_bytes(header[16:20], "big")
            height = int.from_bytes(header[20:24], "big")
            return width == FRAME_REQUIRED_SIZE and height == FRAME_REQUIRED_SIZE
        except OSError:
            return False
    if ext == ".svg":
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return False
        width, height = _parse_svg_dimensions(text)
        return width == FRAME_REQUIRED_SIZE and height == FRAME_REQUIRED_SIZE
    return False


def resolve_frame_url(frame_url: str | None) -> str | None:
    if not frame_url:
        return None
    if not frame_url.startswith("/assets/frames/"):
        return None
    frame_path = FRAMES_DIR / Path(frame_url).name
    if not is_valid_frame_file(frame_path):
        return None
    return frame_url


def user_to_public_dict(row):
    last_name = row["last_name"] if "last_name" in row.keys() else None
    patronymic = row["patronymic"] if "patronymic" in row.keys() else None
    name = row["name"]
    return {
        "id": int(row["id"]),
        "name": name,
        "last_name": last_name or "",
        "patronymic": patronymic or "",
        "display_name": format_display_name(name, last_name, patronymic),
        "avatar_url": build_asset_url(row["avatar_url"]),
        "avatar_frame_url": resolve_frame_url(build_asset_url(row["avatar_frame_url"]) if "avatar_frame_url" in row.keys() else None),
        "banner_url": build_asset_url(row["banner_url"]) if "banner_url" in row.keys() else None,
        "about_text": row["about_text"] if "about_text" in row.keys() else None,
        "relation_status": row["relation_status"] if "relation_status" in row.keys() else None,
        "education_place": row["education_place"] if "education_place" in row.keys() else None,
        "city": row["city"] if "city" in row.keys() else None,
        "birth_date": row["birth_date"] if "birth_date" in row.keys() else None,
        "god_mode": int(row["god_mode"]) == 1 if "god_mode" in row.keys() else False,
    }


def is_email_domain_resolvable(email: str) -> bool:
    try:
        domain = email.split("@", 1)[1].strip().lower()
        if not domain:
            return False
        socket.getaddrinfo(domain, 80)
        return True
    except Exception:
        return False


def validate_birth_date(value: str):
    if not value:
        raise ValueError("Укажите дату рождения")
    try:
        dt = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Некорректная дата рождения") from exc
    if dt > date.today():
        raise ValueError("Дата рождения не может быть в будущем")
    return dt.isoformat()


def save_uploaded_image(file_storage, subdir: str):
    if not file_storage or not file_storage.filename:
        raise ValueError("Файл не выбран")

    original = secure_filename(file_storage.filename)
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Разрешены только изображения: jpg, png, webp, gif")

    target_dir = UPLOADS_DIR / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = target_dir / filename
    file_storage.save(target_path)
    return f"/uploads/{subdir}/{filename}"


def save_uploaded_video(file_storage, subdir: str):
    if not file_storage or not file_storage.filename:
        raise ValueError("Файл не выбран")
    original = secure_filename(file_storage.filename)
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise ValueError("Разрешены видео: mp4, webm, mov, mkv")
    target_dir = UPLOADS_DIR / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = target_dir / filename
    file_storage.save(target_path)
    return f"/uploads/{subdir}/{filename}"


def save_uploaded_file(file_storage, subdir: str):
    if not file_storage or not file_storage.filename:
        raise ValueError("Файл не выбран")
    original = secure_filename(file_storage.filename)
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_FILE_EXTENSIONS:
        raise ValueError("Неподдерживаемый тип файла")
    target_dir = UPLOADS_DIR / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = target_dir / filename
    file_storage.save(target_path)
    return f"/uploads/{subdir}/{filename}", original


def save_uploaded_audio(file_storage, subdir: str):
    if not file_storage or not file_storage.filename:
        raise ValueError("Файл не выбран")
    original = secure_filename(file_storage.filename)
    ext = Path(original).suffix.lower() or ".webm"
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise ValueError("Разрешены аудио: webm, ogg, wav, m4a, mp3")
    target_dir = UPLOADS_DIR / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = target_dir / filename
    file_storage.save(target_path)
    return f"/uploads/{subdir}/{filename}"


@app.get("/api/frames")
def api_frames():
    require_auth()
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for p in sorted(FRAMES_DIR.iterdir()):
        if not p.is_file():
            continue
        if not is_valid_frame_file(p):
            continue
        files.append({"name": p.stem, "url": f"/assets/frames/{p.name}"})
    return jsonify({"ok": True, "frames": files, "required_size": FRAME_REQUIRED_SIZE})


@app.get("/api/stickers")
def api_stickers():
    require_auth()
    STICKERS_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for p in sorted(STICKERS_DIR.iterdir()):
        if not p.is_file():
            continue
        if p.suffix.lower() != ".png":
            continue
        files.append({"name": p.stem, "url": f"/assets/stickers/{p.name}"})
    return jsonify({"ok": True, "stickers": files})


@app.get("/api/me")
def api_me():
    uid = current_user_id()
    if not uid:
        return json_error("unauthorized", 401)
    conn = get_db()
    try:
        user = conn.execute(
            """
            SELECT id, name, last_name, patronymic, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode
            FROM users
            WHERE id = ? AND (banned IS NULL OR banned = 0)
            """,
            (uid,),
        ).fetchone()
        if not user:
            return json_error("unauthorized", 401)
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


@app.post("/api/register")
def api_register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    name = (payload.get("name") or "").strip()
    birth_date = (payload.get("birth_date") or "").strip()

    if not email or not EMAIL_RE.match(email):
        return json_error("Некорректный email")
    if not is_email_domain_resolvable(email):
        return json_error("Укажите существующий email-домен")
    if len(password) < 8:
        return json_error("Пароль должен быть минимум 8 символов")
    if not name:
        return json_error("Введите имя")
    try:
        birth_date = validate_birth_date(birth_date)
    except ValueError as exc:
        return json_error(str(exc))

    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return json_error("Пользователь с таким email уже существует")

        pw_hash = generate_password_hash(password)
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name, birth_date) VALUES (?, ?, ?, ?)",
            (email, pw_hash, name, birth_date),
        )
        conn.commit()
        uid = int(cur.lastrowid)
        session["user_id"] = uid
        user = conn.execute(
            """
            SELECT id, name, last_name, patronymic, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode
            FROM users
            WHERE id = ?
            """,
            (uid,),
        ).fetchone()
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


@app.post("/api/login")
def api_login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return json_error("Некорректные данные")

    conn = get_db()
    try:
        user = conn.execute(
            """
            SELECT id, password_hash, name, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode, banned
            FROM users
            WHERE email = ?
            """,
            (email,),
        ).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return json_error("Неверный email или пароль", 401)
        if int(user["banned"] or 0) == 1:
            return json_error("Аккаунт заблокирован", 403)

        session["user_id"] = int(user["id"])
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/me/avatar")
def api_me_avatar():
    uid = require_auth()
    file_storage = request.files.get("avatar")
    if not file_storage:
        return json_error("Выберите аватар")

    try:
        avatar_url = save_uploaded_image(file_storage, "avatars")
    except ValueError as exc:
        return json_error(str(exc))

    conn = get_db()
    try:
        conn.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (avatar_url, uid))
        conn.commit()
        user = conn.execute(
            """
            SELECT id, name, last_name, patronymic, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode
            FROM users
            WHERE id = ?
            """,
            (uid,),
        ).fetchone()
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


@app.post("/api/me/banner")
def api_me_banner():
    uid = require_auth()
    file_storage = request.files.get("banner")
    if not file_storage:
        return json_error("Выберите баннер")

    try:
        banner_url = save_uploaded_image(file_storage, "banners")
    except ValueError as exc:
        return json_error(str(exc))

    conn = get_db()
    try:
        conn.execute("UPDATE users SET banner_url = ? WHERE id = ?", (banner_url, uid))
        conn.commit()
        user = conn.execute(
            """
            SELECT id, name, last_name, patronymic, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode
            FROM users
            WHERE id = ?
            """,
            (uid,),
        ).fetchone()
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


@app.post("/api/me/profile")
def api_me_profile():
    uid = require_auth()
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    patronymic = (payload.get("patronymic") or "").strip()
    about_text = (payload.get("about_text") or "").strip()
    relation_status = (payload.get("relation_status") or "").strip()
    education_place = (payload.get("education_place") or "").strip()
    city = (payload.get("city") or "").strip()
    birth_date = (payload.get("birth_date") or "").strip()
    avatar_frame_url = (payload.get("avatar_frame_url") or "").strip()

    if not name:
        return json_error("Введите имя")
    try:
        birth_date = validate_birth_date(birth_date)
    except ValueError as exc:
        return json_error(str(exc))

    conn = get_db()
    try:
        if avatar_frame_url == "":
            avatar_frame_url = None
        if avatar_frame_url:
            avatar_frame_url = resolve_frame_url(avatar_frame_url)
            if not avatar_frame_url:
                return json_error(
                    f"Некорректная рамка. Нужен SVG или PNG {FRAME_REQUIRED_SIZE}×{FRAME_REQUIRED_SIZE} px"
                )
        conn.execute(
            """
            UPDATE users
            SET name = ?, last_name = ?, patronymic = ?, about_text = ?, relation_status = ?, education_place = ?, city = ?, birth_date = ?, avatar_frame_url = ?
            WHERE id = ?
            """,
            (name, last_name, patronymic, about_text, relation_status, education_place, city, birth_date, avatar_frame_url, uid),
        )
        conn.commit()
        user = conn.execute(
            """
            SELECT id, name, last_name, patronymic, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode
            FROM users
            WHERE id = ?
            """,
            (uid,),
        ).fetchone()
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


POST_SELECT_SQL = """
    SELECT
      p.id AS post_id,
      p.user_id,
      p.content,
      p.created_at,
      p.post_scope,
      p.image_url,
      p.video_url,
      p.file_url,
      p.file_name,
      p.media_json,
      p.original_post_id,
      u.name AS user_name,
      u.avatar_url AS user_avatar_url,
      u.avatar_frame_url AS user_avatar_frame_url,
      op.id AS orig_post_id,
      op.content AS orig_content,
      op.created_at AS orig_created_at,
      op.image_url AS orig_image_url,
      op.video_url AS orig_video_url,
      op.file_url AS orig_file_url,
      op.file_name AS orig_file_name,
      op.media_json AS orig_media_json,
      ou.id AS orig_user_id,
      ou.name AS orig_user_name,
      ou.avatar_url AS orig_user_avatar_url,
      ou.avatar_frame_url AS orig_user_avatar_frame_url,
      (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count,
      EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = ?) AS liked_by_me
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN posts op ON op.id = p.original_post_id
    LEFT JOIN users ou ON ou.id = op.user_id
"""


def author_from_row(row, prefix=""):
    p = prefix
    uid_key = f"{p}user_id" if p else "user_id"
    if p == "orig_":
        uid_key = "orig_user_id"
    return {
        "id": int(row[uid_key]),
        "name": row[f"{p}user_name" if p else "user_name"],
        "avatar_url": build_asset_url(row[f"{p}user_avatar_url" if p else "user_avatar_url"]),
        "avatar_frame_url": resolve_frame_url(
            build_asset_url(row[f"{p}user_avatar_frame_url" if p else "user_avatar_frame_url"])
        ),
    }


def post_media_from_row(row, prefix=""):
    p = prefix
    media_key = f"{p}media_json" if p else "media_json"
    image_key = f"{p}image_url" if p else "image_url"
    video_key = f"{p}video_url" if p else "video_url"
    raw = row[media_key] if media_key in row.keys() else None
    if raw:
        try:
            items = json.loads(raw)
            if isinstance(items, list) and items:
                return [
                    {
                        "type": str(item.get("type") or "image"),
                        "url": build_asset_url(item.get("url")),
                        "name": item.get("name"),
                    }
                    for item in items
                    if item.get("url")
                ]
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    media = []
    image_url = build_asset_url(row[image_key]) if image_key in row.keys() else None
    video_url = build_asset_url(row[video_key]) if video_key in row.keys() else None
    if image_url:
        media.append({"type": "image", "url": image_url})
    if video_url:
        media.append({"type": "video", "url": video_url})
    return media


def row_to_post_dict(row):
    media = post_media_from_row(row)
    post = {
        "id": int(row["post_id"]),
        "content": row["content"] or "",
        "created_at": row["created_at"],
        "post_scope": row["post_scope"] or "feed",
        "image_url": build_asset_url(row["image_url"]),
        "video_url": build_asset_url(row["video_url"]),
        "file_url": build_asset_url(row["file_url"]),
        "file_name": row["file_name"],
        "media": media,
        "likes_count": int(row["likes_count"] or 0),
        "comments_count": int(row["comments_count"] or 0),
        "liked_by_me": bool(row["liked_by_me"]),
        "author": {
            "id": int(row["user_id"]),
            "name": row["user_name"],
            "avatar_url": build_asset_url(row["user_avatar_url"]),
            "avatar_frame_url": resolve_frame_url(build_asset_url(row["user_avatar_frame_url"])),
        },
        "wall_owner": {
            "id": int(row["user_id"]),
            "name": row["user_name"],
            "avatar_url": build_asset_url(row["user_avatar_url"]),
            "avatar_frame_url": resolve_frame_url(build_asset_url(row["user_avatar_frame_url"])),
        },
        "original_post": None,
    }
    if row["original_post_id"] and row["orig_post_id"]:
        post["original_post"] = {
            "id": int(row["orig_post_id"]),
            "content": row["orig_content"] or "",
            "created_at": row["orig_created_at"],
            "image_url": build_asset_url(row["orig_image_url"]),
            "video_url": build_asset_url(row["orig_video_url"]),
            "file_url": build_asset_url(row["orig_file_url"]),
            "file_name": row["orig_file_name"],
            "media": post_media_from_row(row, "orig_"),
            "author": {
                "id": int(row["orig_user_id"]),
                "name": row["orig_user_name"],
                "avatar_url": build_asset_url(row["orig_user_avatar_url"]),
                "avatar_frame_url": resolve_frame_url(build_asset_url(row["orig_user_avatar_frame_url"])),
            },
        }
    return post


def fetch_post_by_id(conn, post_id: int, uid: int):
    row = conn.execute(
        POST_SELECT_SQL + " WHERE p.id = ?",
        (uid, post_id),
    ).fetchone()
    if not row:
        return None
    return row_to_post_dict(row)


def create_post_record(
    conn,
    uid,
    content,
    post_scope,
    image_url=None,
    video_url=None,
    file_url=None,
    file_name=None,
    original_post_id=None,
    media_json=None,
):
    cur = conn.execute(
        """
        INSERT INTO posts (user_id, content, post_scope, image_url, video_url, file_url, file_name, original_post_id, media_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (uid, content, post_scope, image_url, video_url, file_url, file_name, original_post_id, media_json),
    )
    return int(cur.lastrowid)


@app.get("/api/feed")
def api_feed():
    uid = require_auth()
    limit = request.args.get("limit", default="30")
    try:
        limit = max(1, min(100, int(limit)))
    except Exception:
        limit = 30

    conn = get_db()
    try:
        rows = conn.execute(
            POST_SELECT_SQL
            + """
            WHERE p.post_scope = 'feed'
              AND (u.banned IS NULL OR u.banned = 0)
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ?
            """,
            (uid, limit),
        ).fetchall()
        posts = [row_to_post_dict(r) for r in rows]
        return jsonify({"ok": True, "posts": posts})
    finally:
        conn.close()


@app.post("/api/posts")
def api_create_post():
    uid = require_auth()
    image_url = None
    video_url = None
    file_url = None
    file_name = None

    content = (request.form.get("content") or "").strip()
    post_scope = (request.form.get("scope") or "feed").strip().lower()
    payload = request.get_json(silent=True) or {}
    if not content and request.is_json:
        content = (payload.get("content") or "").strip()
    if request.is_json and not request.form.get("scope"):
        post_scope = (payload.get("scope") or "feed").strip().lower()
    if post_scope not in ("feed", "wall"):
        post_scope = "feed"

    media_items = []
    image_files = request.files.getlist("images")
    video_files = request.files.getlist("videos")
    file_storages = request.files.getlist("files")
    image_file = request.files.get("image")
    video_file = request.files.get("video")
    file_storage = request.files.get("file")

    for img in image_files:
        if img and img.filename:
            try:
                media_items.append({"type": "image", "url": save_uploaded_image(img, "post_images")})
            except ValueError as exc:
                return json_error(str(exc))
    if image_file and image_file.filename:
        try:
            media_items.append({"type": "image", "url": save_uploaded_image(image_file, "post_images")})
        except ValueError as exc:
            return json_error(str(exc))

    for vid in video_files:
        if vid and vid.filename:
            try:
                media_items.append({"type": "video", "url": save_uploaded_video(vid, "post_videos")})
            except ValueError as exc:
                return json_error(str(exc))
    if video_file and video_file.filename:
        try:
            media_items.append({"type": "video", "url": save_uploaded_video(video_file, "post_videos")})
        except ValueError as exc:
            return json_error(str(exc))

    for fs in file_storages:
        if fs and fs.filename:
            try:
                uploaded_url, uploaded_name = save_uploaded_file(fs, "post_files")
                media_items.append({"type": "file", "url": uploaded_url, "name": uploaded_name})
                file_url = uploaded_url
                file_name = uploaded_name
            except ValueError as exc:
                return json_error(str(exc))
    if file_storage and file_storage.filename:
        try:
            uploaded_url, uploaded_name = save_uploaded_file(file_storage, "post_files")
            media_items.append({"type": "file", "url": uploaded_url, "name": uploaded_name})
            file_url = uploaded_url
            file_name = uploaded_name
        except ValueError as exc:
            return json_error(str(exc))

    image_url = next((m["url"] for m in media_items if m["type"] == "image"), None)
    video_url = next((m["url"] for m in media_items if m["type"] == "video"), None)
    media_json = json.dumps(media_items, ensure_ascii=False) if media_items else None

    if not content and not media_items:
        return json_error("Добавьте текст или вложение")
    if len(content) > 4000:
        return json_error("Слишком длинный пост")

    if post_scope == "wall":
        wall_user_id = request.form.get("wall_user_id") or payload.get("wall_user_id")
        if wall_user_id is not None:
            try:
                if int(wall_user_id) != uid:
                    return json_error("Можно публиковать только на своей стене", 403)
            except (TypeError, ValueError):
                return json_error("Некорректный wall_user_id", 400)

    conn = get_db()
    try:
        post_id = create_post_record(
            conn, uid, content, post_scope, image_url, video_url, file_url, file_name, None, media_json
        )
        conn.commit()
        return jsonify({"ok": True, "post_id": post_id, "post": fetch_post_by_id(conn, post_id, uid)})
    finally:
        conn.close()


@app.delete("/api/posts/<int:post_id>")
def api_delete_post(post_id: int):
    uid = require_auth()
    conn = get_db()
    try:
        me = conn.execute("SELECT god_mode FROM users WHERE id = ?", (uid,)).fetchone()
        if not me:
            return json_error("unauthorized", 401)
        post = conn.execute("SELECT user_id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return json_error("post not found", 404)
        owner_id = int(post["user_id"])
        is_god = int(me["god_mode"] or 0) == 1
        if owner_id != uid and not is_god:
            return json_error("forbidden", 403)
        conn.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
        conn.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))
        conn.execute("DELETE FROM posts WHERE original_post_id = ?", (post_id,))
        conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.post("/api/posts/<int:post_id>/like")
def api_toggle_like(post_id: int):
    uid = require_auth()
    conn = get_db()
    try:
        post = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return json_error("post not found", 404)
        existing = conn.execute(
            "SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?",
            (post_id, uid),
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, uid))
            liked = False
        else:
            conn.execute("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)", (post_id, uid))
            liked = True
        conn.commit()
        count = conn.execute(
            "SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?",
            (post_id,),
        ).fetchone()
        return jsonify({"ok": True, "liked": liked, "likes_count": int(count["c"])})
    finally:
        conn.close()


@app.get("/api/posts/<int:post_id>/comments")
def api_post_comments(post_id: int):
    require_auth()
    conn = get_db()
    try:
        post = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return json_error("post not found", 404)
        rows = conn.execute(
            """
            SELECT c.id, c.content, c.created_at, u.id AS user_id, u.name, u.avatar_url, u.avatar_frame_url
            FROM post_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC, c.id ASC
            """,
            (post_id,),
        ).fetchall()
        comments = [
            {
                "id": int(r["id"]),
                "content": r["content"],
                "created_at": r["created_at"],
                "author": {
                    "id": int(r["user_id"]),
                    "name": r["name"],
                    "avatar_url": build_asset_url(r["avatar_url"]),
                    "avatar_frame_url": build_asset_url(r["avatar_frame_url"]),
                },
            }
            for r in rows
        ]
        return jsonify({"ok": True, "comments": comments})
    finally:
        conn.close()


@app.post("/api/posts/<int:post_id>/comments")
def api_add_comment(post_id: int):
    uid = require_auth()
    payload = request.get_json(silent=True) or {}
    content = (payload.get("content") or "").strip()
    if not content:
        return json_error("Введите комментарий")
    if len(content) > 2000:
        return json_error("Слишком длинный комментарий")

    conn = get_db()
    try:
        post = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return json_error("post not found", 404)
        cur = conn.execute(
            "INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)",
            (post_id, uid, content),
        )
        conn.commit()
        comment_id = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT c.id, c.content, c.created_at, u.id AS user_id, u.name, u.avatar_url, u.avatar_frame_url
            FROM post_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = ?
            """,
            (comment_id,),
        ).fetchone()
        comment = {
            "id": int(row["id"]),
            "content": row["content"],
            "created_at": row["created_at"],
            "author": {
                "id": int(row["user_id"]),
                "name": row["name"],
                "avatar_url": build_asset_url(row["avatar_url"]),
                "avatar_frame_url": build_asset_url(row["avatar_frame_url"]),
            },
        }
        return jsonify({"ok": True, "comment": comment})
    finally:
        conn.close()


@app.post("/api/posts/<int:post_id>/repost")
def api_repost(post_id: int):
    uid = require_auth()
    payload = request.get_json(silent=True) or {}
    target = (payload.get("target") or "").strip().lower()
    peer_id = payload.get("peer_id")

    conn = get_db()
    try:
        source = conn.execute("SELECT id, user_id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not source:
            return json_error("post not found", 404)

        if target == "wall":
            new_id = create_post_record(conn, uid, "", "wall", original_post_id=post_id)
            conn.commit()
            return jsonify({"ok": True, "post_id": new_id, "post": fetch_post_by_id(conn, new_id, uid)})

        if target == "chat":
            try:
                peer_id = int(peer_id)
            except Exception:
                return json_error("Укажите друга")
            if peer_id == uid:
                return json_error("Нельзя отправить себе")
            peer = conn.execute(
                "SELECT id FROM users WHERE id = ? AND (banned IS NULL OR banned = 0)",
                (peer_id,),
            ).fetchone()
            if not peer:
                return json_error("Пользователь не найден", 404)

            pair = conn.execute(
                """
                SELECT chat_id
                FROM chat_participants
                WHERE user_id IN (?, ?)
                GROUP BY chat_id
                HAVING COUNT(*) = 2
                """,
                (uid, peer_id),
            ).fetchone()
            if pair:
                chat_id = int(pair["chat_id"])
            else:
                cur = conn.execute("INSERT INTO chats DEFAULT VALUES")
                chat_id = int(cur.lastrowid)
                conn.execute(
                    "INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)",
                    (chat_id, uid),
                )
                conn.execute(
                    "INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)",
                    (chat_id, peer_id),
                )

            cur = conn.execute(
                "INSERT INTO messages (chat_id, sender_id, content, message_type, repost_post_id) VALUES (?, ?, ?, 'repost', ?)",
                (chat_id, uid, "", post_id),
            )
            conn.commit()
            return jsonify({"ok": True, "chat_id": chat_id, "message_id": int(cur.lastrowid)})

        return json_error("Укажите target: wall или chat")
    finally:
        conn.close()


@app.post("/api/admin/ban")
def api_admin_ban():
    uid = require_auth()
    payload = request.get_json(silent=True) or {}
    target_id = payload.get("user_id")
    try:
        target_id = int(target_id)
    except Exception:
        return json_error("Некорректный user_id")
    if target_id == uid:
        return json_error("Нельзя забанить себя", 400)

    conn = get_db()
    try:
        if not is_god(conn, uid):
            return json_error("forbidden", 403)
        exists = conn.execute("SELECT id FROM users WHERE id = ?", (target_id,)).fetchone()
        if not exists:
            return json_error("Пользователь не найден", 404)
        conn.execute("UPDATE users SET banned = 1 WHERE id = ?", (target_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/admin/users/<int:target_id>")
def api_admin_delete_user(target_id: int):
    uid = require_auth()
    if target_id == uid:
        return json_error("Нельзя удалить себя", 400)

    conn = get_db()
    try:
        if not is_god(conn, uid):
            return json_error("forbidden", 403)
        exists = conn.execute("SELECT id FROM users WHERE id = ?", (target_id,)).fetchone()
        if not exists:
            return json_error("Пользователь не найден", 404)
        delete_user_completely(conn, target_id)
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/admin/messages/<int:message_id>")
def api_admin_delete_message(message_id: int):
    uid = require_auth()
    conn = get_db()
    try:
        if not is_god(conn, uid):
            return json_error("forbidden", 403)
        msg = conn.execute("SELECT id FROM messages WHERE id = ?", (message_id,)).fetchone()
        if not msg:
            return json_error("Сообщение не найдено", 404)
        conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/admin/posts/<int:post_id>")
def api_admin_delete_post(post_id: int):
    uid = require_auth()
    conn = get_db()
    try:
        if not is_god(conn, uid):
            return json_error("forbidden", 403)
        post = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return json_error("post not found", 404)
        conn.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
        conn.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))
        conn.execute("DELETE FROM messages WHERE repost_post_id = ?", (post_id,))
        conn.execute("DELETE FROM posts WHERE original_post_id = ?", (post_id,))
        conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/users")
def api_users():
    uid = require_auth()
    q = (request.args.get("q") or "").strip().lower()
    limit = request.args.get("limit", default="50")

    try:
        limit = max(1, min(100, int(limit)))
    except Exception:
        limit = 50

    conn = get_db()
    try:
        if q:
            rows = conn.execute(
                """
                SELECT id, name, avatar_url, avatar_frame_url, god_mode
                FROM users
                WHERE id != ? AND (banned IS NULL OR banned = 0) AND lower(name) LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (uid, f"%{q}%", limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, name, avatar_url, avatar_frame_url, god_mode
                FROM users
                WHERE id != ? AND (banned IS NULL OR banned = 0)
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (uid, limit),
            ).fetchall()

        users = [user_to_public_dict(r) for r in rows]
        return jsonify({"ok": True, "users": users})
    finally:
        conn.close()


@app.get("/api/contacts")
def api_contacts():
    uid = require_auth()
    limit = request.args.get("limit", default="50")
    q = (request.args.get("q") or "").strip().lower()

    try:
        limit = max(1, min(100, int(limit)))
    except Exception:
        limit = 50

    conn = get_db()
    try:
        sql = """
            SELECT DISTINCT
              u.id, u.name, u.last_name, u.patronymic, u.avatar_url, u.avatar_frame_url, u.god_mode
            FROM chat_participants cp_self
            JOIN chat_participants cp_peer
              ON cp_peer.chat_id = cp_self.chat_id AND cp_peer.user_id != cp_self.user_id
            JOIN users u ON u.id = cp_peer.user_id
            JOIN messages m ON m.chat_id = cp_self.chat_id
            WHERE cp_self.user_id = ?
              AND (u.banned IS NULL OR u.banned = 0)
        """
        params: list = [uid]
        if q:
            sql += " AND lower(u.name) LIKE ?"
            params.append(f"%{q}%")
        sql += " ORDER BY u.name LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, tuple(params)).fetchall()
        users = [user_to_public_dict(r) for r in rows]
        return jsonify({"ok": True, "users": users})
    finally:
        conn.close()


@app.get("/api/users/<int:user_id>")
def api_user(user_id: int):
    require_auth()
    conn = get_db()
    try:
        user = conn.execute(
            """
            SELECT id, name, last_name, patronymic, avatar_url, avatar_frame_url, banner_url, about_text, relation_status, education_place, city, birth_date, god_mode
            FROM users
            WHERE id = ? AND (banned IS NULL OR banned = 0)
            """,
            (user_id,),
        ).fetchone()
        if not user:
            return json_error("user not found", 404)
        return jsonify({"ok": True, "user": user_to_public_dict(user)})
    finally:
        conn.close()


@app.get("/assets/frames/<path:filename>")
def serve_frames(filename: str):
    # frames лежат в /assets/frames и должны отдаваться как статика
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    return send_from_directory(str(FRAMES_DIR), filename)


@app.get("/assets/stickers/<path:filename>")
def serve_stickers(filename: str):
    STICKERS_DIR.mkdir(parents=True, exist_ok=True)
    return send_from_directory(str(STICKERS_DIR), filename)


@app.get("/api/users/<int:user_id>/posts")
def api_user_posts(user_id: int):
    uid = require_auth()
    limit = request.args.get("limit", default="50")
    try:
        limit = max(1, min(100, int(limit)))
    except Exception:
        limit = 50

    conn = get_db()
    try:
        rows = conn.execute(
            POST_SELECT_SQL
            + """
            WHERE p.post_scope = 'wall' AND p.user_id = ?
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ?
            """,
            (uid, user_id, limit),
        ).fetchall()
        posts = [row_to_post_dict(r) for r in rows]
        return jsonify({"ok": True, "posts": posts})
    finally:
        conn.close()


@app.get("/api/posts/<int:post_id>")
def api_get_post(post_id: int):
    uid = require_auth()
    conn = get_db()
    try:
        post = fetch_post_by_id(conn, post_id, uid)
        if not post:
            return json_error("post not found", 404)
        return jsonify({"ok": True, "post": post})
    finally:
        conn.close()


def is_god(conn, uid: int) -> bool:
    row = conn.execute("SELECT god_mode FROM users WHERE id = ?", (uid,)).fetchone()
    return bool(row) and int(row["god_mode"] or 0) == 1


def delete_user_completely(conn, user_id: int):
    post_rows = conn.execute("SELECT id FROM posts WHERE user_id = ?", (user_id,)).fetchall()
    post_ids = [int(r["id"]) for r in post_rows]
    if post_ids:
        placeholders = ",".join("?" * len(post_ids))
        conn.execute(f"DELETE FROM messages WHERE repost_post_id IN ({placeholders})", post_ids)
    for pid in post_ids:
        conn.execute("DELETE FROM post_likes WHERE post_id = ?", (pid,))
        conn.execute("DELETE FROM post_comments WHERE post_id = ?", (pid,))
    conn.execute("DELETE FROM posts WHERE original_post_id IN (SELECT id FROM posts WHERE user_id = ?)", (user_id,))
    conn.execute("DELETE FROM posts WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM post_likes WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM post_comments WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM messages WHERE sender_id = ?", (user_id,))
    conn.execute("DELETE FROM chat_participants WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def grant_admin_by_email(email: str) -> bool:
    email = (email or "").strip().lower()
    if not email:
        print("Укажите email: python server.py grant-admin user@example.com")
        return False
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, email, name, god_mode FROM users WHERE lower(email) = ?",
            (email,),
        ).fetchone()
        if not row:
            print(f"Пользователь с email «{email}» не найден.")
            return False
        conn.execute("UPDATE users SET god_mode = 1 WHERE id = ?", (int(row["id"]),))
        conn.commit()
        print(f"Админ выдан: {row['name']} <{row['email']}> (id={row['id']})")
        return True
    finally:
        conn.close()


def revoke_admin_by_email(email: str) -> bool:
    email = (email or "").strip().lower()
    if not email:
        print("Укажите email: python server.py revoke-admin user@example.com")
        return False
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, email, name, god_mode FROM users WHERE lower(email) = ?",
            (email,),
        ).fetchone()
        if not row:
            print(f"Пользователь с email «{email}» не найден.")
            return False
        conn.execute("UPDATE users SET god_mode = 0 WHERE id = ?", (int(row["id"]),))
        conn.commit()
        print(f"Админ снят: {row['name']} <{row['email']}> (id={row['id']})")
        return True
    finally:
        conn.close()


def user_in_chat(conn, chat_id: int, user_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?",
        (chat_id, user_id),
    ).fetchone()
    return bool(row)


@app.post("/api/chats/find-or-create")
def api_chat_find_or_create():
    uid = require_auth()
    payload = request.get_json(silent=True) or {}
    peer_id = payload.get("peer_id")
    try:
        peer_id = int(peer_id)
    except Exception:
        return json_error("Некорректный peer_id")

    if peer_id == uid:
        return json_error("Нельзя создать чат с собой")

    conn = get_db()
    try:
        peer = conn.execute("SELECT id FROM users WHERE id = ? AND (banned IS NULL OR banned = 0)", (peer_id,)).fetchone()
        if not peer:
            return json_error("Пользователь не найден", 404)

        pair = conn.execute(
            """
            SELECT chat_id
            FROM chat_participants
            WHERE user_id IN (?, ?)
            GROUP BY chat_id
            HAVING COUNT(*) = 2
            """,
            (uid, peer_id),
        ).fetchone()

        if pair:
            return jsonify({"ok": True, "chat_id": int(pair["chat_id"])})

        cur = conn.execute("INSERT INTO chats DEFAULT VALUES")
        chat_id = int(cur.lastrowid)
        conn.execute(
            "INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)",
            (chat_id, uid),
        )
        conn.execute(
            "INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)",
            (chat_id, peer_id),
        )
        conn.commit()
        return jsonify({"ok": True, "chat_id": chat_id})
    finally:
        conn.close()


@app.get("/api/chats")
def api_chats():
    uid = require_auth()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT
              c.id AS chat_id,
              u2.id AS peer_id,
              u2.name AS peer_name,
              u2.last_name AS peer_last_name,
              u2.patronymic AS peer_patronymic,
              u2.avatar_url AS peer_avatar_url,
              u2.avatar_frame_url AS peer_avatar_frame_url,
              lm.content AS last_message_content,
              lm.message_type AS last_message_type,
              lm.image_url AS last_message_image_url,
              lm.created_at AS last_message_created_at
            FROM chats c
            JOIN chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = ?
            JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id != ?
            JOIN users u2 ON u2.id = cp2.user_id AND (u2.banned IS NULL OR u2.banned = 0)
            LEFT JOIN messages lm ON lm.id = (
              SELECT m2.id
              FROM messages m2
              WHERE m2.chat_id = c.id
              ORDER BY m2.created_at DESC, m2.id DESC
              LIMIT 1
            )
            ORDER BY c.created_at DESC, c.id DESC
            """,
            (uid, uid),
        ).fetchall()

        chats = [
            {
                "chat_id": int(r["chat_id"]),
                "peer": {
                    "id": int(r["peer_id"]),
                    "name": r["peer_name"],
                    "display_name": format_display_name(r["peer_name"], r["peer_last_name"], r["peer_patronymic"]),
                    "avatar_url": build_asset_url(r["peer_avatar_url"]),
                    "avatar_frame_url": resolve_frame_url(build_asset_url(r["peer_avatar_frame_url"])),
                },
                "last_message": {
                    "content": r["last_message_content"] or "",
                    "message_type": r["last_message_type"] or "text",
                    "image_url": build_asset_url(r["last_message_image_url"]),
                    "created_at": r["last_message_created_at"],
                }
                if r["last_message_created_at"]
                else None,
            }
            for r in rows
        ]
        return jsonify({"ok": True, "chats": chats})
    finally:
        conn.close()


@app.get("/api/chats/<int:chat_id>/messages")
def api_messages(chat_id: int):
    uid = require_auth()
    limit = request.args.get("limit", default="50")
    try:
        limit = max(1, min(200, int(limit)))
    except Exception:
        limit = 50

    conn = get_db()
    try:
        if not user_in_chat(conn, chat_id, uid):
            return json_error("chat not found", 404)

        rows = conn.execute(
            """
            SELECT
              m.id,
              m.sender_id,
              m.content,
              m.message_type,
              m.image_url,
              m.sticker_url,
              m.audio_url,
              m.waveform,
              m.video_url,
              m.repost_post_id,
              m.created_at,
              u.name AS sender_name,
              u.last_name AS sender_last_name,
              u.patronymic AS sender_patronymic,
              u.avatar_url AS sender_avatar_url,
              u.avatar_frame_url AS sender_avatar_frame_url
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.chat_id = ?
            ORDER BY m.created_at ASC, m.id ASC
            LIMIT ?
            """,
            (chat_id, limit),
        ).fetchall()

        messages = []
        for r in rows:
            msg = {
                "id": int(r["id"]),
                "sender_id": int(r["sender_id"]),
                "sender_name": format_display_name(r["sender_name"], r["sender_last_name"], r["sender_patronymic"]),
                "content": r["content"],
                "message_type": r["message_type"] or "text",
                "image_url": build_asset_url(r["image_url"]),
                "sticker_url": build_asset_url(r["sticker_url"]),
                "audio_url": build_asset_url(r["audio_url"]),
                "video_url": build_asset_url(r["video_url"]),
                "waveform": r["waveform"] or "",
                "sender_avatar_url": build_asset_url(r["sender_avatar_url"]),
                "sender_avatar_frame_url": resolve_frame_url(build_asset_url(r["sender_avatar_frame_url"])),
                "created_at": r["created_at"],
                "repost_post": None,
            }
            if r["repost_post_id"]:
                msg["repost_post"] = fetch_post_by_id(conn, int(r["repost_post_id"]), uid)
            messages.append(msg)
        return jsonify({"ok": True, "messages": messages})
    finally:
        conn.close()


@app.post("/api/chats/<int:chat_id>/messages")
def api_send_message(chat_id: int):
    uid = require_auth()
    conn = get_db()
    try:
        if not user_in_chat(conn, chat_id, uid):
            return json_error("chat not found", 404)

        image_url = None
        video_url = None
        sticker_url = None
        audio_url = None
        waveform = ""

        content = (request.form.get("content") or "").strip()
        payload = request.get_json(silent=True) or {}
        if not content and request.is_json:
            content = (payload.get("content") or "").strip()

        image_file = request.files.get("image")
        video_file = request.files.get("video")
        audio_file = request.files.get("audio")
        if image_file and image_file.filename:
            try:
                image_url = save_uploaded_image(image_file, "chat_images")
            except ValueError as exc:
                return json_error(str(exc))
        if video_file and video_file.filename:
            try:
                video_url = save_uploaded_video(video_file, "chat_videos")
            except ValueError as exc:
                return json_error(str(exc))
        if audio_file and audio_file.filename:
            try:
                audio_url = save_uploaded_audio(audio_file, "voice")
                waveform = (request.form.get("waveform") or "").strip()
            except ValueError as exc:
                return json_error(str(exc))

        if request.is_json:
            sticker_url = payload.get("sticker_url") or None
            if not waveform:
                waveform = (payload.get("waveform") or "").strip()

        if not content and not image_url and not video_url and not sticker_url and not audio_url:
            return json_error("Введите текст сообщения или добавьте вложение")
        if len(content) > 4000:
            return json_error("Сообщение слишком длинное")
        if sticker_url and not str(sticker_url).startswith("/assets/stickers/"):
            return json_error("Некорректный стикер")

        if audio_url:
            message_type = "voice"
        elif video_url:
            message_type = "video"
        elif sticker_url:
            message_type = "sticker"
        elif image_url:
            message_type = "image"
        else:
            message_type = "text"

        cur = conn.execute(
            "INSERT INTO messages (chat_id, sender_id, content, message_type, image_url, sticker_url, audio_url, waveform, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (chat_id, uid, content, message_type, image_url, sticker_url, audio_url, waveform, video_url),
        )
        conn.commit()
        return jsonify({"ok": True, "message_id": int(cur.lastrowid)})
    finally:
        conn.close()


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    # /api... должно обслуживаться только роутами выше
    if path.startswith("api"):
        abort(404)

    if path == "":
        return redirect("/auth/index.html")

    target = BASE_DIR / path
    if target.is_file():
        # send_from_directory ожидает директорию
        return send_from_directory(str(BASE_DIR), path)

    if target.is_dir():
        index_file = target / "index.html"
        if index_file.exists():
            return send_from_directory(str(target), "index.html")

    abort(404)


def run_cli():
    import sys

    if len(sys.argv) < 2:
        return False
    init_db()
    cmd = sys.argv[1].strip().lower()
    if cmd == "grant-admin":
        if len(sys.argv) < 3:
            print("Использование: python server.py grant-admin user@example.com")
            return True
        grant_admin_by_email(sys.argv[2])
        return True
    if cmd == "revoke-admin":
        if len(sys.argv) < 3:
            print("Использование: python server.py revoke-admin user@example.com")
            return True
        revoke_admin_by_email(sys.argv[2])
        return True
    if cmd in ("help", "--help", "-h"):
        print("Команды консоли:")
        print("  python server.py grant-admin user@example.com  — выдать админку")
        print("  python server.py revoke-admin user@example.com — снять админку")
        return True
    return False


if __name__ == "__main__":
    if run_cli():
        raise SystemExit(0)
    init_db()
    # Для друзей по сети: host="0.0.0.0"
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")), debug=True)

