import express from "express";
import { getSites, newsite } from "../controllers/siteController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/gerar_new_site", authMiddleware, newsite);
router.get("/", authMiddleware, getSites);

export default router;
