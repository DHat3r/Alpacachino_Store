"""Webhook routes for WhatsApp and Instagram (bots)."""

from fastapi import APIRouter, Request, Query, HTTPException, Response
from app.core.config import settings

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ─── WhatsApp ───

@router.get("/whatsapp")
def verify_whatsapp(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    """Meta webhook verification endpoint."""
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(403, "Verificación fallida")


@router.post("/whatsapp")
async def receive_whatsapp(request: Request):
    """Receive WhatsApp messages - respond 200 fast, process in background."""
    body = await request.json()

    # Enqueue processing (would use Celery task in production)
    # For now, just acknowledge
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                # handle_bot_message.delay(...)  # Celery task
                pass

    return {"status": "received"}


# ─── Instagram ───

@router.get("/instagram")
def verify_instagram(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.INSTAGRAM_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(403, "Verificación fallida")


@router.post("/instagram")
async def receive_instagram(request: Request):
    body = await request.json()
    # Process in background
    return {"status": "received"}