---
name: universal-email
description: Read, search, and send email through one or more generic IMAP and SMTP mailboxes configured with provider presets.
---

# Universal Email

Use this plugin when the user wants to read or send email from one or more mailboxes that support standard IMAP and SMTP.

## Configuration

Preferred setup is an account file pointed to by `EMAIL_ACCOUNTS_FILE`. The default is `./email-accounts.json` in the plugin root.

Each account usually only needs:

- `provider`: one of the built-in provider presets.
- `email`: the mailbox address or login name.
- `password`: the mailbox password, app password, or authorization code.

Example:

```json
{
  "default": "work",
  "accounts": {
    "work": {
      "provider": "gmail",
      "email": "me@company.com",
      "password": "app-password"
    },
    "personal": {
      "provider": "qq",
      "email": "123456@qq.com",
      "password": "authorization-code"
    }
  }
}
```

For better local secret hygiene, use `password_env` instead of `password`:

```json
{
  "provider": "163",
  "email": "me@163.com",
  "password_env": "EMAIL_163_PASSWORD"
}
```

Supported provider presets:

- `gmail`, `google`, `google-workspace`
- `outlook`, `hotmail`, `live`
- `office365`, `microsoft365`
- `yahoo`
- `icloud`
- `qq`
- `163`, `126`, `yeah`
- `fastmail`
- `custom`

Use `custom` when the provider is not listed or when a corporate mailbox has custom servers. Custom accounts must include `imap_host` and `smtp_host`; they can also override `imap_port`, `imap_ssl`, `smtp_port`, `smtp_ssl`, and `smtp_starttls`.

The older single-account environment variables still work as a fallback when `EMAIL_ACCOUNTS_FILE` is not set or the file does not exist:

- `EMAIL_IMAP_HOST`: IMAP host, for example `imap.example.com`.
- `EMAIL_IMAP_PORT`: IMAP port, usually `993` for SSL or `143` for STARTTLS/plain.
- `EMAIL_IMAP_SSL`: `true` to connect with IMAP over SSL.
- `EMAIL_SMTP_HOST`: SMTP host, for example `smtp.example.com`.
- `EMAIL_SMTP_PORT`: SMTP port, usually `587` for STARTTLS, `465` for SSL.
- `EMAIL_SMTP_SSL`: `true` for SMTP over SSL.
- `EMAIL_SMTP_STARTTLS`: `true` to upgrade SMTP with STARTTLS.
- `EMAIL_USERNAME`: mailbox username.
- `EMAIL_PASSWORD`: mailbox password or provider app password.
- `EMAIL_FROM`: optional sender address. Defaults to `EMAIL_USERNAME`.

Optional overrides:

- `EMAIL_IMAP_USERNAME` and `EMAIL_IMAP_PASSWORD`
- `EMAIL_SMTP_USERNAME` and `EMAIL_SMTP_PASSWORD`

## Provider Notes

This plugin uses password-style IMAP and SMTP authentication. Many consumer providers require an app password or authorization code, enabled IMAP/SMTP access, or OAuth-specific settings before standard IMAP/SMTP clients can connect.

## Available Tools

- `email_list_accounts`: list configured account names without exposing passwords.
- `email_check_connection`: verify IMAP and SMTP settings for one account or all accounts.
- `email_list_folders`: list IMAP folders for an account.
- `email_search_messages`: search a folder with IMAP criteria.
- `email_list_messages`: list recent messages in a folder.
- `email_read_message`: read a message by IMAP UID.
- `email_send_message`: send an email through SMTP, with optional HTML and file attachments.

All mailbox tools accept an optional `account` parameter. If omitted, the configured default account is used.
