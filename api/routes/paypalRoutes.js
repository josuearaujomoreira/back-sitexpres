import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
import {
  createOrder,
  createProduct,
  createSubscriptionPlan,
  createSubscription,
  getSubscriptionStatus,
  cancelSubscription,
  webhook
} from '../controllers/paypalController.js';

const router = express.Router();

router.post("/webhook", webhook);
router.get("/", createOrder);

router.get("/teste", (req, res) => res.send("rota ok"));

router.post('/pagamento/criar', createOrder);

router.post('/assinatura/criar', createSubscription);

router.get('/assinatura/:subscriptionId', getSubscriptionStatus);

router.post('/assinatura/:subscriptionId/cancelar', cancelSubscription);

router.post('/assinatura/setup/produto', createProduct);

router.post('/assinatura/setup/plano', createSubscriptionPlan);

router.get('/assinatura/setup/produto', createProduct);

export default router;