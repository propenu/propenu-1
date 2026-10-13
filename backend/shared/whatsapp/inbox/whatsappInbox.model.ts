import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IWhatsAppConversation extends Document {
  waId: string;
  profileName?: string;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastDirection: "inbound" | "outbound";
  unreadCount: number;
  inboxStatus: "new" | "waiting" | "resolved";
  /** Real Cloud API traffic vs imported campaign logs */
  origin: "cloud" | "campaign_log";
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentRole?: string;
  /** True after the customer asks to talk to an agent. The assistant stays quiet. */
  botPaused?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWhatsAppMessage extends Document {
  conversationId: Types.ObjectId;
  waId: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string;
  wamid?: string;
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  error?: string;
  raw?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IWhatsAppConversation>(
  {
    waId: { type: String, required: true, unique: true, index: true },
    profileName: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "" },
    lastDirection: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "inbound",
    },
    unreadCount: { type: Number, default: 0 },
    inboxStatus: {
      type: String,
      enum: ["new", "waiting", "resolved"],
      default: "new",
      index: true,
    },
    assignedAgentId: { type: String, default: "", index: true },
    assignedAgentName: { type: String, default: "" },
    assignedAgentRole: { type: String, default: "" },
    botPaused: { type: Boolean, default: false },
    origin: {
      type: String,
      enum: ["cloud", "campaign_log"],
      default: "cloud",
      index: true,
    },
  },
  { timestamps: true },
);

const MessageSchema = new Schema<IWhatsAppMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "WhatsAppConversation",
      required: true,
      index: true,
    },
    waId: { type: String, required: true, index: true },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    type: { type: String, default: "text" },
    body: { type: String, default: "" },
    wamid: { type: String, index: true },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed"],
      default: "sent",
    },
    error: String,
    raw: Schema.Types.Mixed,
  },
  { timestamps: true },
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

/**
 * Inbox rows must live in the same database the public webhook writes.
 * Set WHATSAPP_INBOX_MONGO_URI when this process is not that server.
 */
let dedicatedInboxConnection: mongoose.Connection | null = null;

function inboxConnection() {
  const uri = String(process.env.WHATSAPP_INBOX_MONGO_URI || "").trim();
  const dbName = String(process.env.WHATSAPP_INBOX_DB_NAME || "").trim();
  if (!uri || !dbName) return mongoose;
  if (dedicatedInboxConnection) return dedicatedInboxConnection;

  dedicatedInboxConnection = mongoose.createConnection(uri, {
    dbName,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
  });
  dedicatedInboxConnection.on("connected", () => {
    console.log(`WhatsApp inbox Mongo connected: ${dbName}`);
  });
  dedicatedInboxConnection.on("error", (err) => {
    console.error("WhatsApp inbox Mongo error:", err?.message || err);
  });
  return dedicatedInboxConnection;
}

function bindModel<T>(name: string, schema: Schema<T>): Model<T> {
  const conn = inboxConnection();
  const existing = conn.models[name] as Model<T> | undefined;
  if (existing) return existing;
  return conn.model<T, Model<T>>(name, schema);
}

export const WhatsAppConversation: Model<IWhatsAppConversation> = bindModel(
  "WhatsAppConversation",
  ConversationSchema,
);

export const WhatsAppMessage: Model<IWhatsAppMessage> = bindModel(
  "WhatsAppMessage",
  MessageSchema,
);
