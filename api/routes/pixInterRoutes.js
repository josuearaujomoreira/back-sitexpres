import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
import {
  createOrder,
} from './pix_inter.js';

const router = express.Router();

/* router.post("/gerar_new_site", authMiddleware, newsite); */
router.get("/", createOrder);


export default router;