import rateLimit from "express-rate-limit";

const commonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => {
    const url = String(req.originalUrl || req.url || "");
    return (
      req.path === "/health" ||
      url.includes("/whatsapp/inbox/stream") ||
      url.includes("/deleted-listings/access/stream")
    );
  },
  handler: (req: any, res: any, _next: any, options: any) => {
    const resetTime = req.rateLimit?.resetTime?.getTime?.();
    const retryAfter = resetTime
      ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
      : Math.max(1, Math.ceil((options.windowMs || 60 * 1000) / 1000));

    res.setHeader("Retry-After", String(retryAfter));
    res.status(options.statusCode).json(options.message);
  },
};

export const globalApiLimiter = rateLimit({
  ...commonOptions,
  windowMs: 5 * 60 * 1000,
  max: 2000,
  message: {
    success: false,
    message: "Too many requests. Please slow down and try again shortly.",
  },
});

export const chatbotLimiter = rateLimit({
  ...commonOptions,
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Propenu is receiving too many messages. Please try again in a few minutes.",
  },
});


export const paymentLimiter = rateLimit({
  ...commonOptions,
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many payment requests. Please wait a moment and try again.",
  },
});
