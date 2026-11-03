import { Router } from "express";
import {
  createBuilderPlan,
  deleteBuilderPlan,
  deleteBuilderPlanHistory,
  deleteBuilderPlanHistoryEntry,
  getBuilderPlanById,
  getBuilderPlanHistory,
  getBuilderPlans,
  updateBuilderPlan,
} from "../controller/builderPlan";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/requirePermission";
import { requirePlanHistoryAccess } from "../middlewares/requirePlanHistoryAccess";

const router = Router();

router.get("/", getBuilderPlans);
router.get("/history", authMiddleware, requirePlanHistoryAccess, getBuilderPlanHistory);
router.delete("/history", authMiddleware, requirePermission("plan:delete_history"), deleteBuilderPlanHistory);
router.delete("/history/:id", authMiddleware, requirePermission("plan:delete_history"), deleteBuilderPlanHistoryEntry);
router.get("/:id", getBuilderPlanById);
router.post("/", authMiddleware, requirePermission("plan:create"), createBuilderPlan);
router.patch("/:id", authMiddleware, requirePermission("plan:update"), updateBuilderPlan);
router.delete("/:id", authMiddleware, requirePermission("plan:delete"), deleteBuilderPlan);

export default router;
