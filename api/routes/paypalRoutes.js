import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
import {
  createOrder,
  createProduct,
  createSubscriptionPlan,
  createSubscription,
  getSubscriptionStatus,
  cancelSubscription
} from '../controllers/paypalController.js';

const router = express.Router();


/* router.post("/gerar_new_site", authMiddleware, newsite); */
router.get("/", createOrder);

router.get("/teste", (req, res) => res.send("rota ok"));

// ========== PAGAMENTO ÚNICO ==========
router.post('/pagamento/criar', createOrder);

// ========== ASSINATURA RECORRENTE ==========
// USO NORMAL:
// Criar assinatura para cliente
router.post('/assinatura/criar', createSubscription);

// Verificar status da assinatura
router.get('/assinatura/:subscriptionId', getSubscriptionStatus);

// Cancelar assinatura
router.post('/assinatura/:subscriptionId/cancelar', cancelSubscription);

//## Configurando plano recorrente 
// 1. Criar produto
router.post('/assinatura/setup/produto', createProduct);

// 2. Criar plano (após ter o product_id)
router.post('/assinatura/setup/plano', createSubscriptionPlan);


export default router;