import express from "express";
import { getSites } from "../controllers/siteController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, getSites);

export default router;
