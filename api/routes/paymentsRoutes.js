import express from "express";
import { createOrder} from "../controllers/paypalController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
const router = express.Router();



/* router.post("/gerar_new_site", authMiddleware, newsite); */
router.get("/", createOrder);


export default router;
