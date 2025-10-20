import express from "express";
import { register, login, resetpasswd, confirmResetPassword } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/reset-password", resetpasswd)
router.post("/reset-password/confirm", confirmResetPassword);

export default router;
