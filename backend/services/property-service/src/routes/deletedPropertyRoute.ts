import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  getDeletedProperties,
  getDeletedPropertyListing,
  purgeDeletedProperty,
} from "../controller/deletedPropertyController";

const router = express.Router();

router.get("/", authMiddleware, getDeletedProperties);
router.get("/by-property/:category/:propertyId", authMiddleware, getDeletedPropertyListing);
router.delete("/:id", authMiddleware, purgeDeletedProperty);

export default router;
