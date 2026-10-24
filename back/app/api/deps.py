"""FastAPI dependencies: database session, current user, role checks."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Extract and validate the current user from the JWT token."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token tipo inválido")
        user_id = int(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    """Alias for clarity."""
    return user


def require_roles(*roles: UserRole):
    """Dependency factory to require specific roles."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permiso denegado",
            )
        return user

    return checker


require_admin = require_roles(UserRole.ADMIN)
require_moderator = require_roles(UserRole.ADMIN, UserRole.MODERATOR)
require_staff = require_roles(UserRole.ADMIN, UserRole.MODERATOR)