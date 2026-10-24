"""Envío de correo por SMTP (Mailhog en local, proveedor real en producción)."""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Envía un correo de texto. Devuelve False si el SMTP no está disponible."""
    if not to:
        return False

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)
        return True
    except Exception as exc:  # pragma: no cover - depende del servidor SMTP
        logger.warning("No se pudo enviar el correo a %s: %s", to, exc)
        return False
