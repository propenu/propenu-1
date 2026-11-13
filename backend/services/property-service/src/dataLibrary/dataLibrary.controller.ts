import type { Response } from "express";
import path from "path";
import mongoose from "mongoose";
import type { Readable } from "stream";
import DataLibrary, {
  DataLibraryActivity,
  DataLibraryRow,
  DATA_LIBRARY_DOC_TYPES,
  type DataLibraryDocType,
} from "./dataLibrary.model";
import type { AuthRequest } from "../middlewares/authMiddleware";
import { getUploadedObject, uploadFile } from "../utils/uploadFile";

const SHEET_EXT = new Set([".xls", ".xlsx", ".csv", ".ods", ".tsv"]);
const DOC_EXT = new Set([".doc", ".docx", ".odt", ".rtf", ".txt", ".md"]);
const SLIDES_EXT = new Set([".ppt", ".pptx", ".odp"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);

const docTypeFromFileName = (name: string): DataLibraryDocType => {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (SHEET_EXT.has(ext)) return "sheet";
  if (DOC_EXT.has(ext)) return "doc";
  if (SLIDES_EXT.has(ext)) return "slides";
  if (IMAGE_EXT.has(ext)) return "image";
  return "other";
};

const docTypeFromLink = (url: URL): DataLibraryDocType => {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();
  if (host === "forms.gle" || pathname.startsWith("/forms")) return "form";
  if (host.endsWith("docs.google.com")) {
    if (pathname.startsWith("/spreadsheets")) return "sheet";
    if (pathname.startsWith("/document")) return "doc";
    if (pathname.startsWith("/presentation")) return "slides";
  }
  if (host.includes("form")) return "form";
  return docTypeFromFileName(pathname);
};

const parseLink = (value: unknown): URL | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

/** "YYYY-MM-DD" → 12:00 UTC that day; anything else → null. */
const parseRecordDate = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const todayRecordDate = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
  );
};

const cleanText = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDateParam = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const actorFrom = (req: AuthRequest) => ({
  id: String(req.user?.id || ""),
  name: String(req.user?.name || req.user?.email || ""),
  role: String(req.user?.roleName || ""),
});

const logActivity = (
  item: any,
  action: string,
  by: { id: string; name: string; role: string },
  details = "",
) =>
  DataLibraryActivity.create({
    itemId: item._id,
    itemTitle: item.title || "",
    docType: item.docType || "",
    action,
    by,
    details,
  }).catch((err) => console.error("data library activity log failed:", err?.message || err));

const MAX_TABLE_ROWS = 20000;
const MAX_TABLE_COLUMNS = 100;

const saveTable = async (
  item: any,
  body: any,
  by: { id: string; name: string; role: string },
) => {
  if (typeof body.tableColumns !== "string" || typeof body.tableRows !== "string") return;
  let columns: string[];
  let rows: string[][];
  try {
    columns = JSON.parse(body.tableColumns);
    rows = JSON.parse(body.tableRows);
  } catch {
    return;
  }
  if (!Array.isArray(columns) || !Array.isArray(rows) || !rows.length) return;

  const width = Math.min(
    MAX_TABLE_COLUMNS,
    Math.max(columns.length, ...rows.slice(0, MAX_TABLE_ROWS).map((r) => (Array.isArray(r) ? r.length : 0))),
  );
  const cleanColumns = Array.from(
    { length: width },
    (_, i) => cleanText(columns[i], 200) || `Column ${i + 1}`,
  );
  const docs = rows.slice(0, MAX_TABLE_ROWS).map((row, index) => {
    const cells = Array.from({ length: width }, (_, i) => cleanText(Array.isArray(row) ? row[i] : "", 2000));
    return { itemId: item._id, index, cells, search: cells.join(" ").toLowerCase() };
  });

  await DataLibraryRow.deleteMany({ itemId: item._id });
  await DataLibraryRow.insertMany(docs, { ordered: false });
  item.table = {
    columns: cleanColumns,
    rowCount: docs.length,
    source: item.docType === "pdf" ? "pdf" : "sheet",
    truncated: rows.length > MAX_TABLE_ROWS,
    extractedAt: new Date(),
    extractedBy: by,
  };
  await item.save();
  logActivity(
    item,
    "data_extracted",
    by,
    `${docs.length} row${docs.length === 1 ? "" : "s"} · ${cleanColumns.length} columns`,
  );
};

const buildListFilter = (query: AuthRequest["query"], includeDocType: boolean) => {
  const filter: Record<string, any> = { deletedAt: null };
  const { q, docType, category, from, to } = query;

  if (typeof q === "string" && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [
      { title: rx },
      { category: rx },
      { project: rx },
      { notes: rx },
      { "file.originalName": rx },
      { link: rx },
      { "uploadedBy.name": rx },
    ];
  }
  if (
    includeDocType &&
    typeof docType === "string" &&
    (DATA_LIBRARY_DOC_TYPES as readonly string[]).includes(docType)
  ) {
    filter.docType = docType;
  }
  if (typeof category === "string" && category.trim()) {
    filter.category = category.trim();
  }
  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to);
  if (fromDate || toDate) {
    filter.recordDate = {
      ...(fromDate ? { $gte: fromDate } : {}),
      ...(toDate ? { $lte: toDate } : {}),
    };
  }
  return filter;
};

export const listDataLibrary = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const filter = buildListFilter(req.query, true);
    if (req.query.hasTable === "1") filter["table.rowCount"] = { $gt: 0 };

    const [items, total, typeCounts, categories] = await Promise.all([
      DataLibrary.find(filter)
        .sort({ recordDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DataLibrary.countDocuments(filter),
      DataLibrary.aggregate([
        { $match: buildListFilter(req.query, false) },
        { $group: { _id: "$docType", count: { $sum: 1 } } },
      ]),
      DataLibrary.distinct("category", { category: { $ne: "" }, deletedAt: null }),
    ]);

    const summary: Record<string, number> = { all: 0 };
    for (const type of DATA_LIBRARY_DOC_TYPES) summary[type] = 0;
    for (const row of typeCounts) {
      summary[row._id] = row.count;
      summary.all = (summary.all ?? 0) + row.count;
    }

    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary,
      categories: (categories as string[]).sort((a, b) => a.localeCompare(b)),
    });
  } catch (err: any) {
    console.error("listDataLibrary:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const createDataLibraryItem = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const recordDate = parseRecordDate(body.recordDate) || todayRecordDate();
    const uploadedBy = actorFrom(req);
    const base = {
      category: cleanText(body.category, 80),
      project: cleanText(body.project, 120),
      notes: cleanText(body.notes, 2000),
      recordDate,
      uploadedBy,
    };

    if (req.file) {
      const uploaded = await uploadFile({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        folder: "data-library",
      });
      const fallbackTitle = path.basename(
        req.file.originalname,
        path.extname(req.file.originalname),
      );
      const item = await DataLibrary.create({
        ...base,
        title: cleanText(body.title) || fallbackTitle,
        sourceType: "file",
        docType: docTypeFromFileName(req.file.originalname),
        file: {
          key: uploaded.key,
          url: uploaded.url,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: uploaded.size,
        },
      });
      logActivity(item, "uploaded", uploadedBy, req.file.originalname);
      await saveTable(item, body, uploadedBy);
      return res.status(201).json({ data: item });
    }

    const link = parseLink(body.link);
    if (!link) {
      return res.status(400).json({
        message: "Attach a file or paste a valid link (Google Sheet, Doc, Form or any https URL).",
      });
    }

    const item = await DataLibrary.create({
      ...base,
      title: cleanText(body.title) || link.hostname,
      sourceType: "link",
      docType: docTypeFromLink(link),
      link: link.toString(),
    });
    logActivity(item, "link_added", uploadedBy, link.toString());
    return res.status(201).json({ data: item });
  } catch (err: any) {
    console.error("createDataLibraryItem:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const updateDataLibraryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const body = req.body || {};
    const update: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) update.title = cleanText(body.title);
    if (typeof body.category === "string") update.category = cleanText(body.category, 80);
    if (typeof body.project === "string") update.project = cleanText(body.project, 120);
    if (typeof body.notes === "string") update.notes = cleanText(body.notes, 2000);
    const recordDate = parseRecordDate(body.recordDate);
    if (recordDate) update.recordDate = recordDate;

    const existing = await DataLibrary.findById(id).lean<any>();
    if (!existing) return res.status(404).json({ message: "Item not found" });

    if (existing.sourceType === "link" && typeof body.link === "string") {
      const link = parseLink(body.link);
      if (!link) return res.status(400).json({ message: "Invalid link" });
      update.link = link.toString();
      update.docType = docTypeFromLink(link);
    }

    const item = await DataLibrary.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    logActivity(item, "updated", actorFrom(req), Object.keys(update).join(", "));
    return res.json({ data: item });
  } catch (err: any) {
    console.error("updateDataLibraryItem:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const deleteDataLibraryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: actorFrom(req) } },
      { new: true },
    ).lean<any>();
    if (!item) return res.status(404).json({ message: "Item not found" });

    logActivity(item, "deleted", actorFrom(req));
    return res.json({ message: "Deleted successfully" });
  } catch (err: any) {
    console.error("deleteDataLibraryItem:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const downloadDataLibraryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findById(id).lean<any>();
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.sourceType !== "file" || !item.file?.key) {
      return res.status(400).json({ message: "This item is a link — open it instead." });
    }

    const object = await getUploadedObject(item.file.key);
    const fileName = item.file.originalName || path.basename(item.file.key);
    const asciiName = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/"/g, "'");

    res.setHeader("Content-Type", item.file.mimetype || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    if (object.ContentLength) res.setHeader("Content-Length", String(object.ContentLength));

    DataLibrary.updateOne({ _id: id }, { $inc: { downloads: 1 } }).catch(() => undefined);
    logActivity(item, "downloaded", actorFrom(req), item.file?.originalName || "");

    const stream = object.Body as Readable | undefined;
    if (!stream) return res.status(404).json({ message: "File missing in storage" });
    stream.on("error", (err) => {
      console.error("Data library download stream error:", err);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(err);
    });
    stream.pipe(res);
    return undefined;
  } catch (err: any) {
    console.error("downloadDataLibraryItem:", err);
    if (err?.name === "NoSuchKey") {
      return res.status(404).json({ message: "File missing in storage" });
    }
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const restoreDataLibraryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { $set: { deletedAt: null, deletedBy: null } },
      { new: true },
    ).lean<any>();
    if (!item) return res.status(404).json({ message: "Item not found in deleted items" });

    logActivity(item, "restored", actorFrom(req));
    return res.json({ data: item });
  } catch (err: any) {
    console.error("restoreDataLibraryItem:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const listDeletedDataLibrary = async (req: AuthRequest, res: Response) => {
  try {
    const items = await DataLibrary.find({ deletedAt: { $ne: null } })
      .sort({ deletedAt: -1 })
      .limit(200)
      .lean();
    return res.json({ items });
  } catch (err: any) {
    console.error("listDeletedDataLibrary:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const getDataLibraryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findOne({ _id: id, deletedAt: null }).lean();
    if (!item) return res.status(404).json({ message: "Item not found" });
    return res.json({ data: item });
  } catch (err: any) {
    console.error("getDataLibraryItem:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const getDataLibraryTable = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findOne({ _id: id, deletedAt: null }).lean<any>();
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!item.table) return res.status(404).json({ message: "No table extracted for this document" });

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 2000);
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const filter: Record<string, any> = { itemId: item._id };
    if (q) filter.search = new RegExp(escapeRegex(q));

    let columnFilters: Record<string, string> = {};
    if (typeof req.query.filters === "string" && req.query.filters) {
      try {
        const parsed = JSON.parse(req.query.filters);
        if (parsed && typeof parsed === "object") columnFilters = parsed;
      } catch {
        columnFilters = {};
      }
    }
    const width = Array.isArray(item.table.columns) ? item.table.columns.length : 0;
    for (const [index, value] of Object.entries(columnFilters)) {
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= width || typeof value !== "string" || !value) continue;
      filter[`cells.${i}`] = value;
    }

    const [docs, total, facetRows] = await Promise.all([
      DataLibraryRow.find(filter).sort({ index: 1 }).skip((page - 1) * limit).limit(limit).lean<any[]>(),
      DataLibraryRow.countDocuments(filter),
      DataLibraryRow.aggregate([
        { $match: { itemId: item._id } },
        { $project: { cells: 1 } },
        { $unwind: { path: "$cells", includeArrayIndex: "i" } },
        { $group: { _id: { i: "$i", v: "$cells" } } },
        { $group: { _id: "$_id.i", values: { $addToSet: "$_id.v" } } },
      ]),
    ]);

    const facets: Record<string, string[]> = {};
    for (const row of facetRows) {
      const values = (row.values as string[])
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
      if (unique.length >= 2 && unique.length <= 40) facets[String(row._id)] = unique;
    }

    return res.json({
      columns: item.table.columns,
      rowCount: item.table.rowCount,
      truncated: item.table.truncated,
      extractedAt: item.table.extractedAt,
      facets,
      total,
      page,
      limit,
      rows: docs.map((d) => d.cells),
    });
  } catch (err: any) {
    console.error("getDataLibraryTable:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const syncDataLibraryTable = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findOne({ _id: id, deletedAt: null });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const by = actorFrom(req);
    const before = (item as any).table?.rowCount ?? 0;
    await saveTable(item, req.body || {}, by);
    const after = (item as any).table?.rowCount ?? 0;
    if (!after) return res.status(400).json({ message: "No table data received" });

    logActivity(item, "data_synced", by, `${before} → ${after} rows`);
    return res.json({ data: item });
  } catch (err: any) {
    console.error("syncDataLibraryTable:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const exportDataLibraryTable = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const item = await DataLibrary.findOne({ _id: id, deletedAt: null }).lean<any>();
    if (!item?.table) return res.status(404).json({ message: "No table extracted for this document" });

    const docs = await DataLibraryRow.find({ itemId: item._id }).sort({ index: 1 }).lean<any[]>();
    const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const lines = [
      item.table.columns.map(cell).join(","),
      ...docs.map((d: any) => (d.cells as string[]).map(cell).join(",")),
    ];
    const fileName = `${(item.title || "data").replace(/[^\w\- ]+/g, "").trim() || "data"}.csv`;

    logActivity(item, "data_exported", actorFrom(req), `${docs.length} rows`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(`\uFEFF${lines.join("\n")}`);
  } catch (err: any) {
    console.error("exportDataLibraryTable:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

export const listDataLibraryActivity = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const filter: Record<string, any> = {};
    if (typeof req.query.itemId === "string" && mongoose.Types.ObjectId.isValid(req.query.itemId)) {
      filter.itemId = req.query.itemId;
    }
    if (typeof req.query.action === "string" && req.query.action) filter.action = req.query.action;

    const items = await DataLibraryActivity.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ items });
  } catch (err: any) {
    console.error("listDataLibraryActivity:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};
