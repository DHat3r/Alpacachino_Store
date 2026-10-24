"""Forum schemas."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class PostCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=10)
    product_id: Optional[str] = None  # UUID as string
    rating: Optional[int] = Field(default=None, ge=1, le=5)


class PostUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=160)
    body: Optional[str] = Field(default=None, min_length=10)


class PostOut(BaseModel):
    id: int
    author_id: int
    author_username: str
    title: str
    body: str
    product_id: Optional[str]
    rating: Optional[int]
    is_hidden: bool
    is_pinned: bool
    is_locked: bool
    created_at: datetime
    updated_at: datetime
    comments_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)


class CommentOut(BaseModel):
    id: int
    post_id: int
    author_id: int
    author_username: str
    body: str
    is_hidden: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportCreate(BaseModel):
    reason: str = Field(min_length=5, max_length=200)