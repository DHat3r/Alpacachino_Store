"""API routes for authentication and profile."""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.user import (
    PasswordChange,
    ProfileUpdate,
    RefreshRequest,
    TokenPair,
    UserCreate,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    # Check if email exists
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "El correo ya está registrado")

    # Check if username exists
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "El nombre de usuario ya está en uso")

    user = User(
        email=payload.email.lower(),
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=UserRole.CUSTOMER,
        terms_accepted_at=datetime.now(timezone.utc),
        terms_version=settings.TERMS_VERSION,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "La cuenta está desactivada. Contacta al administrador.",
        )

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh(
    body: RefreshRequest | None = Body(None),
    token: str | None = Query(None, description="Compatibilidad: token por query"),
    db: Session = Depends(get_db),
):
    """Renueva el par de tokens. Preferir ``{"refresh_token": "..."}`` en el body."""
    raw = (body.refresh_token if body else None) or token
    if not raw:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Falta el refresh token")

    try:
        payload = decode_token(raw)
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = int(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token de refresco inválido")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cambia el nombre de usuario (2.7)."""
    if (
        db.query(User)
        .filter(User.username == payload.username, User.id != user.id)
        .first()
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "El nombre de usuario ya está en uso")

    user.username = payload.username
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=204)
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cambia la contraseña pidiendo la actual (2.7)."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no coincide")
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "La nueva contraseña debe ser distinta"
        )

    user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.delete("/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Anonimiza la cuenta conservando los pedidos (Ley 21.719).

    No se borra la fila: los pedidos tienen FK RESTRICT y deben conservarse
    por obligación tributaria. Se eliminan los datos personales y se
    desactiva el acceso; el contenido del foro queda como «usuario eliminado».
    """
    user.email = f"eliminado+{user.id}@invalid.local"
    user.username = f"usuario_eliminado_{user.id}"
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    user.is_active = False
    user.is_verified = False
    db.commit()
