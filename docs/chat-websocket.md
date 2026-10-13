# Chat API Documentation

> **Version:** 1.0.0
> **Namespace:** `/chat`
> **Transport:** Socket.IO (WebSocket) + HTTP REST

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Room Naming Conventions](#room-naming-conventions)
4. [WebSocket Connection Lifecycle](#websocket-connection-lifecycle)
5. [WebSocket Events — Client → Server](#websocket-events--client--server)
   - [join_conversation](#join_conversation)
   - [send_message](#send_message)
   - [typing](#typing)
6. [WebSocket Events — Server → Client](#websocket-events--server--client)
   - [connected](#connected)
   - [conversation_joined](#conversation_joined)
   - [new_message](#new_message)
   - [typing (broadcast)](#typing-broadcast)
   - [error](#error)
7. [REST Endpoints](#rest-endpoints)
   - [POST /chat/upload](#post-chatupload)
   - [GET /chat/conversations](#get-chatconversations)
   - [GET /chat/conversations/:id/messages](#get-chatconversationsidmessages)
8. [Data Schemas](#data-schemas)
9. [Message Types](#message-types)
10. [User Roles & Access Rules](#user-roles--access-rules)
11. [Error Handling](#error-handling)
12. [Integration Flow (Image Messaging)](#integration-flow-image-messaging)

---

## Overview

The VillasQatar Chat system enables real-time messaging between property enquirers and dealers/dealer-staff using **Socket.IO** over WebSocket. REST endpoints are also provided for conversation listing, message history retrieval, and media uploads.

```
WebSocket URL: ws://<host>/chat
REST Base URL: http://<host>/chat
```

---

## Authentication

All WebSocket connections and REST calls require a **JWT Bearer token**.

### WebSocket

Pass the JWT token during the Socket.IO handshake via the `auth` object or as a query parameter:

```js
// Option 1: auth object (recommended)
const socket = io('http://<host>/chat', {
  auth: { token: '<JWT>' }
});

// Option 2: query parameter
const socket = io('http://<host>/chat', {
  query: { token: '<JWT>' }
});
```

> ⚠️ **Unauthenticated connections are rejected immediately.** The socket will be disconnected without emitting any event.

### REST

```
Authorization: Bearer <JWT>
```

---

## Room Naming Conventions

| Room Pattern            | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `conv:<conversationId>` | All participants of a single conversation            |
| `dealer:<dealerUserId>` | Dealer + all their staff (shared broadcast room)     |

Clients are **auto-joined** to relevant rooms:
- `DEALER` → joined to `dealer:<their own userId>` on connection
- `DEALER_STAFF` → joined to `dealer:<parent dealerUserId>` on connection
- Any user → joined to `conv:<conversationId>` after `join_conversation`

---

## WebSocket Connection Lifecycle

```
Client                              Server (/chat namespace)
  │                                       │
  │──── connect (with JWT) ───────────────▶│
  │                                       │  authenticate via WsJwtGuard
  │                                       │  auto-join dealer room (if applicable)
  │◀─── "connected" event ────────────────│
  │                                       │
  │──── "join_conversation" ──────────────▶│
  │◀─── "conversation_joined" ────────────│
  │                                       │
  │──── "send_message" ───────────────────▶│
  │◀─── "new_message" (broadcast) ────────│
  │                                       │
  │──── "typing" ─────────────────────────▶│
  │◀─── "typing" (broadcast to others) ───│
  │                                       │
  │──── disconnect ───────────────────────▶│
```

---

## WebSocket Events — Client → Server

### `join_conversation`

Creates or retrieves an existing conversation for a given listing. Automatically joins the client into the `conv:<conversationId>` Socket.IO room.

**Guard:** `WsJwtGuard` (JWT required)

#### Payload

```json
{
  "listingId": "string"
}
```

| Field       | Type     | Required | Description                        |
| ----------- | -------- | -------- | ---------------------------------- |
| `listingId` | `string` | ✅ Yes   | UUID of the property listing       |

#### Participants Auto-Added

When a new conversation is created, the following users are added as participants:

| User                       | Condition                          |
| -------------------------- | ---------------------------------- |
| Enquiring user             | Always                             |
| Listing owner              | Always                             |
| All dealer staff           | If listing owner is `DEALER`       |
| Parent dealer + all staff  | If listing owner is `DEALER_STAFF` |

#### Response Event

On success, the server emits [`conversation_joined`](#conversation_joined) back to the requesting client.

#### Restrictions

- `DEALER` and `DEALER_STAFF` **cannot** initiate a conversation on their **own** listings → `error` event with `403` message.

#### Example

```js
socket.emit('join_conversation', { listingId: 'listing-uuid-here' });

socket.on('conversation_joined', (data) => {
  console.log('Joined conversation:', data.conversation.id);
});
```

---

### `send_message`

Persists a message to the database and broadcasts it to all participants in the conversation room and the dealer room.

**Guard:** `WsJwtGuard` (JWT required)

#### Payload

```json
{
  "conversationId": "string",
  "type": "TEXT | IMAGE | LOCATION",
  "content": "string",
  "mediaUrl": "string",
  "latitude": 0.0,
  "longitude": 0.0,
  "locationLabel": "string"
}
```

| Field            | Type          | Required                   | Description                                   |
| ---------------- | ------------- | -------------------------- | --------------------------------------------- |
| `conversationId` | `string`      | ✅ Yes                     | UUID of the target conversation               |
| `type`           | `MessageType` | ✅ Yes                     | `TEXT`, `IMAGE`, or `LOCATION`                |
| `content`        | `string`      | ✅ If `type = TEXT`        | Text body of the message                      |
| `mediaUrl`       | `string`      | ✅ If `type = IMAGE`       | MinIO presigned URL of the uploaded image     |
| `latitude`       | `number`      | ✅ If `type = LOCATION`    | Geographic latitude                           |
| `longitude`      | `number`      | ✅ If `type = LOCATION`    | Geographic longitude                          |
| `locationLabel`  | `string`      | ❌ Optional                | Human-readable location description           |

#### Broadcast

On success, broadcasts [`new_message`](#new_message) to:
1. All sockets in `conv:<conversationId>`
2. All sockets in `dealer:<dealerUserId>` (dealer/staff notifications)

#### Example — TEXT

```js
socket.emit('send_message', {
  conversationId: 'conv-uuid',
  type: 'TEXT',
  content: 'Hello, I am interested in this property!'
});
```

#### Example — IMAGE

```js
// Step 1: Upload image via REST
const formData = new FormData();
formData.append('file', imageFile);
const res = await fetch('/chat/upload', {
  method: 'POST',
  headers: { Authorization: 'Bearer <JWT>' },
  body: formData
});
const { url } = await res.json();

// Step 2: Send message with image URL
socket.emit('send_message', {
  conversationId: 'conv-uuid',
  type: 'IMAGE',
  mediaUrl: url
});
```

#### Example — LOCATION

```js
socket.emit('send_message', {
  conversationId: 'conv-uuid',
  type: 'LOCATION',
  latitude: 25.2854,
  longitude: 51.5310,
  locationLabel: 'Pearl Qatar, Doha'
});
```

---

### `typing`

Broadcasts a typing indicator to all **other** participants in the conversation room. This event is ephemeral and not persisted.

**Guard:** `WsJwtGuard` (JWT required)

#### Payload

```json
{
  "conversationId": "string"
}
```

| Field            | Type     | Required | Description                  |
| ---------------- | -------- | -------- | ---------------------------- |
| `conversationId` | `string` | ✅ Yes   | UUID of the conversation     |

#### Broadcast

Emits [`typing`](#typing-broadcast) to all sockets in `conv:<conversationId>` **excluding the sender**.

#### Example

```js
// Send typing indicator
inputEl.addEventListener('input', () => {
  socket.emit('typing', { conversationId: 'conv-uuid' });
});

// Listen for others typing
socket.on('typing', ({ conversationId, userId, name }) => {
  showTypingIndicator(`${name} is typing...`);
});
```

---

## WebSocket Events — Server → Client

### `connected`

Emitted to the client immediately after a successful authenticated connection.

```json
{
  "message": "Connected to VillasQatar Chat",
  "userId": "string",
  "role": "USER | DEALER | DEALER_STAFF | ADMIN"
}
```

| Field     | Type     | Description                        |
| --------- | -------- | ---------------------------------- |
| `message` | `string` | Static confirmation string         |
| `userId`  | `string` | Authenticated user's UUID          |
| `role`    | `string` | User's role in the system          |

---

### `conversation_joined`

Emitted to the requesting client after a successful `join_conversation` event.

```json
{
  "conversation": {
    "id": "string",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "participantIds": ["string"]
  },
  "listing": {
    "id": "string",
    "propertyName": "string",
    "type": "string",
    "purpose": "string",
    "price": 0,
    "areaName": "string",
    "municipality": "string",
    "bedrooms": 0,
    "bathrooms": 0,
    "area": 0,
    "addressLine1": "string",
    "contactPhone": "string",
    "contactWhatsapp": "string",
    "photos": [
      { "url": "string", "caption": "string", "sortOrder": 0 }
    ],
    "createdBy": {
      "id": "string",
      "name": "string",
      "email": "string"
    }
  },
  "messages": [
    {
      "id": "string",
      "type": "TEXT | IMAGE | LOCATION",
      "content": "string | null",
      "mediaUrl": "string | null",
      "latitude": "number | null",
      "longitude": "number | null",
      "locationLabel": "string | null",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "sender": {
        "id": "string",
        "name": "string",
        "email": "string",
        "role": "string"
      }
    }
  ]
}
```

> **Note:** `messages` returns the last **50** messages ordered oldest first.

---

### `new_message`

Broadcast to all participants in `conv:<conversationId>` and `dealer:<dealerUserId>` when a new message is sent.

```json
{
  "id": "string",
  "conversationId": "string",
  "type": "TEXT | IMAGE | LOCATION",
  "content": "string | null",
  "mediaUrl": "string | null",
  "latitude": "number | null",
  "longitude": "number | null",
  "locationLabel": "string | null",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "sender": {
    "id": "string",
    "name": "string",
    "email": "string",
    "role": "string"
  }
}
```

---

### `typing` (broadcast)

Emitted to all participants in `conv:<conversationId>` **except the sender**.

```json
{
  "conversationId": "string",
  "userId": "string",
  "name": "string"
}
```

| Field            | Type     | Description                     |
| ---------------- | -------- | ------------------------------- |
| `conversationId` | `string` | The conversation being typed in |
| `userId`         | `string` | The typing user's UUID          |
| `name`           | `string` | The typing user's display name  |

---

### `error`

Emitted to the requesting client when a server-side error occurs during event handling.

```json
{
  "message": "string"
}
```

---

## REST Endpoints

All REST endpoints require:
- **Authentication:** `Authorization: Bearer <JWT>`
- **Swagger Tag:** `Chat`

---

### `POST /chat/upload`

Uploads a chat image to MinIO storage and returns a 7-day presigned URL.

> This is **Step 1** for image messaging. After getting the URL, use `send_message` via WebSocket with `type = IMAGE` and `mediaUrl = <returned URL>`.

#### Request

- **Content-Type:** `multipart/form-data`
- **Max file size:** 10 MB
- **Allowed MIME types:** `image/*`

| Field  | Type   | Description          |
| ------ | ------ | -------------------- |
| `file` | binary | Image file to upload |

#### Response `200 OK`

```json
{
  "url": "https://minio-host/chat/userId/uuid.jpg?X-Amz-Signature=...",
  "key": "chat/userId/uuid.jpg"
}
```

| Field | Type     | Description                    |
| ----- | -------- | ------------------------------ |
| `url` | `string` | Presigned URL valid for 7 days |
| `key` | `string` | MinIO object key               |

#### Errors

| Status | Description                        |
| ------ | ---------------------------------- |
| `400`  | No file provided or non-image file |
| `401`  | Missing or invalid JWT             |

---

### `GET /chat/conversations`

Returns all conversations the authenticated user participates in, ordered by most recently updated. Includes a last-message preview and listing details.

Works for all roles: `USER`, `DEALER`, `DEALER_STAFF`.

#### Response `200 OK`

```json
[
  {
    "id": "string",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "listing": {
      "id": "string",
      "propertyName": "string",
      "type": "string",
      "purpose": "string",
      "photos": [{ "url": "string" }]
    },
    "user": {
      "id": "string",
      "name": "string",
      "email": "string"
    },
    "participants": [
      {
        "userId": "string",
        "user": { "id": "string", "name": "string", "role": "string" }
      }
    ],
    "lastMessage": {
      "id": "string",
      "type": "TEXT | IMAGE | LOCATION",
      "content": "string | null",
      "mediaUrl": "string | null",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "sender": { "id": "string", "name": "string" }
    }
  }
]
```

> **Note:** `lastMessage` is `null` if the conversation has no messages yet.

#### Errors

| Status | Description            |
| ------ | ---------------------- |
| `401`  | Missing or invalid JWT |

---

### `GET /chat/conversations/:id/messages`

Returns paginated message history for a specific conversation. The calling user must be a participant.

#### Path Parameters

| Parameter | Type     | Description       |
| --------- | -------- | ----------------- |
| `id`      | `string` | Conversation UUID |

#### Query Parameters

| Parameter | Type     | Default | Validation | Description                   |
| --------- | -------- | ------- | ---------- | ----------------------------- |
| `page`    | `number` | `1`     | min: 1     | Page number (1-based)         |
| `limit`   | `number` | `50`    | min: 1     | Number of messages per page   |

#### Response `200 OK`

```json
{
  "data": [
    {
      "id": "string",
      "type": "TEXT | IMAGE | LOCATION",
      "content": "string | null",
      "mediaUrl": "string | null",
      "latitude": "number | null",
      "longitude": "number | null",
      "locationLabel": "string | null",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "sender": {
        "id": "string",
        "name": "string",
        "email": "string",
        "role": "string"
      }
    }
  ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

> **Note:** Messages are ordered by `createdAt` ascending (oldest first).

#### Errors

| Status | Description                                        |
| ------ | -------------------------------------------------- |
| `401`  | Missing or invalid JWT                             |
| `403`  | User is not a participant in this conversation     |
| `404`  | Conversation not found                             |

---

## Data Schemas

### `Conversation`

| Field            | Type       | Description                           |
| ---------------- | ---------- | ------------------------------------- |
| `id`             | `string`   | UUID                                  |
| `listingId`      | `string`   | Related listing UUID                  |
| `userId`         | `string`   | UUID of the enquiring user            |
| `participantIds` | `string[]` | Array of all participant user UUIDs   |
| `createdAt`      | `datetime` | ISO 8601 timestamp                    |
| `updatedAt`      | `datetime` | ISO 8601 — updated on each new message |

### `Message`

| Field            | Type       | Description                                     |
| ---------------- | ---------- | ----------------------------------------------- |
| `id`             | `string`   | UUID                                            |
| `conversationId` | `string`   | Parent conversation UUID                        |
| `type`           | `string`   | `TEXT`, `IMAGE`, or `LOCATION`                  |
| `content`        | `string?`  | Text content (TEXT messages only)               |
| `mediaUrl`       | `string?`  | MinIO presigned URL (IMAGE messages only)       |
| `latitude`       | `number?`  | Latitude (LOCATION messages only)               |
| `longitude`      | `number?`  | Longitude (LOCATION messages only)              |
| `locationLabel`  | `string?`  | Human-readable label (LOCATION messages only)   |
| `createdAt`      | `datetime` | ISO 8601 timestamp                              |
| `sender`         | `User`     | Sender details (partial)                        |

### `User (partial)`

| Field   | Type     | Description                                  |
| ------- | -------- | -------------------------------------------- |
| `id`    | `string` | UUID                                         |
| `name`  | `string` | Display name                                 |
| `email` | `string` | Email address                                |
| `role`  | `string` | `USER`, `DEALER`, `DEALER_STAFF`, or `ADMIN` |

---

## Message Types

| Type       | Required Fields             | Optional Fields   | Description                      |
| ---------- | --------------------------- | ----------------- | -------------------------------- |
| `TEXT`     | `content`                   | —                 | Plain text message               |
| `IMAGE`    | `mediaUrl`                  | —                 | Image with MinIO presigned URL   |
| `LOCATION` | `latitude`, `longitude`     | `locationLabel`   | Geographic location pin          |

---

## User Roles & Access Rules

| Role           | Can Initiate Chat       | Can Send Messages | Auto-joined Room                   |
| -------------- | :---------------------: | :---------------: | ---------------------------------- |
| `USER`         | ✅ Yes                  | ✅ Yes            | None (joins per conversation)      |
| `DEALER`       | ❌ On own listings only | ✅ Yes            | `dealer:<their userId>`            |
| `DEALER_STAFF` | ❌ On own listings only | ✅ Yes            | `dealer:<parent dealerUserId>`     |
| `ADMIN`        | ✅ Yes                  | ✅ Yes            | None                               |

> **Note:** Dealers and dealer staff receive an `error` WebSocket event if they attempt to initiate a chat on a listing they own or manage.

---

## Error Handling

### WebSocket Errors

All runtime errors are emitted as the `error` event to the requesting socket:

```json
{ "message": "<error description>" }
```

#### Common Error Messages

| Trigger                                  | Error Message                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Invalid / missing JWT on connect         | Socket disconnected (no event emitted)                                    |
| Dealer initiating chat on own listing    | `Dealers and their staff cannot initiate a chat on their own listing`    |
| Non-participant attempting to send       | `You are not a participant of this conversation`                          |
| DTO validation failure                   | `Validation failed: <comma-separated field errors>`                      |
| Listing not found on `join_conversation` | `Listing "<listingId>" not found`                                        |
| Generic internal error                   | `Failed to join conversation` / `Failed to send message`                 |

---

## Integration Flow (Image Messaging)

```
Client                                    Server
  │                                          │
  │── POST /chat/upload ────────────────────▶│
  │   Content-Type: multipart/form-data      │  Validates file (image/*, ≤10MB)
  │   { file: <binary> }                     │  Uploads to MinIO
  │◀── 200 { url, key } ───────────────────│  Returns 7-day presigned URL
  │                                          │
  │── WS emit: "send_message" ──────────────▶│
  │   {                                      │  Validates participant
  │     conversationId: "...",               │  Saves message to DB
  │     type: "IMAGE",                       │  Broadcasts to conv room
  │     mediaUrl: "<presigned-url>"          │  Broadcasts to dealer room
  │   }                                      │
  │◀── WS emit: "new_message" (broadcast) ──│  All participants receive message
```

---

*Documentation generated for VillasQatar Chat API — Socket.IO Gateway on `/chat` namespace.*
