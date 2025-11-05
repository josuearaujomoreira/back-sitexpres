import express from "express";
import { getSites, newsite, jobStatus, check_id_projeto, testecret_domin, list_don, get_dominio, getPromts } from "../controllers/siteController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
const router = express.Router();



/* router.post("/gerar_new_site", authMiddleware, newsite); */
router.post("/gerar_new_site", upload.single("logo"), newsite);
router.get("/job-status/:jobId", authMiddleware, jobStatus);  //gerando site assincrono
router.get("/", authMiddleware, getSites);
router.get("/teste", (req, res) => res.send("rota ok"));
router.get("/get_dominio/:id_projeto", authMiddleware, get_dominio);
router.get("/list_sites", authMiddleware, getSites);
router.get("/list_prompt/:id_projeto", authMiddleware, getPromts);
router.get("/check_id_projeto/:id_projeto", check_id_projeto);
router.post("/testedom", testecret_domin);

export default router;
