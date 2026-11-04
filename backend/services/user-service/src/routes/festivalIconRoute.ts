import { Router } from "express";
import { FESTIVALS } from "../constants/festivals";

const router = Router();

router.get("/today", (_req, res) => {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const festival = FESTIVALS.find((item) => item.date === date) ?? null;

  res.set("Cache-Control", "public, max-age=300").json({
    date,
    timezone: "Asia/Kolkata",
    festival: festival ? { occasion: festival.occasion, id: festival.id } : null,
  });
});

router.get("/:festivalId", (req, res) => {
  const festival = FESTIVALS.find((item) => item.id === req.params.festivalId);

  if (!festival) {
    res.status(404).json({ message: "Festival not found" });
    return;
  }

  res.json({
    date: festival.date,
    timezone: "Asia/Kolkata",
    festival: { occasion: festival.occasion, id: festival.id },
  });
});

export default router;
