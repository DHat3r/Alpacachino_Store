"""Forum models: posts, comments, reports."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Text, ForeignKey, DateTime, func, CheckConstraint, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:  # pragma: no cover
    from app.models.user import User


class ForumPost(Base):
    __tablename__ = "forum_posts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rating: Mapped[int | None] = mapped_column(nullable=True)  # 1..5 si es reseña
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    comments: Mapped[list["ForumComment"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", passive_deletes=True
    )
    author: Mapped["User"] = relationship(foreign_keys=[author_id], lazy="joined")

    __table_args__ = (
        CheckConstraint("rating IS NULL OR (rating BETWEEN 1 AND 5)", name="ck_forum_post_rating"),
        Index("ix_forum_posts_author_created", "author_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ForumPost {self.id} - {self.title[:30]}>"


class ForumComment(Base):
    __tablename__ = "forum_comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("forum_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    post: Mapped[ForumPost] = relationship(back_populates="comments")
    author: Mapped["User"] = relationship(foreign_keys=[author_id], lazy="joined")

    def __repr__(self) -> str:
        return f"<ForumComment {self.id} on post {self.post_id}>"


class ForumReport(Base):
    __tablename__ = "forum_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int | None] = mapped_column(
        ForeignKey("forum_posts.id", ondelete="CASCADE"), nullable=True
    )
    comment_id: Mapped[int | None] = mapped_column(
        ForeignKey("forum_comments.id", ondelete="CASCADE"), nullable=True
    )
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        target = f"post:{self.post_id}" if self.post_id else f"comment:{self.comment_id}"
        return f"<ForumReport {self.id} - {target}>"