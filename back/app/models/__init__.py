# -*- coding: utf-8 -*-
"""Models package - imports all models for Alembic autogenerate."""

from app.models.user import User, UserRole
from app.models.product import Product, Category, Inventory
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentEvent
from app.models.forum import ForumPost, ForumComment, ForumReport
from app.models.bot import BotConversation, BotMessage
from app.models.inventory_movement import InventoryMovement, MovementReason

__all__ = [
    "User",
    "UserRole",
    "Product",
    "Category",
    "Inventory",
    "Order",
    "OrderItem",
    "OrderStatus",
    "Payment",
    "PaymentEvent",
    "ForumPost",
    "ForumComment",
    "ForumReport",
    "BotConversation",
    "BotMessage",
    "InventoryMovement",
    "MovementReason",
]