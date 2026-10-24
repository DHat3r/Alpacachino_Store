"""Forum routes: posts, comments, moderation."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, desc, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    get_current_user,
    get_current_user_optional,
    is_staff,
    require_moderator,
)
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models.forum import ForumPost, ForumComment, ForumReport
from app.models.product import Product
from app.models.user import User
from app.schemas.forum import (
    CommentCreate,
    CommentOut,
    CommentUpdate,
    PostCreate,
    PostOut,
    PostPage,
    PostUpdate,
    ProductBrief,
    ReportCreate,
)

router = APIRouter(prefix="/forum", tags=["forum"])


def _post_out(post: ForumPost, comments_count: int = 0) -> PostOut:
    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_username=post.author.username if post.author else "deleted",
        title=post.title,
        body=post.body,
        product_id=str(post.product_id) if post.product_id else None,
        product=(
            ProductBrief.model_validate(post.product) if post.product else None
        ),
        rating=post.rating,
        is_hidden=post.is_hidden,
        is_pinned=post.is_pinned,
        is_locked=post.is_locked,
        created_at=post.created_at,
        updated_at=post.updated_at,
        comments_count=comments_count,
    )


def _comment_out(comment: ForumComment) -> CommentOut:
    return CommentOut(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author_username=comment.author.username if comment.author else "deleted",
        body=comment.body,
        is_hidden=comment.is_hidden,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


def _visible_post_or_404(db: Session, post_id: int, user: User | None) -> ForumPost:
    post = db.get(ForumPost, post_id)
    if not post or (post.is_hidden and not is_staff(user)):
        raise HTTPException(404, "Publicación no encontrada")
    return post


@router.get("/posts", response_model=PostPage)
def list_posts(
    product_id: str | None = None,
    author_id: int | None = None,
    kind: Literal["review", "discussion"] | None = Query(
        None, description="review = con rating, discussion = sin rating"
    ),
    q: str | None = Query(None, max_length=80, description="Busca en título y cuerpo"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    comments_count = (
        select(func.count(ForumComment.id))
        .where(
            ForumComment.post_id == ForumPost.id,
            ForumComment.is_hidden.is_(False),
        )
        .correlate(ForumPost)
        .scalar_subquery()
    )

    stmt = (
        db.query(ForumPost, comments_count.label("comments_count"))
        .options(joinedload(ForumPost.product))
        .filter(ForumPost.is_hidden.is_(False))
    )
    if product_id:
        stmt = stmt.filter(ForumPost.product_id == product_id)
    if author_id:
        stmt = stmt.filter(ForumPost.author_id == author_id)
    if kind == "review":
        stmt = stmt.filter(ForumPost.rating.is_not(None))
    elif kind == "discussion":
        stmt = stmt.filter(ForumPost.rating.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.filter(or_(ForumPost.title.ilike(like), ForumPost.body.ilike(like)))

    total = stmt.count()
    rows = (
        stmt.order_by(desc(ForumPost.is_pinned), desc(ForumPost.created_at))
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    return PostPage(
        items=[_post_out(post, count) for post, count in rows],
        total=total,
        page=page,
        size=size,
    )


@router.post("/posts", response_model=PostOut, status_code=201)
@limiter.limit("10/minute")
def create_post(
    request: Request,
    payload: PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.order import Order, OrderStatus, OrderItem

    product: Product | None = None
    if payload.product_id:
        try:
            pid = uuid.UUID(payload.product_id)
        except (ValueError, AttributeError):
            raise HTTPException(400, "Identificador de producto inválido")
        product = db.get(Product, pid)
        if not product:
            raise HTTPException(404, "Producto no encontrado")

    # Una reseña exige producto y compra verificada; una discusión no.
    if payload.rating is not None:
        if product is None:
            raise HTTPException(422, "Una reseña necesita product_id")
        purchased = (
            db.query(OrderItem)
            .join(Order)
            .filter(
                Order.user_id == user.id,
                Order.status == OrderStatus.PAID,
                OrderItem.product_id == product.id,
            )
            .first()
        )
        if not purchased:
            raise HTTPException(403, "Solo puedes reseñar productos que hayas comprado")

        already = (
            db.query(ForumPost)
            .filter(
                ForumPost.author_id == user.id,
                ForumPost.product_id == product.id,
                ForumPost.rating.is_not(None),
            )
            .first()
        )
        if already:
            raise HTTPException(409, "Ya reseñaste este producto")

    post = ForumPost(
        author_id=user.id,
        title=payload.title,
        body=payload.body,
        product_id=product.id if product else None,
        rating=payload.rating,
    )
    db.add(post)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya reseñaste este producto")
    db.refresh(post)

    return _post_out(post, 0)


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    post = _visible_post_or_404(db, post_id, user)
    count = (
        db.query(func.count(ForumComment.id))
        .filter(
            ForumComment.post_id == post.id,
            ForumComment.is_hidden.is_(False),
        )
        .scalar()
    )
    return _post_out(post, count or 0)


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(
    post_id: int,
    payload: PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.get(ForumPost, post_id)
    if not post or (post.is_hidden and not is_staff(user)):
        raise HTTPException(404, "Publicación no encontrada")
    if post.author_id != user.id and not is_staff(user):
        raise HTTPException(403, "No puedes editar esta publicación")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(post, key, value)
    db.commit()
    db.refresh(post)

    return _post_out(post, 0)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
    if post.author_id != user.id and not is_staff(user):
        raise HTTPException(403, "No puedes borrar esta publicación")

    post.is_hidden = True  # Soft delete
    db.commit()


@router.get("/posts/{post_id}/comments", response_model=list[CommentOut])
def list_comments(
    post_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    """Comentarios visibles de una publicación, del más antiguo al más nuevo."""
    post = _visible_post_or_404(db, post_id, user)

    comments = (
        db.query(ForumComment)
        .filter(
            ForumComment.post_id == post.id,
            ForumComment.is_hidden.is_(False),
        )
        .order_by(ForumComment.created_at.asc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    return [_comment_out(c) for c in comments]


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=201)
@limiter.limit("20/minute")
def add_comment(
    request: Request,
    post_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = _visible_post_or_404(db, post_id, user)
    if post.is_locked:
        raise HTTPException(403, "Esta publicación está cerrada a comentarios")

    comment = ForumComment(
        post_id=post_id,
        author_id=user.id,
        body=payload.body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return _comment_out(comment)


@router.patch("/comments/{comment_id}", response_model=CommentOut)
def update_comment(
    comment_id: int,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = db.get(ForumComment, comment_id)
    if not comment or (comment.is_hidden and not is_staff(user)):
        raise HTTPException(404, "Comentario no encontrado")
    if comment.author_id != user.id and not is_staff(user):
        raise HTTPException(403, "No puedes editar este comentario")

    comment.body = payload.body
    db.commit()
    db.refresh(comment)
    return _comment_out(comment)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = db.get(ForumComment, comment_id)
    if not comment:
        raise HTTPException(404, "Comentario no encontrado")
    if comment.author_id != user.id and not is_staff(user):
        raise HTTPException(403, "No puedes borrar este comentario")

    comment.is_hidden = True
    db.commit()


@router.post("/posts/{post_id}/report", status_code=201)
def report_post(
    post_id: int,
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")

    existing = (
        db.query(ForumReport)
        .filter(
            ForumReport.post_id == post_id,
            ForumReport.reporter_id == user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(409, "Ya reportaste esta publicación")

    report = ForumReport(
        post_id=post_id,
        reporter_id=user.id,
        reason=payload.reason,
    )
    db.add(report)
    db.commit()
    return {"status": "reported", "report_id": report.id}


@router.post("/comments/{comment_id}/report", status_code=201)
def report_comment(
    comment_id: int,
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = db.get(ForumComment, comment_id)
    if not comment:
        raise HTTPException(404, "Comentario no encontrado")

    existing = (
        db.query(ForumReport)
        .filter(
            ForumReport.comment_id == comment_id,
            ForumReport.reporter_id == user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(409, "Ya reportaste este comentario")

    report = ForumReport(
        comment_id=comment_id,
        reporter_id=user.id,
        reason=payload.reason,
    )
    db.add(report)
    db.commit()
    return {"status": "reported", "report_id": report.id}


# ─── Moderation routes ───

@router.get("/admin/reports")
def list_reports(
    resolved: bool | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_moderator),
):
    stmt = (
        db.query(ForumReport, ForumPost, ForumComment)
        .outerjoin(ForumPost, ForumReport.post_id == ForumPost.id)
        .outerjoin(ForumComment, ForumReport.comment_id == ForumComment.id)
        .order_by(ForumReport.created_at.desc())
    )
    if resolved is not None:
        stmt = stmt.filter(ForumReport.resolved == resolved)
    total = stmt.count()
    rows = stmt.offset((page - 1) * size).limit(size).all()

    items = []
    for report, post, comment in rows:
        reporter = db.get(User, report.reporter_id)
        # Un reporte de comentario no trae post_id: se deduce del comentario.
        if post is None and comment is not None:
            post = db.get(ForumPost, comment.post_id)
        items.append(
            {
                "id": report.id,
                "post_id": report.post_id,
                "comment_id": report.comment_id,
                "reporter_id": report.reporter_id,
                "reporter_username": reporter.username if reporter else "deleted",
                "reason": report.reason,
                "resolved": report.resolved,
                "resolved_by": report.resolved_by,
                "resolved_at": report.resolved_at,
                "created_at": report.created_at,
                "post_title": post.title if post else None,
                "comment_body": comment.body if comment else None,
            }
        )

    return {"items": items, "total": total, "page": page, "size": size}


@router.patch("/admin/posts/{post_id}/hide")
def hide_post(
    post_id: int,
    hide: bool = True,
    db: Session = Depends(get_db),
    _=Depends(require_moderator),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
    post.is_hidden = hide
    db.commit()
    return {"id": post.id, "is_hidden": post.is_hidden}


@router.patch("/admin/posts/{post_id}/pin")
def pin_post(
    post_id: int,
    pinned: bool = True,
    db: Session = Depends(get_db),
    _=Depends(require_moderator),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
    post.is_pinned = pinned
    db.commit()
    return {"id": post.id, "is_pinned": post.is_pinned}


@router.patch("/admin/posts/{post_id}/lock")
def lock_post(
    post_id: int,
    locked: bool = True,
    db: Session = Depends(get_db),
    _=Depends(require_moderator),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
    post.is_locked = locked
    db.commit()
    return {"id": post.id, "is_locked": post.is_locked}


@router.patch("/admin/comments/{comment_id}/hide")
def hide_comment(
    comment_id: int,
    hide: bool = True,
    db: Session = Depends(get_db),
    _=Depends(require_moderator),
):
    comment = db.get(ForumComment, comment_id)
    if not comment:
        raise HTTPException(404, "Comentario no encontrado")
    comment.is_hidden = hide
    db.commit()
    return {"id": comment.id, "is_hidden": comment.is_hidden}


@router.patch("/admin/reports/{report_id}/resolve")
def resolve_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_moderator),
):
    from datetime import datetime, timezone

    report = db.get(ForumReport, report_id)
    if not report:
        raise HTTPException(404, "Reporte no encontrado")
    report.resolved = True
    report.resolved_by = user.id
    report.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": report.id, "resolved": True}
