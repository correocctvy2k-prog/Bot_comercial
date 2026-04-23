---
name: n8n-expert
description: Expert guidance for building, debugging, and optimizing workflows in n8n (v2.x+). Includes patterns for Webhooks, Meta integration, Code nodes, and MCP.
---

# n8n Expert Skill 🚀

This skill provides expert knowledge for working with **n8n v2.3.3+**. It focuses on modern best practices, abandoning legacy patterns (like "Function" nodes) in favor of the new "Code" node and expression syntax.

## 📚 Official Resources
- **Documentation**: [docs.n8n.io](https://docs.n8n.io/)
- **API Reference**: [docs.n8n.io/api](https://docs.n8n.io/api/)
- **Community Forum**: [community.n8n.io](https://community.n8n.io/)

## 🔑 Core Concepts (v2.x)

### 1. Data Structure 📦
In v2+, data is handled as an array of objects.
- **Accessing Input**: `items[0].json.myField` (Legacy) -> `$input.item.json.myField` (Modern / Expression).
- **Expressions**: Use `{{ $json.myField }}` or `{{ $json['my-field'] }}` in parameters.
- **Query Parameters**: For Webhooks, use `{{ $json.query['paramName'] }}`.

### 2. The "Code" Node 💻
Replaces the old "Function" node.
- **Language**: JavaScript (default) or Python.
- **Mode**: "Run Once for All Items" vs "Run for Each Item".
- **Example (JavaScript - Run for Each Item)**:
  ```javascript
  // Add a new field
  $input.item.json.processedAt = new Date().toISOString();
  return $input.item;
  ```

### 3. Webhooks & Verifications 🔗
Crucial for integrations like Meta (WhatsApp), Stripe, Slack.

#### Meta Handshake Pattern
Meta requires a synchronous `GET` response while messages come as `POST`.
**Pattern**:
1.  **Node**: `Webhook` (Methods: GET & POST, Response Mode: "Last Node").
2.  **Logic**: `Switch` node checking `{{ $json.query['hub.mode'] }} == 'subscribe'`.
3.  **True Branch**: `Respond to Webhook` (Body: `{{ $json.query['hub.challenge'] }}`).
4.  **False Branch**: Process message -> `Respond to Webhook` (Body: "OK").

### 4. Expressions & Variables 💲
- **Previous Node Data**: `{{ $('Node Name').item.json.field }}`
- **Environment Variables**: `{{ $env.MY_VAR }}`
- **Execution ID**: `{{ $execution.id }}`

## 🛠️ Debugging & Troubleshooting

### Common Errors
- **"Workflow not saved"**: If MCP/API says "updatedAt" changed but nodes didn't, the save might have failed silently or be cached. **Action**: Hard browser refresh or deactivate/reactivate.
- **Webhook 404/405**: Check "HTTP Method" settings. Default might be POST only.
- **JSON Object vs String**: When creating JSON manually in `Respond to Webhook`, ensure "Respond With" is set to JSON, or use `JSON.stringify()` in Text mode.

## ⚡ MCP Integration Specifics
When interacting with n8n via MCP (Model Context Protocol):
- **Read-Only**: Most standard connections are Read/Execute only.
- **Modify Workflows**: Use `create_workflow` or provide **Copy-Paste JSON** to the user (most reliable method).
- **Triggers**: `get_workflow_details` returns `triggerInfo` which is the source of truth for active URL/Methods.

## 🧩 Copy-Paste Snippets
Use these JSON blocks to quickly set up common patterns.

### Basic Webhook + Logger
```json
{
  "nodes": [
    {
      "parameters": {"path": "test", "options": {}},
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0]
    },
    {
      "parameters": {"jsCode": "console.log($input.item.json);\nreturn $input.item;"},
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [200, 0]
    }
  ],
  "connections": {"n8n-nodes-base.webhook": {"main": [[{"node": "n8n-nodes-base.code", "type": "main", "index": 0}]]}}
}
```
