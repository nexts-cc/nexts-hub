#!/usr/bin/env python3
"""Small stdio MCP server for generic IMAP/SMTP email accounts."""

from __future__ import annotations

import base64
import email
import imaplib
import json
import mimetypes
import os
import smtplib
import ssl
import sys
import traceback
from dataclasses import dataclass
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from typing import Any


SERVER_NAME = "universal-email"
SERVER_VERSION = "0.1.0"


PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "custom": {},
    "gmail": {
        "imap_host": "imap.gmail.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_ssl": False,
        "smtp_starttls": True,
    },
    "google": {
        "alias": "gmail",
    },
    "google-workspace": {
        "alias": "gmail",
    },
    "outlook": {
        "imap_host": "imap-mail.outlook.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp-mail.outlook.com",
        "smtp_port": 587,
        "smtp_ssl": False,
        "smtp_starttls": True,
    },
    "hotmail": {
        "alias": "outlook",
    },
    "live": {
        "alias": "outlook",
    },
    "office365": {
        "imap_host": "outlook.office365.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.office365.com",
        "smtp_port": 587,
        "smtp_ssl": False,
        "smtp_starttls": True,
    },
    "microsoft365": {
        "alias": "office365",
    },
    "yahoo": {
        "imap_host": "imap.mail.yahoo.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.mail.yahoo.com",
        "smtp_port": 465,
        "smtp_ssl": True,
        "smtp_starttls": False,
    },
    "icloud": {
        "imap_host": "imap.mail.me.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.mail.me.com",
        "smtp_port": 587,
        "smtp_ssl": False,
        "smtp_starttls": True,
    },
    "qq": {
        "imap_host": "imap.qq.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.qq.com",
        "smtp_port": 465,
        "smtp_ssl": True,
        "smtp_starttls": False,
    },
    "163": {
        "imap_host": "imap.163.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.163.com",
        "smtp_port": 465,
        "smtp_ssl": True,
        "smtp_starttls": False,
    },
    "126": {
        "imap_host": "imap.126.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.126.com",
        "smtp_port": 465,
        "smtp_ssl": True,
        "smtp_starttls": False,
    },
    "yeah": {
        "imap_host": "imap.yeah.net",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.yeah.net",
        "smtp_port": 465,
        "smtp_ssl": True,
        "smtp_starttls": False,
    },
    "fastmail": {
        "imap_host": "imap.fastmail.com",
        "imap_port": 993,
        "imap_ssl": True,
        "smtp_host": "smtp.fastmail.com",
        "smtp_port": 465,
        "smtp_ssl": True,
        "smtp_starttls": False,
    },
}


def provider_preset(provider: str) -> dict[str, Any]:
    normalized = provider.strip().lower()
    preset = PROVIDER_PRESETS.get(normalized)
    if preset is None:
        raise ValueError(
            f"Unknown email provider '{provider}'. Use one of {', '.join(sorted(PROVIDER_PRESETS))} "
            "or set provider to 'custom' and provide imap_host and smtp_host."
        )
    alias = preset.get("alias")
    if alias:
        return provider_preset(str(alias))
    return dict(preset)


def coerce_bool(value: Any, default: bool) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def coerce_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def env_bool(name: str, default: bool) -> bool:
    return coerce_bool(os.environ.get(name), default)


def env_int(name: str, default: int) -> int:
    return coerce_int(os.environ.get(name), default)


@dataclass(frozen=True)
class MailConfig:
    account: str
    provider: str
    imap_host: str
    imap_port: int
    imap_ssl: bool
    imap_username: str
    imap_password: str
    smtp_host: str
    smtp_port: int
    smtp_ssl: bool
    smtp_starttls: bool
    smtp_username: str
    smtp_password: str
    from_addr: str


def load_accounts_file() -> dict[str, Any] | None:
    raw_path = os.environ.get("EMAIL_ACCOUNTS_FILE", "")
    if not raw_path:
        return None
    path = Path(raw_path).expanduser()
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("accounts"), dict):
        raise ValueError("EMAIL_ACCOUNTS_FILE must contain an object with an 'accounts' object.")
    return data


def secret_value(account_data: dict[str, Any], field: str, fallback: str = "") -> str:
    env_name = account_data.get(f"{field}_env")
    if env_name:
        value = os.environ.get(str(env_name), "")
        if not value:
            raise ValueError(f"Environment variable {env_name} is required for {field}.")
        return value
    return str(account_data.get(field, fallback) or "")


def first_value(data: dict[str, Any], keys: list[str], fallback: Any = "") -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None and value != "":
            return value
    return fallback


def load_config(account: str | None = None) -> MailConfig:
    accounts_data = load_accounts_file()
    if accounts_data is not None:
        accounts = accounts_data["accounts"]
        account_name = account or accounts_data.get("default")
        if not account_name:
            if len(accounts) == 1:
                account_name = next(iter(accounts))
            else:
                raise ValueError("Multiple email accounts are configured. Set a default account or pass account.")
        if account_name not in accounts:
            raise ValueError(f"Email account '{account_name}' was not found.")
        account_data = accounts[account_name]
        if not isinstance(account_data, dict):
            raise ValueError(f"Email account '{account_name}' must be an object.")

        provider = str(account_data.get("provider", "custom")).strip().lower()
        merged = provider_preset(provider)
        merged.update(account_data)
        email_addr = str(first_value(merged, ["email", "username"], ""))
        password = secret_value(merged, "password")
        imap_username = str(first_value(merged, ["imap_username", "username", "email"], email_addr))
        smtp_username = str(first_value(merged, ["smtp_username", "username", "email"], email_addr))
        imap_password = secret_value(merged, "imap_password", password)
        smtp_password = secret_value(merged, "smtp_password", password)
        from_addr = str(first_value(merged, ["from_addr", "from", "email"], email_addr))
        return MailConfig(
            account=str(account_name),
            provider=provider,
            imap_host=str(merged.get("imap_host", "")),
            imap_port=coerce_int(merged.get("imap_port"), 993),
            imap_ssl=coerce_bool(merged.get("imap_ssl"), True),
            imap_username=imap_username,
            imap_password=imap_password,
            smtp_host=str(merged.get("smtp_host", "")),
            smtp_port=coerce_int(merged.get("smtp_port"), 587),
            smtp_ssl=coerce_bool(merged.get("smtp_ssl"), False),
            smtp_starttls=coerce_bool(merged.get("smtp_starttls"), True),
            smtp_username=smtp_username,
            smtp_password=smtp_password,
            from_addr=from_addr,
        )

    username = os.environ.get("EMAIL_USERNAME", "")
    password = os.environ.get("EMAIL_PASSWORD", "")
    imap_username = os.environ.get("EMAIL_IMAP_USERNAME", username)
    imap_password = os.environ.get("EMAIL_IMAP_PASSWORD", password)
    smtp_username = os.environ.get("EMAIL_SMTP_USERNAME", username)
    smtp_password = os.environ.get("EMAIL_SMTP_PASSWORD", password)
    return MailConfig(
        account="default",
        provider="custom",
        imap_host=os.environ.get("EMAIL_IMAP_HOST", ""),
        imap_port=env_int("EMAIL_IMAP_PORT", 993),
        imap_ssl=env_bool("EMAIL_IMAP_SSL", True),
        imap_username=imap_username,
        imap_password=imap_password,
        smtp_host=os.environ.get("EMAIL_SMTP_HOST", ""),
        smtp_port=env_int("EMAIL_SMTP_PORT", 587),
        smtp_ssl=env_bool("EMAIL_SMTP_SSL", False),
        smtp_starttls=env_bool("EMAIL_SMTP_STARTTLS", True),
        smtp_username=smtp_username,
        smtp_password=smtp_password,
        from_addr=os.environ.get("EMAIL_FROM", smtp_username),
    )


def require_fields(config: MailConfig, fields: list[str]) -> None:
    missing = [field for field in fields if not getattr(config, field)]
    if missing:
        names = ", ".join(missing)
        raise ValueError(f"Missing required email configuration: {names}")


def decode_mime(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def normalize_addresses(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        return [values]
    return [str(value) for value in values]


def connect_imap(account: str | None = None) -> imaplib.IMAP4:
    config = load_config(account)
    require_fields(config, ["imap_host", "imap_username", "imap_password"])
    if config.imap_ssl:
        client: imaplib.IMAP4 = imaplib.IMAP4_SSL(config.imap_host, config.imap_port)
    else:
        client = imaplib.IMAP4(config.imap_host, config.imap_port)
    client.login(config.imap_username, config.imap_password)
    return client


def connect_smtp(account: str | None = None) -> smtplib.SMTP:
    config = load_config(account)
    require_fields(config, ["smtp_host", "smtp_username", "smtp_password", "from_addr"])
    context = ssl.create_default_context()
    if config.smtp_ssl:
        client: smtplib.SMTP = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, context=context)
    else:
        client = smtplib.SMTP(config.smtp_host, config.smtp_port)
        if config.smtp_starttls:
            client.starttls(context=context)
    client.login(config.smtp_username, config.smtp_password)
    return client


def ok(data: Any = None) -> dict[str, Any]:
    return {"ok": True, "data": data}


def message_text(message: email.message.EmailMessage, prefer_html: bool = False) -> dict[str, str]:
    text = ""
    html = ""
    if message.is_multipart():
        for part in message.walk():
            content_disposition = part.get_content_disposition()
            if content_disposition == "attachment":
                continue
            content_type = part.get_content_type()
            if content_type == "text/plain" and not text:
                text = part.get_content()
            elif content_type == "text/html" and not html:
                html = part.get_content()
    else:
        content_type = message.get_content_type()
        if content_type == "text/html":
            html = message.get_content()
        else:
            text = message.get_content()
    body = html if prefer_html and html else text or html
    return {"body": body, "text": text, "html": html}


def message_summary(uid: bytes, raw_message: bytes) -> dict[str, Any]:
    parsed = BytesParser(policy=default).parsebytes(raw_message)
    return {
        "uid": uid.decode("ascii", errors="replace"),
        "subject": decode_mime(parsed.get("Subject")),
        "from": decode_mime(parsed.get("From")),
        "to": decode_mime(parsed.get("To")),
        "date": parsed.get("Date", ""),
        "message_id": parsed.get("Message-ID", ""),
    }


def select_folder(client: imaplib.IMAP4, folder: str, readonly: bool = True) -> None:
    status, data = client.select(f'"{folder}"', readonly=readonly)
    if status != "OK":
        detail = data[0].decode(errors="replace") if data else "unknown error"
        raise RuntimeError(f"Could not select folder {folder}: {detail}")


def account_arg(args: dict[str, Any]) -> str | None:
    value = args.get("account")
    if value is None or value == "":
        return None
    return str(value)


def configured_accounts() -> dict[str, Any]:
    accounts_data = load_accounts_file()
    if accounts_data is None:
        return {
            "default": "default",
            "accounts": {
                "default": {
                    "provider": "custom",
                    "email": os.environ.get("EMAIL_USERNAME", ""),
                }
            },
        }
    return accounts_data


def tool_list_accounts(_: dict[str, Any]) -> dict[str, Any]:
    accounts_data = configured_accounts()
    accounts = accounts_data["accounts"]
    summaries = []
    for name in sorted(accounts):
        account_data = accounts[name]
        if not isinstance(account_data, dict):
            continue
        summaries.append(
            {
                "name": name,
                "provider": account_data.get("provider", "custom"),
                "email": first_value(account_data, ["email", "username"], ""),
                "from_addr": first_value(account_data, ["from_addr", "from", "email"], ""),
                "has_password": bool(account_data.get("password") or account_data.get("password_env")),
            }
        )
    return ok({"default": accounts_data.get("default", "default"), "accounts": summaries})


def check_connection(account: str | None) -> dict[str, Any]:
    results: dict[str, Any] = {"imap": False, "smtp": False}
    config = load_config(account)
    results["account"] = config.account
    results["provider"] = config.provider
    imap_client = connect_imap(config.account)
    try:
        status, _ = imap_client.noop()
        results["imap"] = status == "OK"
    finally:
        imap_client.logout()
    smtp_client = connect_smtp(config.account)
    try:
        code, _ = smtp_client.noop()
        results["smtp"] = 200 <= code < 400
    finally:
        smtp_client.quit()
    return results


def tool_check_connection(args: dict[str, Any]) -> dict[str, Any]:
    if bool(args.get("all", False)):
        accounts_data = configured_accounts()
        results = {}
        for account in sorted(accounts_data["accounts"]):
            try:
                results[account] = check_connection(account)
            except Exception as exc:
                results[account] = {"ok": False, "error": str(exc)}
        return ok(results)
    results = check_connection(account_arg(args))
    return ok(results)


def tool_list_folders(args: dict[str, Any]) -> dict[str, Any]:
    account = account_arg(args)
    config = load_config(account)
    client = connect_imap(config.account)
    try:
        status, folders = client.list()
        if status != "OK":
            raise RuntimeError("Could not list folders")
        names = []
        for folder in folders or []:
            line = folder.decode(errors="replace")
            names.append(line.split(' "/" ')[-1].strip('"'))
        return ok({"account": config.account, "folders": names})
    finally:
        client.logout()


def search_uids(client: imaplib.IMAP4, criteria: str) -> list[bytes]:
    status, data = client.uid("SEARCH", None, criteria)
    if status != "OK":
        raise RuntimeError(f"IMAP search failed for criteria: {criteria}")
    if not data or not data[0]:
        return []
    return data[0].split()


def fetch_summary(client: imaplib.IMAP4, uid: bytes) -> dict[str, Any]:
    status, data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER])")
    if status != "OK" or not data or not isinstance(data[0], tuple):
        raise RuntimeError(f"Could not fetch message header for UID {uid.decode()}")
    return message_summary(uid, data[0][1])


def tool_search_messages(args: dict[str, Any]) -> dict[str, Any]:
    account = account_arg(args)
    folder = str(args.get("folder", "INBOX"))
    criteria = str(args.get("criteria", "ALL"))
    limit = int(args.get("limit", 10))
    config = load_config(account)
    client = connect_imap(config.account)
    try:
        select_folder(client, folder)
        uids = search_uids(client, criteria)
        selected = list(reversed(uids))[: max(0, limit)]
        messages = [fetch_summary(client, uid) for uid in selected]
        return ok({"account": config.account, "folder": folder, "criteria": criteria, "messages": messages})
    finally:
        client.logout()


def tool_list_messages(args: dict[str, Any]) -> dict[str, Any]:
    account = account_arg(args)
    folder = str(args.get("folder", "INBOX"))
    limit = int(args.get("limit", 10))
    unread_only = bool(args.get("unread_only", False))
    criteria = "UNSEEN" if unread_only else "ALL"
    return tool_search_messages({"account": account, "folder": folder, "criteria": criteria, "limit": limit})


def tool_read_message(args: dict[str, Any]) -> dict[str, Any]:
    account = account_arg(args)
    folder = str(args.get("folder", "INBOX"))
    uid = str(args["uid"])
    mark_seen = bool(args.get("mark_seen", False))
    prefer_html = bool(args.get("prefer_html", False))
    fetch_item = "RFC822" if mark_seen else "BODY.PEEK[]"
    config = load_config(account)
    client = connect_imap(config.account)
    try:
        select_folder(client, folder, readonly=not mark_seen)
        status, data = client.uid("FETCH", uid, f"({fetch_item})")
        if status != "OK" or not data or not isinstance(data[0], tuple):
            raise RuntimeError(f"Could not fetch message UID {uid}")
        parsed = BytesParser(policy=default).parsebytes(data[0][1])
        body = message_text(parsed, prefer_html=prefer_html)
        attachments = []
        for part in parsed.walk():
            if part.get_content_disposition() == "attachment":
                attachments.append(
                    {
                        "filename": decode_mime(part.get_filename()),
                        "content_type": part.get_content_type(),
                        "size": len(part.get_payload(decode=True) or b""),
                    }
                )
        return ok(
            {
                "uid": uid,
                "account": config.account,
                "subject": decode_mime(parsed.get("Subject")),
                "from": decode_mime(parsed.get("From")),
                "to": decode_mime(parsed.get("To")),
                "cc": decode_mime(parsed.get("Cc")),
                "date": parsed.get("Date", ""),
                "message_id": parsed.get("Message-ID", ""),
                "body": body["body"],
                "text": body["text"],
                "html": body["html"],
                "attachments": attachments,
            }
        )
    finally:
        client.logout()


def add_attachments(message: EmailMessage, paths: list[str]) -> None:
    for raw_path in paths:
        path = Path(raw_path).expanduser()
        data = path.read_bytes()
        content_type, _ = mimetypes.guess_type(path.name)
        maintype, subtype = (content_type or "application/octet-stream").split("/", 1)
        message.add_attachment(data, maintype=maintype, subtype=subtype, filename=path.name)


def tool_send_message(args: dict[str, Any]) -> dict[str, Any]:
    account = account_arg(args)
    config = load_config(account)
    require_fields(config, ["from_addr"])
    to = normalize_addresses(args.get("to"))
    if not to:
        raise ValueError("At least one recipient is required in 'to'")
    cc = normalize_addresses(args.get("cc"))
    bcc = normalize_addresses(args.get("bcc"))
    subject = str(args.get("subject", ""))
    text = str(args.get("body_text", ""))
    html = args.get("body_html")
    attachments = normalize_addresses(args.get("attachments"))

    message = EmailMessage()
    message["From"] = str(args.get("from_addr") or config.from_addr)
    message["To"] = ", ".join(to)
    if cc:
        message["Cc"] = ", ".join(cc)
    message["Subject"] = subject
    if html:
        message.set_content(text or "This email contains an HTML body.")
        message.add_alternative(str(html), subtype="html")
    else:
        message.set_content(text)
    add_attachments(message, attachments)

    recipients = to + cc + bcc
    client = connect_smtp(config.account)
    try:
        refused = client.send_message(message, to_addrs=recipients)
        return ok({"sent": True, "account": config.account, "recipients": recipients, "refused": refused})
    finally:
        client.quit()


TOOLS: dict[str, dict[str, Any]] = {
    "email_list_accounts": {
        "description": "List configured email accounts without exposing passwords.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": tool_list_accounts,
    },
    "email_check_connection": {
        "description": "Verify IMAP and SMTP connectivity for one configured account, or all accounts.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Configured account name. Uses the default account when omitted."},
                "all": {"type": "boolean", "default": False},
            },
            "additionalProperties": False,
        },
        "handler": tool_check_connection,
    },
    "email_list_folders": {
        "description": "List folders/mailboxes available through IMAP.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Configured account name. Uses the default account when omitted."}
            },
            "additionalProperties": False,
        },
        "handler": tool_list_folders,
    },
    "email_search_messages": {
        "description": "Search a folder with an IMAP SEARCH criteria string such as ALL, UNSEEN, FROM \"alice@example.com\", or SUBJECT \"invoice\".",
        "inputSchema": {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Configured account name. Uses the default account when omitted."},
                "folder": {"type": "string", "default": "INBOX"},
                "criteria": {"type": "string", "default": "ALL"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 10},
            },
            "additionalProperties": False,
        },
        "handler": tool_search_messages,
    },
    "email_list_messages": {
        "description": "List recent messages in a folder, optionally unread only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Configured account name. Uses the default account when omitted."},
                "folder": {"type": "string", "default": "INBOX"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 10},
                "unread_only": {"type": "boolean", "default": False},
            },
            "additionalProperties": False,
        },
        "handler": tool_list_messages,
    },
    "email_read_message": {
        "description": "Read one IMAP message by UID.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Configured account name. Uses the default account when omitted."},
                "folder": {"type": "string", "default": "INBOX"},
                "uid": {"type": "string"},
                "mark_seen": {"type": "boolean", "default": False},
                "prefer_html": {"type": "boolean", "default": False},
            },
            "required": ["uid"],
            "additionalProperties": False,
        },
        "handler": tool_read_message,
    },
    "email_send_message": {
        "description": "Send an email through SMTP with optional CC, BCC, HTML, and file attachments.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Configured account name. Uses the default account when omitted."},
                "to": {"oneOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]},
                "cc": {"oneOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]},
                "bcc": {"oneOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]},
                "from_addr": {"type": "string"},
                "subject": {"type": "string"},
                "body_text": {"type": "string"},
                "body_html": {"type": "string"},
                "attachments": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["to", "subject"],
            "additionalProperties": False,
        },
        "handler": tool_send_message,
    },
}


def tool_result(payload: Any) -> dict[str, Any]:
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    return {"content": [{"type": "text", "text": text}]}


def handle_request(request: dict[str, Any]) -> dict[str, Any] | None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    try:
        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                },
            }
        if method == "notifications/initialized":
            return None
        if method == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "tools": [
                        {
                            "name": name,
                            "description": spec["description"],
                            "inputSchema": spec["inputSchema"],
                        }
                        for name, spec in TOOLS.items()
                    ]
                },
            }
        if method == "tools/call":
            name = params.get("name")
            if name not in TOOLS:
                raise ValueError(f"Unknown tool: {name}")
            arguments = params.get("arguments") or {}
            payload = TOOLS[name]["handler"](arguments)
            return {"jsonrpc": "2.0", "id": request_id, "result": tool_result(payload)}
        if method == "resources/list":
            return {"jsonrpc": "2.0", "id": request_id, "result": {"resources": []}}
        if method == "prompts/list":
            return {"jsonrpc": "2.0", "id": request_id, "result": {"prompts": []}}
        raise ValueError(f"Unsupported method: {method}")
    except Exception as exc:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32000,
                "message": str(exc),
                "data": base64.b64encode(traceback.format_exc().encode()).decode(),
            },
        }


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        response = handle_request(json.loads(line))
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
