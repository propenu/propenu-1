import PDFDocument from "pdfkit";
import { Buffer } from "buffer";
import path from "path";
import fs from "fs";

export type ProformaPdfData = {
  proformaNumber: string;
  proformaDate: Date;
  validUntil?: Date | null;
  clientName?: string;
  companyName?: string;
  projectName?: string;
  clientAddress?: string;
  gstin?: string;
  items: { productName: string; sacCode?: string; qty?: number; days?: number; amount?: number }[];
  subtotalAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  notes?: string;
};

const GREEN = "#27AE60";
const SOFT = "#F3FAF5";
const TEXT = "#1F2937";
const MUTED = "#4B5563";
const LINE = "#D1D5DB";

const money = (value: number) =>
  `Rs. ${(Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value?: Date | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

export function generateProformaPdf(data: ProformaPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 40;
    const right = pageW - 40;
    const contentW = right - left;

    // Header band
    doc.rect(0, 0, pageW, 170).fill(SOFT);
    const logoPath = path.join(process.cwd(), "src/assets/watermark.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, left, 24, { width: 120 });
    else doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(22).text("Propenu", left, 28);

    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10).text("Propenu Solutions Private Limited", left, 80);
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text("3rd Floor, SV Chambers, Plot No. 193, Kavuri Hills,", left, 96)
      .text("Madhapur, Hyderabad - 500081", left, 106);
    doc.fillColor(TEXT).font("Helvetica").fontSize(15).text("Pro-forma", left, 134);

    const contactX = 410;
    doc.font("Helvetica").fontSize(9).fillColor(TEXT);
    doc.text("Phone: +91 9182334233", contactX, 88, { width: right - contactX, align: "right" });
    doc.text("contact@propenu.com", contactX, 112, { width: right - contactX, align: "right" });
    doc.text("www.propenu.com", contactX, 136, { width: right - contactX, align: "right" });

    // Invoice meta + bill to
    const metaY = 192;
    const labelValue = (label: string, value: string, x: number, y: number, width: number) => {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, x, y, { continued: true, width });
      doc.font("Helvetica-Bold").fillColor(TEXT).text(` ${value || "-"}`);
      return doc.y;
    };
    labelValue("Invoice Id:", data.proformaNumber, left, metaY, 220);
    labelValue("Date:", dateText(data.proformaDate), left, metaY + 22, 220);
    if (data.validUntil) labelValue("Valid until:", dateText(data.validUntil), left, metaY + 44, 220);

    const billX = 320;
    const billW = right - billX;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT).text("BILL TO", billX, metaY);
    let billY = metaY + 24;
    const clientLabel = [data.clientName, data.companyName].filter(Boolean).join(" / ");
    billY = labelValue("Client / Builder Name:", clientLabel, billX, billY, billW) + 6;
    billY = labelValue("Project Name:", data.projectName || "", billX, billY, billW) + 6;
    billY = labelValue("Client Address:", data.clientAddress || "", billX, billY, billW) + 6;
    billY = labelValue("GSTIN:", data.gstin || "", billX, billY, billW) + 6;

    // Items table
    let y = Math.max(billY + 18, metaY + 140);
    const w = { sno: 45, name: contentW - 45 - 75 - 45 - 50 - 85, sac: 75, qty: 45, days: 50, amount: 85 };
    const x = {
      sno: left,
      name: left + w.sno,
      sac: left + w.sno + w.name,
      qty: left + w.sno + w.name + w.sac,
      days: left + w.sno + w.name + w.sac + w.qty,
      amount: left + w.sno + w.name + w.sac + w.qty + w.days,
    };
    const cell = (value: string, cx: number, cw: number, cy: number, align: "left" | "right" = "left") =>
      doc.text(value, cx + 8, cy, { width: cw - 16, align });

    const headerH = 30;
    doc.rect(left, y, contentW, headerH).fill(GREEN);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#FFFFFF");
    cell("S.No", x.sno, w.sno, y + 10);
    cell("Product Name", x.name, w.name, y + 10);
    cell("SAC Code", x.sac, w.sac, y + 10);
    cell("Qty", x.qty, w.qty, y + 10);
    cell("Days", x.days, w.days, y + 10);
    cell("Amount", x.amount, w.amount, y + 10, "right");
    y += headerH;

    const rows = Math.max(5, data.items.length);
    doc.font("Helvetica").fontSize(9);
    for (let i = 0; i < rows; i += 1) {
      const item = data.items[i];
      const nameH = item ? doc.heightOfString(item.productName || "", { width: w.name - 16 }) : 0;
      const rowH = Math.max(28, nameH + 14);
      if (y + rowH > pageH - 60) {
        doc.addPage({ size: "A4", margin: 0 });
        y = 40;
      }
      doc.lineWidth(0.6).strokeColor(LINE).rect(left, y, contentW, rowH).stroke();
      [x.name, x.sac, x.qty, x.days, x.amount].forEach((lineX) => doc.moveTo(lineX, y).lineTo(lineX, y + rowH).stroke());
      doc.fillColor(MUTED);
      cell(String(i + 1).padStart(2, "0"), x.sno, w.sno, y + 10);
      if (item) {
        doc.fillColor(TEXT);
        cell(item.productName || "", x.name, w.name, y + 8);
        cell(item.sacCode || "", x.sac, w.sac, y + 10);
        cell(item.qty ? String(item.qty) : "", x.qty, w.qty, y + 10);
        cell(item.days ? String(item.days) : "", x.days, w.days, y + 10);
        cell(money(item.amount || 0), x.amount, w.amount, y + 10, "right");
      } else {
        cell("Rs.", x.amount, w.amount, y + 10);
      }
      y += rowH;
    }

    // Bank details + totals
    const notesH = data.notes ? doc.fontSize(8.5).heightOfString(`Notes: ${data.notes}`, { width: contentW }) + 10 : 0;
    const closingH = 26 + 110 + notesH + 10 + 74 + 14;
    if (y + closingH > pageH - 40) {
      doc.addPage({ size: "A4", margin: 0 });
      y = 40;
    }
    y += 26;
    doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
      .text("Cheque/DD may be issued favouring PROPENU SOLUTIONS PRIVATE LIMITED", left, y);
    const bankLines: [string, string][] = [
      ["Account Name:", "PROPENU SOLUTIONS PRIVATE LIMITED"],
      ["IFSC Code:", "IDFB0080229"],
      ["Account Type:", "Current Account"],
      ["Account Number:", "89000398485"],
    ];
    let bankY = y + 24;
    bankLines.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT).text(label, left, bankY, { continued: true, width: 300 });
      doc.font("Helvetica").text(` ${value}`);
      bankY += 18;
    });

    const totalsX = 360;
    const totalsW = 175;
    doc.font("Helvetica").fontSize(9.5).fillColor(TEXT);
    doc.text(`Sub Total  ${money(data.subtotalAmount)}`, totalsX, y + 26, { width: totalsW });
    doc.text(`GST (${data.gstRate}%)  ${money(data.gstAmount)}`, totalsX, y + 48, { width: totalsW });
    doc.rect(totalsX - 4, y + 70, totalsW, 24).fill(GREEN);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#FFFFFF")
      .text(`Total Amount: ${money(data.totalAmount)}`, totalsX + 6, y + 77, { width: totalsW - 12 });

    y = Math.max(bankY, y + 100) + 10;
    if (data.notes) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT).text("Notes:", left, y, { continued: true, width: contentW });
      doc.font("Helvetica").fillColor(MUTED).text(` ${data.notes}`);
      y = doc.y + 10;
    }

    // Registration band
    y += 10;
    doc.rect(0, y, pageW, 62).fill(SOFT);
    const regCols: [string, string, number][] = [
      ["CIN Number", "U70200TS2025PTC205314", left],
      ["PAN Number", "AAQCP2952F", 230],
      ["GST Number", "36AAQCP2952F1Z5", 410],
    ];
    regCols.forEach(([label, value, x]) => {
      doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(label, x, y + 14);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEXT).text(value, x, y + 34);
    });
    y += 74;

    const validText = data.validUntil ? dateText(data.validUntil) : "[DATE]";
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(
      `This computer-generated SAMPLE pro-forma is for commercial discussion only and is not a tax invoice. Valid until: ${validText}.`,
      left,
      y,
      { width: contentW },
    );

    doc.font("Helvetica").fontSize(7).fillColor(GREEN).text(
      "Propenu - Trust-First Real Estate Platform  |  Verified Properties  |  Verified Users  |  Spam-Free Search  |  www.propenu.com",
      left,
      Math.max(doc.y + 16, pageH - 34),
      { width: contentW, align: "center" },
    );

    doc.end();
  });
}
