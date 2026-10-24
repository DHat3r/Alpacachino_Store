"""Bot message schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class BotMessageIn(BaseModel):
    channel: str = Field(pattern="^(whatsapp|instagram)$")
    sender: str
    text: str
    message_id: str


class BotMessageOut(BaseModel):
    channel: str
    recipient: str
    text: str