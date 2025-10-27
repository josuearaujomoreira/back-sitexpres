import express from "express";
import { getSites, newsite, jobStatus, check_id_projeto } from "../controllers/siteController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
const router = express.Router();



/* router.post("/gerar_new_site", authMiddleware, newsite); */
router.post("/gerar_new_site", upload.single("logo"), newsite);
router.get("/job-status/:jobId", authMiddleware, jobStatus);  //gerando site assincrono
router.get("/", authMiddleware, getSites);
router.get("/teste", (req, res) => res.send("rota ok"));
router.get("/check_id_projeto/:id_projeto", check_id_projeto);

export default router;
