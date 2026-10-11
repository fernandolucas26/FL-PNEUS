import base64
import hmac
import json
import mimetypes
import os
import re
import secrets
import socket
import sqlite3
import threading
import time
import uuid
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("FL_DATA_DIR", str(ROOT)))
DATABASE = DATA_DIR / "fl_pneus.sqlite3"
UPLOADS = DATA_DIR / "uploads"
USERNAME = os.environ.get("FL_ADMIN_USER", "admin")
PASSWORD = os.environ.get("FL_ADMIN_PASSWORD", "flpneus123")
SESSIONS = {}
LOGIN_FAILURES = {}
LOGIN_LOCK = threading.Lock()
MAX_REQUEST_SIZE = 4 * 1024 * 1024
MAX_IMAGE_SIZE = 2 * 1024 * 1024
ALLOWED_IMAGES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
PUBLIC_FILES = {
    "/", "/index.html", "/checkout.html", "/status.html", "/login.html", "/admin.html",
    "/styles.css", "/script.js", "/checkout.js", "/status.js", "/login.js", "/admin.js",
}
DEFAULT_PRODUCTS = [
    {"id": 1, "name": "RoadMax 205/55R16", "brand": "Bridgestone", "category": "carro", "price": 489, "stock": 18, "badge": "Mais vendido", "description": "Desempenho urbano com maior aderência e conforto."},
    {"id": 2, "name": "TrailPro 225/65R17", "brand": "Pirelli", "category": "suv", "price": 699, "stock": 7, "badge": "Top", "description": "Para rodar com estabilidade em estradas e cidade."},
    {"id": 3, "name": "StreetRide 120/70R17", "brand": "Michelin", "category": "moto", "price": 319, "stock": 12, "badge": "Popular", "description": "Tração firme com excelente resposta em curvas."},
    {"id": 4, "name": "HeavyDrive 245/75R16", "brand": "Continental", "category": "caminhao", "price": 899, "stock": 5, "badge": "Carga", "description": "Resistência e estabilidade para uso diário e pesado."},
]


def connect_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def image_path(image_data):
    if not image_data:
        return ""
    if image_data.startswith("/uploads/"):
        filename = Path(image_data).name
        if filename == image_data.removeprefix("/uploads/"):
            return f"/uploads/{filename}"
        raise ValueError("Caminho de imagem inválido.")
    if not image_data.startswith("data:"):
        raise ValueError("Formato de imagem inválido.")

    header, separator, encoded = image_data.partition(",")
    mime_type = header[5:].split(";", 1)[0].lower()
    extension = ALLOWED_IMAGES.get(mime_type)
    if not separator or not extension or ";base64" not in header:
        raise ValueError("Use uma imagem JPEG, PNG, WEBP ou GIF.")

    image_bytes = base64.b64decode(encoded, validate=True)
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise ValueError("A imagem deve ter no máximo 2 MB.")

    UPLOADS.mkdir(exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (UPLOADS / filename).write_bytes(image_bytes)
    return f"/uploads/{filename}"


def product_from_row(row):
    return dict(row)


def initialize_database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                brand TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER NOT NULL,
                badge TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                image TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                vehicle TEXT NOT NULL,
                service_type TEXT NOT NULL,
                payment_method TEXT NOT NULL,
                installments INTEGER NOT NULL,
                payment_label TEXT NOT NULL,
                notes TEXT NOT NULL,
                subtotal REAL NOT NULL,
                discount REAL NOT NULL,
                total REAL NOT NULL,
                status TEXT NOT NULL,
                items TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        if connection.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            connection.executemany(
                "INSERT INTO products (id, name, brand, category, price, stock, badge, description) VALUES (:id, :name, :brand, :category, :price, :stock, :badge, :description)",
                DEFAULT_PRODUCTS,
            )
        connection.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('legacy_migrated', '0')")


class DualStackHTTPServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class StoreHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format_string, *args):
        print(f"{self.log_date_time_string()} {format_string % args}")

    def send_json(self, payload, status=HTTPStatus.OK, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > MAX_REQUEST_SIZE:
            raise ValueError("A solicitação excede o limite permitido.")
        raw = self.rfile.read(size) if size else b"{}"
        return json.loads(raw.decode("utf-8"))

    def is_authenticated(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        token = cookie.get("fl_admin_session")
        if not token:
            return False
        expires_at = SESSIONS.get(token.value, 0)
        if expires_at <= time.time():
            SESSIONS.pop(token.value, None)
            return False
        return True

    def require_admin(self):
        if not self.is_authenticated():
            self.send_json({"error": "Acesso restrito ao administrador."}, HTTPStatus.UNAUTHORIZED)
            return False
        return True

    def check_login_rate(self):
        address = self.client_address[0]
        now = time.time()
        with LOGIN_LOCK:
            attempts, reset_at = LOGIN_FAILURES.get(address, (0, now + 900))
            if reset_at <= now:
                LOGIN_FAILURES.pop(address, None)
                return True
            return attempts < 10

    def record_login_failure(self):
        address = self.client_address[0]
        now = time.time()
        with LOGIN_LOCK:
            attempts, reset_at = LOGIN_FAILURES.get(address, (0, now + 900))
            if reset_at <= now:
                attempts, reset_at = 0, now + 900
            LOGIN_FAILURES[address] = (attempts + 1, reset_at)

    def clear_login_failures(self):
        with LOGIN_LOCK:
            LOGIN_FAILURES.pop(self.client_address[0], None)

    def serve_static_file(self, head_only=False):
        path = unquote(urlparse(self.path).path)
        if path == "/":
            path = "/index.html"

        if path.startswith("/uploads/"):
            filename = path.removeprefix("/uploads/")
            if not re.fullmatch(r"[a-f0-9]{32}\.(jpg|png|webp|gif)", filename):
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            file_path = UPLOADS / filename
            if not file_path.is_file() or file_path.resolve().parent != UPLOADS.resolve():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        elif path in PUBLIC_FILES:
            file_path = ROOT / path.lstrip("/")
        else:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        if not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "public, max-age=3600" if path.startswith("/uploads/") else "no-cache")
        self.end_headers()
        if not head_only:
            with file_path.open("rb") as file_handle:
                self.copyfile(file_handle, self.wfile)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/products":
            with connect_db() as connection:
                products = [product_from_row(row) for row in connection.execute("SELECT * FROM products ORDER BY id")]
            self.send_json(products)
            return

        if path == "/api/session":
            self.send_json({"authenticated": self.is_authenticated()})
            return

        if path == "/api/health":
            self.send_json({"ok": True})
            return

        if path == "/api/orders":
            if not self.require_admin():
                return
            with connect_db() as connection:
                rows = connection.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
            self.send_json([self.order_from_row(row) for row in rows])
            return

        if path.startswith("/api/orders/"):
            order_id = path.rsplit("/", 1)[-1]
            with connect_db() as connection:
                row = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
            if not row:
                self.send_json({"error": "Pedido não encontrado."}, HTTPStatus.NOT_FOUND)
                return
            self.send_json(self.order_from_row(row))
            return

        if path.startswith("/api/"):
            self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)
            return

        self.serve_static_file()

    def do_HEAD(self):
        self.serve_static_file(head_only=True)

    @staticmethod
    def order_from_row(row):
        order = dict(row)
        order["customerName"] = order.pop("customer_name")
        order["serviceType"] = order.pop("service_type")
        order["paymentMethod"] = order.pop("payment_method")
        order["paymentLabel"] = order.pop("payment_label")
        order["items"] = json.loads(order["items"])
        order["createdAt"] = order.pop("created_at")
        return order

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        try:
            data = self.read_json()
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error) or "JSON inválido."}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/login":
            if not self.check_login_rate():
                self.send_json({"error": "Muitas tentativas. Aguarde 15 minutos."}, HTTPStatus.TOO_MANY_REQUESTS)
                return
            username_ok = hmac.compare_digest(str(data.get("username", "")), USERNAME)
            password_ok = hmac.compare_digest(str(data.get("password", "")), PASSWORD)
            if not username_ok or not password_ok:
                self.record_login_failure()
                self.send_json({"error": "Usuário ou senha incorretos."}, HTTPStatus.UNAUTHORIZED)
                return
            self.clear_login_failures()
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = time.time() + 86400
            secure_cookie = "; Secure" if os.environ.get("RENDER") else ""
            self.send_json({"ok": True}, extra_headers={"Set-Cookie": f"fl_admin_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400{secure_cookie}"})
            return

        if path == "/api/logout":
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            token = cookie.get("fl_admin_session")
            if token:
                SESSIONS.pop(token.value, None)
            self.send_json({"ok": True}, extra_headers={"Set-Cookie": "fl_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
            return

        if path == "/api/products/migrate":
            if not self.require_admin():
                return
            products = data.get("products", [])
            with connect_db() as connection:
                migrated = connection.execute("SELECT value FROM settings WHERE key = 'legacy_migrated'").fetchone()[0]
                if migrated == "0":
                    for product in products:
                        self.save_product(connection, product)
                    connection.execute("UPDATE settings SET value = '1' WHERE key = 'legacy_migrated'")
            self.send_json({"ok": True})
            return

        if path == "/api/products":
            if not self.require_admin():
                return
            try:
                with connect_db() as connection:
                    product_id = self.save_product(connection, data)
                    row = connection.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
                self.send_json(product_from_row(row), HTTPStatus.CREATED)
            except (ValueError, TypeError, sqlite3.Error) as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/orders":
            try:
                order = self.create_order(data)
                self.send_json(order, HTTPStatus.CREATED)
            except (ValueError, TypeError, sqlite3.Error) as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    @staticmethod
    def save_product(connection, data):
        name = str(data.get("name", "")).strip()
        brand = str(data.get("brand", "")).strip()
        category = str(data.get("category", "carro")).strip()
        price = float(data.get("price", 0))
        stock = int(data.get("stock", 0))
        if not name or not brand or price <= 0 or stock < 0:
            raise ValueError("Preencha corretamente os dados do pneu.")

        image = image_path(str(data.get("image", "")))
        values = (name, brand, category, price, stock, str(data.get("badge", "Novo")), str(data.get("description", "Produto cadastrado pela loja.")), image)
        product_id = data.get("id")
        if product_id is not None:
            connection.execute(
                """INSERT INTO products (id, name, brand, category, price, stock, badge, description, image)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, brand=excluded.brand, category=excluded.category,
                price=excluded.price, stock=excluded.stock, badge=excluded.badge, description=excluded.description, image=excluded.image""",
                (int(product_id), *values),
            )
            return int(product_id)

        cursor = connection.execute(
            "INSERT INTO products (name, brand, category, price, stock, badge, description, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            values,
        )
        return cursor.lastrowid

    def create_order(self, data):
        customer_name = str(data.get("customerName", "")).strip()
        phone = str(data.get("phone", "")).strip()
        vehicle = str(data.get("vehicle", "")).strip()
        service_type = str(data.get("serviceType", "Retirada na loja"))
        payment_method = str(data.get("paymentMethod", "PIX"))
        installments = int(data.get("installments", 1))
        notes = str(data.get("notes", "")).strip()
        requested_items = data.get("items", [])
        if not customer_name or not phone or not vehicle or not requested_items:
            raise ValueError("Preencha seus dados e selecione pelo menos um produto.")
        if payment_method not in {"PIX", "Débito", "Crédito", "Na loja"}:
            raise ValueError("Forma de pagamento inválida.")
        if installments < 1 or installments > 12 or (payment_method not in {"Crédito"} and installments != 1):
            raise ValueError("Parcelamento inválido para a forma de pagamento escolhida.")

        order_items = []
        with connect_db() as connection:
            connection.execute("BEGIN IMMEDIATE")
            subtotal = 0.0
            for requested in requested_items:
                product = connection.execute("SELECT * FROM products WHERE id = ?", (int(requested.get("id")),)).fetchone()
                quantity = int(requested.get("qty", 0))
                if not product or quantity < 1:
                    raise ValueError("Um produto do carrinho não está disponível.")
                if product["stock"] < quantity:
                    raise ValueError(f"Estoque insuficiente para {product['name']}.")
                connection.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (quantity, product["id"]))
                subtotal += product["price"] * quantity
                order_items.append({"id": product["id"], "name": product["name"], "qty": quantity, "price": product["price"]})

            discount = round(subtotal * 0.05, 2) if payment_method == "PIX" else 0
            total = subtotal - discount
            if payment_method == "Crédito" and installments > 4:
                total = round(subtotal * (1 + 0.025 * (installments - 4)), 2)
            payment_label = "Pagamento a combinar na loja" if payment_method == "Na loja" else "PIX à vista com 5% de desconto" if payment_method == "PIX" else "Débito à vista" if payment_method == "Débito" else f"Crédito em {installments}x {'com juros' if installments > 4 else 'sem juros'}"
            order_id = uuid.uuid4().hex.upper()
            created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            connection.execute(
                """INSERT INTO orders (id, customer_name, phone, vehicle, service_type, payment_method, installments,
                payment_label, notes, subtotal, discount, total, status, items, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Novo', ?, ?)""",
                (order_id, customer_name, phone, vehicle, service_type, payment_method, installments, payment_label,
                 notes, subtotal, discount, total, json.dumps(order_items, ensure_ascii=False), created_at),
            )
            order = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        return self.order_from_row(order)

    def do_PUT(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith("/api/orders/"):
            if not self.require_admin():
                return
            try:
                data = self.read_json()
                status = str(data.get("status", ""))
                allowed = {"Novo", "Em preparação", "Pronto para retirada", "Finalizado"}
                if status not in allowed:
                    raise ValueError("Status de pedido inválido.")
                order_id = path.rsplit("/", 1)[-1]
                with connect_db() as connection:
                    cursor = connection.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
                    if cursor.rowcount == 0:
                        self.send_json({"error": "Pedido não encontrado."}, HTTPStatus.NOT_FOUND)
                        return
                    row = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
                self.send_json(self.order_from_row(row))
            except (ValueError, TypeError, sqlite3.Error, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        path = unquote(urlparse(self.path).path)
        if not path.startswith("/api/products/"):
            self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)
            return
        if not self.require_admin():
            return
        try:
            product_id = int(path.rsplit("/", 1)[-1])
            with connect_db() as connection:
                cursor = connection.execute("DELETE FROM products WHERE id = ?", (product_id,))
            if cursor.rowcount == 0:
                self.send_json({"error": "Produto não encontrado."}, HTTPStatus.NOT_FOUND)
                return
            self.send_json({"ok": True})
        except (ValueError, sqlite3.Error) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
if __name__ == "__main__":
    is_render = bool(os.environ.get("RENDER") or os.environ.get("RENDER_EXTERNAL_HOSTNAME"))
    if is_render and (PASSWORD == "flpneus123" or len(PASSWORD) < 16):
        raise RuntimeError("Configure FL_ADMIN_PASSWORD com uma senha de pelo menos 16 caracteres no Render.")
    initialize_database()
    UPLOADS.mkdir(exist_ok=True)
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), StoreHandler) if is_render else DualStackHTTPServer(("::", port), StoreHandler)
    print(f"FL Pneus disponível em http://localhost:{port}")
    print(f"Banco de dados: {DATABASE}")
    print(f"Imagens: {UPLOADS}")
    server.serve_forever()
