import { Router } from "express";
import {
  createHomeLoanApplicationController,
  listHomeLoanApplicationsController,
  updateHomeLoanStatusController,
} from "../controller/homeLoanApplicationController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.post("/applications", createHomeLoanApplicationController);
router.get("/admin/applications", authMiddleware, listHomeLoanApplicationsController);
router.patch(
  "/admin/applications/:id",
  authMiddleware,
  updateHomeLoanStatusController,
);

export default router;
