# CogniTara Brevo MCP Server

Model Context Protocol (MCP) server for **Brevo v3** transactional email, 6-digit OTP verification, sender verification, delivery event tracking, templates, and contacts.

## 1. Get Your Brevo API Key

1. Open your Brevo API Keys dashboard:
   **https://app.brevo.com/settings/keys/api**
2. Click **Generate a new API key**, name it `CogniTara Cloud`, and copy the key (starts with `xkeysib-...`).
3. Confirm or add your verified sender address at:
   **https://app.brevo.com/senders/list**

## 2. Build

```bash
cd mcp/brevo
npm install
npm run build
```

## 3. MCP Client Configuration

Add this to your MCP config (`mcp_config.json` / Claude Desktop / Cursor / Windsurf):

```json
{
  "mcpServers": {
    "brevo": {
      "command": "node",
      "args": ["/absolute/path/to/cognitarapp/mcp/brevo/dist/index.js"],
      "env": {
        "BREVO_API_KEY": "xkeysib-YOUR_BREVO_API_KEY",
        "BREVO_SENDER_EMAIL": "your-verified-sender@yourdomain.com",
        "BREVO_SENDER_NAME": "CogniTara Cloud"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|---|---|
| `brevo_get_account` | Check Brevo account plan & remaining transactional email credits |
| `brevo_list_senders` | List verified sender emails and authenticated domains |
| `brevo_send_email` | Send any HTML/text transactional email via `/v3/smtp/email` |
| `brevo_send_otp` | Generate & send a branded CogniTara 6-digit OTP verification email |
| `brevo_get_email_events` | Inspect delivery, bounce, open, and block logs |
| `brevo_list_templates` | List Brevo transactional email templates |
| `brevo_list_contacts` | List CRM contacts |
| `brevo_upsert_contact` | Create or update a school contact in Brevo |
