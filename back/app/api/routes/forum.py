"""Forum routes: posts, comments, moderation."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, desc
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_moderator
from app.db.session import get_db
from app.models.user import User
from app.models.forum import ForumPost, ForumComment, ForumReport
from app.schemas.forum import PostCreate, PostUpdate, PostOut, CommentCreate, CommentOut, ReportCreate

router = APIRouter(prefix="/forum", tags=["forum"])


@router.get("/posts", response_model=list[PostOut])
def list_posts(
    product_id: str | None = None,
    author_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    stmt = (
        db.query(ForumPost)
        .options(joinedload(ForumPost.comments))
        .filter(ForumPost.is_hidden == False)
    )
    if product_id:
        stmt = stmt.filter(ForumPost.product_id == product_id)
    if author_id:
        stmt = stmt.filter(ForumPost.author_id == author_id)

    posts = stmt.order_by(desc(ForumPost.is_pinned), desc(ForumPost.created_at)).offset((page - 1) * size).limit(size).all()

    return [
        PostOut(
            id=p.id,
            author_id=p.author_id,
            author_username=p.author.username if p.author else "deleted",
            title=p.title,
            body=p.body,
            product_id=str(p.product_id) if p.product_id else None,
            rating=p.rating,
            is_hidden=p.is_hidden,
            is_pinned=p.is_pinned,
            is_locked=p.is_locked,
            created_at=p.created_at,
            updated_at=p.updated_at,
            comments_count=len([c for c in p.comments if not c.is_hidden]),
        )
        for p in posts
    ]


@router.post("/posts", response_model=PostOut, status_code=201)
def create_post(
    payload: PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.order import Order, OrderStatus, OrderItem
    import uuid

    # If rating provided, verify purchase
    if payload.rating and payload.product_id:
        purchased = db.query(OrderItem).join(Order).filter(
            Order.user_id == user.id,
            Order.status == OrderStatus.PAID,
            OrderItem.product_id == uuid.UUID(payload.product_id),
        ).first()
        if not purchased:
            raise HTTPException(403, "Solo puedes reseñar productos que hayas comprado")

    post = ForumPost(
        author_id=user.id,
        title=payload.title,
        body=payload.body,
        product_id=uuid.UUID(payload.product_id) if payload.product_id else None,
        rating=payload.rating,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_username=user.username,
        title=post.title,
        body=post.body,
        product_id=str(post.product_id) if post.product_id else None,
        rating=post.rating,
        is_hidden=post.is_hidden,
        is_pinned=post.is_pinned,
        is_locked=post.is_locked,
        created_at=post.created_at,
        updated_at=post.updated_at,
        comments_count=0,
    )


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(ForumPost).options(joinedload(ForumPost.comments)).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Publicación no encontrada")

    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_username=post.author.username if post.author else "deleted",
        title=post.title,
        body=post.body,
        product_id=str(post.product_id) if post.product_id else None,
        rating=post.rating,
        is_hidden=post.is_hidden,
        is_pinned=post.is_pinned,
        is_locked=post.is_locked,
        created_at=post.created_at,
        updated_at=post.updated_at,
        comments_count=len([c for c in post.comments if not c.is_hidden]),
    )


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(
    post_id: int,
    payload: PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
    if post.author_id != user.id and user.role not in ("admin", "moderator"):
        raise HTTPException(403, "No puedes editar esta publicación")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(post, key, value)
    db.commit()
    db.refresh(post)

    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_username=post.author.username if post.author else "deleted",
        title=post.title,
        body=post.body,
        product_id=str(post.product_id) if post.product_id else None,
        rating=post.rating,
        is_hidden=post.is_hidden,
        is_pinned=post.is_pinned,
        is_locked=post.is_locked,
        created_at=post.created_at,
        updated_at=post.updated_at,
        comments_count=0,
    )


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
    if post.author_id != user.id and user.role not in ("admin", "moderator"):
        raise HTTPException(403, "No puedes borrar esta publicación")

    post.is_hidden = True  # Soft delete
    db.commit()


@router.get("/posts/{post_id}/comments", response_model=list[CommentOut])
def list_comments(
    post_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Comentarios visibles de una publicación, del más antiguo al más nuevo."""
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")

    comments = (
        db.query(ForumComment)
        .options(joinedload(ForumComment.author))
        .filter(ForumComment.post_id == post_id, ForumComment.is_hidden.is_(False))
        .order_by(ForumComment.created_at.asc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    return [
        CommentOut(
            id=c.id,
            post_id=c.post_id,
            author_id=c.author_id,
            author_username=c.author.username if c.author else "deleted",
            body=c.body,
            is_hidden=c.is_hidden,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in comments
    ]


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(
    post_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = db.get(ForumPost, post_id)
    if not post:
        raise HTTPException(404, "Publicación no encontrada")
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

    return CommentOut(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author_username=user.username,
        body=comment.body,
        is_hidden=comment.is_hidden,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


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

    # Prevent duplicate reports
    existing = db.query(ForumReport).filter(
        ForumReport.post_id == post_id,
        ForumReport.reporter_id == user.id,
    ).first()
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


# ─── Moderation routes ───

@router.get("/admin/reports")
def list_reports(
    resolved: bool | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_moderator),
):
    stmt = db.query(ForumReport).order_by(ForumReport.created_at.desc())
    if resolved is not None:
        stmt = stmt.filter(ForumReport.resolved == resolved)
    total = stmt.count()
    reports = stmt.offset((page - 1) * size).limit(size).all()

    return {
        "items": [
            {
                "id": r.id,
                "post_id": r.post_id,
                "comment_id": r.comment_id,
                "reporter_id": r.reporter_id,
                "reason": r.reason,
                "resolved": r.resolved,
                "resolved_by": r.resolved_by,
                "resolved_at": r.resolved_at,
                "created_at": r.created_at,
            }
            for r in reports
        ],
        "total": total,
        "page": page,
        "size": size,
    }


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