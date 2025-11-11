import express from "express";
import { register, login, resetpasswd, confirmResetPassword, verifyToken } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/reset-password", resetpasswd)
router.post("/confirm_pass", confirmResetPassword);
router.get('/verify', verifyToken);

export default router;
