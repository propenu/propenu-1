import mongoose, { Model } from "mongoose";

const { Schema } = mongoose;

export const DATA_LIBRARY_DOC_TYPES = [
  "pdf",
  "sheet",
  "doc",
  "form",
  "slides",
  "image",
  "other",
] as const;

export type DataLibraryDocType = (typeof DATA_LIBRARY_DOC_TYPES)[number];

const fileSchema = new Schema(
  {
    key: { type: String, default: "" },
    url: { type: String, default: "" },
    originalName: { type: String, default: "" },
    mimetype: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);

const uploaderSchema = new Schema(
  {
    id: { type: String, default: "" },
    name: { type: String, default: "" },
    role: { type: String, default: "" },
  },
  { _id: false },
);

const tableInfoSchema = new Schema(
  {
    columns: { type: [String], default: [] },
    rowCount: { type: Number, default: 0 },
    source: { type: String, default: "" },
    truncated: { type: Boolean, default: false },
    extractedAt: { type: Date, default: null },
    extractedBy: { type: uploaderSchema, default: () => ({}) },
  },
  { _id: false },
);

const dataLibrarySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    sourceType: { type: String, enum: ["file", "link"], required: true },
    docType: {
      type: String,
      enum: DATA_LIBRARY_DOC_TYPES,
      default: "other",
      index: true,
    },
    category: { type: String, trim: true, default: "", index: true },
    project: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    /** Day the data belongs to (stored at 12:00 UTC so the calendar day is stable across timezones). */
    recordDate: { type: Date, required: true, index: true },
    file: { type: fileSchema, default: null },
    link: { type: String, trim: true, default: "" },
    uploadedBy: { type: uploaderSchema, default: () => ({}) },
    downloads: { type: Number, default: 0 },
    table: { type: tableInfoSchema, default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: uploaderSchema, default: null },
  },
  { timestamps: true },
);

dataLibrarySchema.index({ recordDate: -1, createdAt: -1 });

/** One document per extracted table row, so large sheets stay under Mongo's 16 MB doc limit. */
const dataLibraryRowSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, required: true },
  index: { type: Number, required: true },
  cells: { type: [String], default: [] },
  search: { type: String, default: "" },
});

dataLibraryRowSchema.index({ itemId: 1, index: 1 });

export const DATA_LIBRARY_ACTIONS = [
  "uploaded",
  "link_added",
  "updated",
  "deleted",
  "restored",
  "downloaded",
  "data_extracted",
  "data_synced",
  "data_exported",
] as const;

const dataLibraryActivitySchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true, index: true },
    itemTitle: { type: String, default: "" },
    docType: { type: String, default: "" },
    action: { type: String, enum: DATA_LIBRARY_ACTIONS, required: true, index: true },
    by: { type: uploaderSchema, default: () => ({}) },
    details: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

dataLibraryActivitySchema.index({ createdAt: -1 });

const getModel = (name: string, schema: any): Model<any> => {
  try {
    return mongoose.model(name);
  } catch {
    return mongoose.model(name, schema);
  }
};

const DataLibrary = getModel("data_library_item", dataLibrarySchema);
export const DataLibraryRow = getModel("data_library_row", dataLibraryRowSchema);
export const DataLibraryActivity = getModel("data_library_activity", dataLibraryActivitySchema);

export default DataLibrary;
