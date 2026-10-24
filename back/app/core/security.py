"""Security utilities: password hashing and JWT tokens."""

from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import bcrypt

from app.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    # bcrypt 5.0.0+ requires bytes and has 72 byte limit
    password_bytes = password.encode('utf-8')[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against its hash."""
    plain_bytes = plain.encode('utf-8')[:72]
    hashed_bytes = hashed.encode('utf-8')
    return bcrypt.checkpw(plain_bytes, hashed_bytes)


def create_token(subject: str, role: str, kind: str = "access") -> str:
    """Create a JWT token (access or refresh)."""
    if kind == "access":
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {
        "sub": subject,
        "role": role,
        "type": kind,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Token inválido o expirado") from exc


def create_access_token(user_id: int, role: str) -> str:
    return create_token(str(user_id), role, "access")


def create_refresh_token(user_id: int, role: str) -> str:
    return create_token(str(user_id), role, "refresh")